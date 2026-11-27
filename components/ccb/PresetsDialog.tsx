import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import SegmentedControl from '@/components/ui/SegmentedControl';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import XButton from '@/components/ui/XButton';
import { useCloudSync } from '@/lib/cloud-account/SyncProvider';
import {
  CCB_PRESETS_KEY, PRESET_CODE_LENGTH, PRESET_NAME_LENGTH, decodeCcbPreset, encodeCcbPreset,
  parseCcbPreset, readCcbPresets, validatePresetContents, writeCcbPresets,
  type CcbPreset, type PresetContents, type PresetRisks, type SavedCcbPreset,
} from '@/lib/ccb/presets';
import { TEAM_PRESET_KEY, type TeamPresetMember } from '@/lib/ccb/teamPreset';
import type { BattleplanSeason } from '@/lib/ccb/types';
import BattleplanDialog from './BattleplanDialog';
import styles from './PresetsDialog.module.css';

export interface PresetBoard {
  seasons: BattleplanSeason[];
  currentRisks: PresetRisks;
  onLoadRisks: (risks: PresetRisks) => void;
  onClose: () => void;
}

const TABS = [
  { value: 'saved', label: 'Saved presets' },
  { value: 'save', label: 'Save current' },
  { value: 'import', label: 'Import code' },
] as const;
const SCOPES = [
  { value: 'both', label: 'Risks + operators' },
  { value: 'risks', label: 'Risks only' },
  { value: 'operators', label: 'Operators only' },
] as const;

export default function PresetsDialog({ seasons, currentRisks, onLoadRisks, onClose, operators, currentTeam, onLoadTeam }: PresetBoard & {
  operators: string[];
  currentTeam: TeamPresetMember[] | null;
  onLoadTeam: (members: TeamPresetMember[]) => void;
}) {
  const { remote } = useCloudSync();
  const identity = remote?.profile ? { id: remote.user.id, username: remote.profile.username } : null;
  const identityKey = identity ? JSON.stringify([identity.id, identity.username]) : null;
  const tabsId = useId();
  const [tab, setTab] = useState<typeof TABS[number]['value']>('saved');
  const [scope, setScope] = useState<typeof SCOPES[number]['value']>(currentTeam ? 'both' : 'risks');
  const [presets, setPresets] = useState<SavedCcbPreset[]>([]);
  const [name, setName] = useState('');
  const [importCode, setImportCode] = useState('');
  const [shareId, setShareId] = useState<string | null>(null);
  const [includeNameFor, setIncludeNameFor] = useState<string | null>(null);
  const [shareCode, setShareCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const loadButton = useRef<HTMLButtonElement>(null);
  const ownName = identity && includeNameFor === identityKey ? identity.username : undefined;

  useEffect(() => {
    function syncPresets(event?: StorageEvent) {
      if (event && event.key !== null && event.key !== CCB_PRESETS_KEY && event.key !== TEAM_PRESET_KEY) return;
      try {
        setPresets(readCcbPresets(localStorage, operators));
      } catch {
        setError('Saved presets could not be read from this browser.');
      }
    }
    syncPresets();
    window.addEventListener('storage', syncPresets);
    return () => window.removeEventListener('storage', syncPresets);
  }, [operators]);

  useEffect(() => {
    if (focusId && tab === 'saved') {
      loadButton.current?.focus();
      setFocusId(null);
    }
  }, [focusId, tab]);

  function updateSaved(update: (current: SavedCcbPreset[]) => SavedCcbPreset[]) {
    const current = readCcbPresets(localStorage, operators);
    const next = update(current);
    if (next !== current) writeCcbPresets(localStorage, next);
    setPresets(next);
    return next;
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!name.trim()) return;
    let contents: PresetContents;
    if (scope === 'risks') contents = { risks: currentRisks };
    else if (!currentTeam) return;
    else contents = scope === 'operators' ? { operators: currentTeam } : { risks: currentRisks, operators: currentTeam };
    try {
      const preset = { ...parseCcbPreset({ name, ...contents }), id: crypto.randomUUID() };
      updateSaved(current => [preset, ...current]);
      setName('');
      setMessage(`Saved ${preset.name}.`);
      setTab('saved');
      setFocusId(preset.id);
    } catch {
      setError('This browser could not save the preset.');
    }
  }

  function importPreset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    let preset: CcbPreset;
    try {
      preset = decodeCcbPreset(importCode);
      validatePresetContents(preset, seasons, operators);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The preset could not be imported.');
      return;
    }
    try {
      const fingerprint = JSON.stringify(preset);
      const imported = { ...preset, id: crypto.randomUUID(), imported: true };
      const matches = ({ id, imported, ...contents }: SavedCcbPreset) => imported && JSON.stringify(contents) === fingerprint;
      const saved = updateSaved(current => current.some(matches) ? current : [imported, ...current]);
      const existing = saved.find(matches)!;
      setImportCode('');
      setFocusId(existing.id);
      setMessage(existing.id === imported.id ? `Imported ${preset.name}.` : `${preset.name} is already saved.`);
      setTab('saved');
    } catch {
      setError('This browser could not save the imported preset.');
    }
  }

  function load(preset: SavedCcbPreset) {
    setMessage('');
    try {
      validatePresetContents(preset, seasons, operators);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The preset could not be loaded.');
      return;
    }
    if (preset.risks) onLoadRisks(preset.risks);
    if (preset.operators) onLoadTeam(preset.operators);
    onClose();
  }

  function remove(preset: SavedCcbPreset) {
    setError('');
    setMessage('');
    try {
      updateSaved(current => current.filter(row => row.id !== preset.id));
      if (shareId === preset.id) selectShare(null);
      setMessage(`Removed ${preset.name}.`);
    } catch {
      setError('This browser could not remove the preset.');
    }
  }

  function selectShare(id: string | null) {
    setShareId(id);
    setIncludeNameFor(null);
    setShareCode('');
    setMessage('');
    setError('');
  }

  async function copy(preset: SavedCcbPreset) {
    setError('');
    let code: string;
    try {
      code = encodeCcbPreset({ ...preset, creator: preset.imported ? preset.creator : ownName });
      setShareCode(code);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The share code could not be created.');
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setMessage('Preset code copied.');
    } catch {
      setMessage('Select the preset code below to copy it.');
    }
  }

  return <BattleplanDialog label="Presets" onClose={onClose}>
    <div className={styles.content}>
      <Tabs id={tabsId} label="Preset actions" options={TABS} value={tab} onChange={value => {
        selectShare(null);
        setTab(value);
      }} />
      {error && <p className="notice notice-danger" role="alert">{error}</p>}
      {message && <p className="hint" role="status">{message}</p>}
      {tab === 'saved' && <div {...tabPanelProps(tabsId, 'saved')}>
        {presets.length ? <ul className={styles.list}>
          {presets.map(preset => {
            const season = seasons.find(season => season.id === preset.risks?.seasonId);
            const map = season?.maps.find(map => map.id === preset.risks?.mapId);
            const type = preset.risks ? (preset.operators ? SCOPES[0].label : SCOPES[1].label) : SCOPES[2].label;
            return <li key={preset.id} className={styles.listItem}>
              <div className={styles.summary}>
                <div className={styles.identity}>
                  <strong>{preset.name}</strong>
                  <span className="hint">{type}{map && ` · ${map.name}`}{preset.operators && ` · ${preset.operators.length} operators`}</span>
                  {preset.imported && <span className="hint" title="Creator as supplied by the share code">Imported from {preset.creator ?? 'Anonymous'}</span>}
                </div>
                <div className={styles.actions}>
                  <button className="ghost btn-sm" type="button" aria-label={`Load ${preset.name}`}
                    ref={focusId === preset.id ? loadButton : undefined} onClick={() => load(preset)}>Load</button>
                  <button className="ghost btn-sm" type="button" aria-label={`Share ${preset.name}`}
                    aria-expanded={shareId === preset.id} onClick={() => selectShare(shareId === preset.id ? null : preset.id)}>Share</button>
                  <XButton label={`Remove preset ${preset.name}`} onClick={() => remove(preset)} />
                </div>
              </div>
              {shareId === preset.id && <div className={styles.content}>
                {!preset.imported && identity && <label className="check">
                  <input type="checkbox" checked={includeNameFor === identityKey} onChange={event => {
                    setIncludeNameFor(event.target.checked ? identityKey : null);
                    setShareCode('');
                    setMessage('');
                  }} />
                  Include my Arkpedia name ({identity.username})
                </label>}
                {!preset.imported && !identity && <p className="hint">This preset will be shared as Anonymous.</p>}
                <div><button className="primary btn-sm" type="button" onClick={() => void copy(preset)}>Copy code</button></div>
                {shareCode && <label className={styles.field}>Share code
                  <textarea readOnly rows={3} value={shareCode} onFocus={event => event.currentTarget.select()} />
                </label>}
              </div>}
            </li>;
          })}
        </ul> : <p className="hint">No saved presets yet. Save your current setup or import a code.</p>}
      </div>}
      {tab === 'save' && <form {...tabPanelProps(tabsId, 'save')} className={styles.content} onSubmit={save}>
        <label className={styles.field}>Preset name
          <input value={name} onChange={event => setName(event.target.value)} maxLength={PRESET_NAME_LENGTH} required />
        </label>
        <SegmentedControl label="Preset contents" value={scope} onChange={setScope} options={SCOPES} />
        <p className="hint">{scope !== 'risks' && !currentTeam ? 'Add operators and wait for their builds to load to save a team.' : 'Presets are saved in this browser.'}</p>
        <div><button className="primary btn-sm" type="submit" disabled={!name.trim() || scope !== 'risks' && !currentTeam}>Save preset</button></div>
      </form>}
      {tab === 'import' && <form {...tabPanelProps(tabsId, 'import')} className={styles.content} onSubmit={importPreset}>
        <label className={styles.field}>Preset code
          <textarea value={importCode} onChange={event => setImportCode(event.target.value)} rows={4}
            spellCheck={false} autoCapitalize="none" maxLength={PRESET_CODE_LENGTH} required />
        </label>
        <p className="hint">Import adds a saved preset. Load it from Saved presets when you’re ready.</p>
        <div><button className="primary btn-sm" type="submit" disabled={!importCode.trim()}>Import preset</button></div>
      </form>}
    </div>
  </BattleplanDialog>;
}
