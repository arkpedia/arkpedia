import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { normalizeTitle } from '@/lib/music-guesser/game';
import type { SongChoice } from '@/lib/music-guesser/game';
import { ANSWER_MODES } from '@/lib/music-guesser/options';
import { DEFAULT_MUSIC_SETTINGS, isGlobalGroup, MUSIC_CATEGORIES } from '@/lib/music-guesser/selection';
import type { MusicGroup, MusicSettings } from '@/lib/music-guesser/selection';
import styles from '@/styles/games/song-guesser.module.css';

interface Props {
  songs: SongChoice[];
  groups: MusicGroup[];
  settings: MusicSettings;
  setSettings: Dispatch<SetStateAction<MusicSettings>>;
  asOf: string;
  count: number;
  ready: boolean;
  start: () => void;
}

export function MusicSetup({ songs, groups, settings, setSettings, asOf, count, ready, start }: Props) {
  const [query, setQuery] = useState('');
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const song of songs) for (const id of song.groupIds || []) {
      result.set(id, (result.get(id) || 0) + 1);
    }
    return result;
  }, [songs]);
  const musicGroups = groups.filter((group) => counts.has(group.id));
  const needle = normalizeTitle(query);
  const matches = (group: MusicGroup) => normalizeTitle(`${group.name} ${group.search || ''}`).includes(needle);
  const visible = musicGroups.filter(matches);
  const excluded = new Set(settings.excluded);
  const available = (group: MusicGroup) => settings.includeCn || isGlobalGroup(group, asOf);
  const selected = (group: MusicGroup) => available(group) && !excluded.has(group.id);
  const rules = ANSWER_MODES.find((item) => item.id === settings.mode)!;
  function choose(ids: string[], enabled: boolean) {
    setSettings((current) => {
      const next = new Set(current.excluded);
      for (const id of ids) { if (enabled) next.delete(id); else next.add(id); }
      return { ...current, excluded: [...next] };
    });
  }
  function chooseOnlyResults() {
    setSettings((current) => {
      const next = new Set([...current.excluded, ...musicGroups.map((group) => group.id)]);
      for (const group of visible) next.delete(group.id);
      return { ...current, excluded: [...next] };
    });
  }

  return <div className={styles.setup}>
    <div className={styles.setupBar} aria-label="Round settings">
      <span className={styles.clipStartLabel}>Clip start</span>
      <fieldset className={styles.poolChoice}>
        <legend className={styles.srOnly}>Clip start position</legend>
        <label data-selected={settings.startPosition === 'beginning'}><input type="radio" name="clip-start" checked={settings.startPosition === 'beginning'} onChange={() => setSettings((current) => ({ ...current, startPosition: 'beginning' }))} />Beginning</label>
        <label data-selected={settings.startPosition === 'middle'}><input type="radio" name="clip-start" checked={settings.startPosition === 'middle'} onChange={() => setSettings((current) => ({ ...current, startPosition: 'middle' }))} />Middle</label>
        <label data-selected={settings.startPosition === 'random'}><input type="radio" name="clip-start" checked={settings.startPosition === 'random'} onChange={() => setSettings((current) => ({ ...current, startPosition: 'random' }))} />Random</label>
      </fieldset>
        <label className={styles.cnSetting}><span>Include CN</span><input type="checkbox" role="switch" aria-label="Include CN" checked={settings.includeCn} onChange={(event) => setSettings((current) => ({ ...current, includeCn: event.target.checked }))} /></label>
      <button className={styles.action} onClick={start} disabled={!ready || !count}>{!ready ? 'Loading…' : count ? 'Start listening' : 'Select music to start'}</button>
    <div className={styles.setupFooter}>
      <details className={styles.rules}><summary>How to play</summary><p>{rules.help}</p><p>{rules.cc}</p><p>Choose any clip length; skips are free. Middle samples the middle half, Random samples anywhere with 30 seconds left. Clues share one starting point.</p></details>
      <button className={styles.resetSettings} onClick={() => { setSettings({ ...DEFAULT_MUSIC_SETTINGS, excluded: [] }); setQuery(''); }}>Reset settings</button>
    </div>
    </div>
    <section className={styles.configuration} aria-label="Music selection">
      <div className={styles.musicPicker}>
        <label className={styles.srOnly} htmlFor="music-selection-search">Find events, chapters, EPs or releases</label>
        <input id="music-selection-search" className={styles.selectionSearch} type="search" placeholder="Search events, chapters, EPs…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className={styles.selectionTools}>
          <button type="button" onClick={() => choose(visible.map((group) => group.id), true)}>{query ? 'Select results' : 'Select all'}</button>
          <button type="button" onClick={() => choose(visible.map((group) => group.id), false)}>{query ? 'Clear results' : 'Clear all'}</button>
          {query && <button type="button" onClick={chooseOnlyResults} disabled={!visible.length}>Only results</button>}
        </div>
        {MUSIC_CATEGORIES.map(([kind, label]) => {
          const items = visible.filter((group) => group.kind === kind);
          if (!items.length) return null;
          const section = musicGroups.filter((group) => group.kind === kind);
          const selectable = section.filter(available);
          return <MusicCategory key={`${kind}:${Boolean(query)}`} kind={kind} label={label} initiallyOpen={Boolean(query)}
            selected={selectable.filter(selected).length} total={selectable.length} disabled={!selectable.length}
            onToggle={(enabled) => choose(section.map((group) => group.id), enabled)}>
              <div className={styles.groupChoices}>{items.map((group) => <label key={group.id} className={styles.groupChoice} data-disabled={!available(group)}>
                <input type="checkbox" aria-label={group.name} checked={selected(group)} disabled={!available(group)} onChange={(event) => choose([group.id], event.target.checked)} />
                <span>{group.name}<small>{counts.get(group.id)} {counts.get(group.id) === 1 ? 'track' : 'tracks'}{!isGlobalGroup(group, asOf) && <em>CN</em>}</small></span>
              </label>)}</div>
          </MusicCategory>;
        })}
        {!visible.length && <div className={styles.noMatches} role="status">
          <p>No releases match “{query}”.</p>
          <button type="button" onClick={() => setQuery('')}>Clear search</button>
        </div>}
      </div>
    </section>

  </div>;
}


function MusicCategory({ kind, label, initiallyOpen, selected, total, disabled, onToggle, children }: {
  kind: string; label: string; initiallyOpen: boolean; selected: number; total: number; disabled: boolean;
  onToggle: (enabled: boolean) => void; children: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const checkbox = useRef<HTMLInputElement>(null);
  const mixed = selected > 0 && selected < total;
  useEffect(() => { if (checkbox.current) checkbox.current.indeterminate = mixed; }, [mixed]);
  return <section className={styles.musicCategory}>
    <div className={styles.categoryHeader}>
      <label className={styles.categoryCheck}>
        <input ref={checkbox} type="checkbox" aria-label={`Select all ${label.toLowerCase()}`} checked={total > 0 && selected === total} disabled={disabled} onChange={(event) => onToggle(event.target.checked)} />
      </label>
      <button type="button" className={styles.categoryToggle} aria-expanded={open} aria-controls={`music-category-${kind}`} onClick={() => setOpen((current) => !current)}>
        <strong>{label}</strong><span>{selected} / {total}</span><span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
    </div>
    <div id={`music-category-${kind}`} className={styles.categoryBody} hidden={!open}>{children}</div>
  </section>;
}
