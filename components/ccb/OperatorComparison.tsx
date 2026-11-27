import Link from 'next/link';
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { ContentArt, ContentImg } from '@/components/content/ContentImage';
import InfoPopover from '@/components/ui/InfoPopover';
import SearchInput from '@/components/ui/SearchInput';
import SegmentedControl from '@/components/ui/SegmentedControl';
import StyledSelect from '@/components/ui/StyledSelect';
import XButton from '@/components/ui/XButton';
import { useAccount, type AccountRecord } from '@/lib/account/accountStore';
import { accountBuild, calculateOperatorBuild } from '@/lib/ccb/operatorBuild';
import type { TeamBuild, TeamPresetMember } from '@/lib/ccb/teamPreset';
import type { Contract, OperatorBuildData } from '@/lib/ccb/types';
import { getClassIconPath } from '@/lib/operators/classBranchIcons';
import { getOperatorSearchResults } from '@/lib/operators/operatorSearch';
import { clampInteger } from '@/lib/operators/operatorStats';
import BattleplanDialog from './BattleplanDialog';
import PresetsDialog, { type PresetBoard } from './PresetsDialog';
import StatComparison, { StatGlyph, formatStatValue, statChange } from './StatComparison';
import shared from './Battleplan.module.css';
import styles from './OperatorComparison.module.css';

interface Member {
  name: string;
  custom?: { build: TeamBuild; accountKey?: string; moduleId?: string };
}

type OperatorRecord = OperatorBuildData | 'loading' | 'error';

const TEAM_COLUMNS = [
  { key: 'hp', label: 'HP' },
  { key: 'atk', label: 'ATK' },
  { key: 'def', label: 'DEF' },
  { key: 'res', label: 'RES' },
  { key: 'dp', label: 'DP cost' },
  { key: 'block', label: 'Block' },
  { key: 'redeploy', label: 'Redeploy (s)' },
  { key: 'interval', label: 'Interval (s)' },
] as const;

export default function OperatorComparison({ operators, icons, contracts, presetBoard }: {
  operators: string[];
  icons: Record<string, string>;
  contracts: Contract[];
  presetBoard: PresetBoard | null;
}) {
  const account = useAccount();
  const [query, setQuery] = useState('');
  const [suggestUp, setSuggestUp] = useState(false);
  const [team, setTeam] = useState<Member[]>([]);
  const [active, setActive] = useState('');
  const [editing, setEditing] = useState(false);
  const [records, setRecords] = useState(new Map<string, OperatorRecord>());
  const requests = useRef(new Map<string, AbortController>());
  const search = useRef<HTMLInputElement>(null);
  const editButtons = useRef(new Map<string, HTMLButtonElement>());
  const titleId = useId();

  useEffect(() => {
    const pending = requests.current;
    return () => {
      for (const request of pending.values()) request.abort();
      pending.clear();
    };
  }, []);

  async function fetchOperator(name: string) {
    if (requests.current.has(name)) return;
    const controller = new AbortController();
    requests.current.set(name, controller);
    setRecords(current => new Map(current).set(name, 'loading'));
    try {
      const response = await fetch(`/api/ccb/operator/${encodeURIComponent(name)}`, { signal: controller.signal });
      if (!response.ok) throw new Error('Operator stats are unavailable');
      const record = await response.json() as OperatorBuildData;
      if (!controller.signal.aborted) setRecords(current => new Map(current).set(name, record));
    } catch {
      if (!controller.signal.aborted) setRecords(current => new Map(current).set(name, 'error'));
    } finally {
      if (requests.current.get(name) === controller) requests.current.delete(name);
    }
  }

  function dropOperator(name: string) {
    requests.current.get(name)?.abort();
    requests.current.delete(name);
    setRecords(current => {
      const next = new Map(current);
      next.delete(name);
      return next;
    });
  }

  function addOperator(name: string) {
    if (team.some(row => row.name === name)) return;
    setTeam(current => [...current, { name }]);
    setActive(name);
    setQuery('');
    void fetchOperator(name);
  }

  function removeOperator(name: string, event: MouseEvent<HTMLButtonElement>) {
    const index = team.findIndex(row => row.name === name);
    const next = team[index + 1] ?? team[index - 1];
    if (event.detail === 0) {
      (next ? editButtons.current.get(next.name) : search.current)?.focus({ preventScroll: true });
    }
    if (name === active) setActive(next?.name ?? '');
    setTeam(current => current.filter(row => row.name !== name));
    dropOperator(name);
  }

  function editOperator(name: string) {
    setActive(name);
    setEditing(true);
  }

  function changeBuild(build: TeamBuild | null) {
    setTeam(current => current.map(row => row.name === active ? {
      name: row.name,
      custom: build ? { build, accountKey: row.custom && row.custom.accountKey === undefined ? undefined : accountKey } : undefined,
    } : row));
  }

  const accountKey = `${account?.server ?? ''}/${account?.importedAt ?? ''}`;
  const members = team.map(row => {
    const record = records.get(row.name);
    const operator = typeof record === 'object' ? record : undefined;
    const owned = account?.operatorBuilds?.[row.name];
    const custom = row.custom && (row.custom.accountKey === undefined || row.custom.accountKey === accountKey) ? row.custom : null;
    let build = operator ? custom?.build ?? accountBuild(operator, owned) : undefined;
    if (operator && build && custom?.moduleId) {
      build = { ...build, moduleIndex: operator.modules.findIndex(module => module.moduleId === custom.moduleId) };
    }
    return { ...row, record, operator, build, stats: operator && build ? calculateOperatorBuild(operator, build, contracts) : null };
  });
  const selected = members.find(row => row.name === active);
  const teamNames = new Set(team.map(row => row.name));
  const matches = !query.trim() ? [] : getOperatorSearchResults(
    operators.filter(name => !teamNames.has(name)).map(name => ({ name })), query,
  ).map(row => row.name);
  const currentTeam = presetBoard && members.length && members.every(row => row.build !== undefined)
    ? members.flatMap(row => row.build ? [{
      name: row.name,
      build: row.build,
      moduleId: row.operator?.modules[row.build.moduleIndex]?.moduleId,
    }] : [])
    : null;

  function loadTeam(preset: TeamPresetMember[]) {
    const next = new Set(preset.map(row => row.name));
    for (const member of team) if (!next.has(member.name)) dropOperator(member.name);
    setTeam(preset.map(({ name, build, moduleId }) => ({ name, custom: { build, moduleId } })));
    setActive(preset[0]?.name ?? '');
    setQuery('');
    for (const { name } of preset) {
      const record = records.get(name);
      if (!record || record === 'error') void fetchOperator(name);
    }
  }

  function searchOperators(value: string) {
    setQuery(value);
    const field = search.current?.getBoundingClientRect();
    if (!field) return;
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const below = top + (viewport?.height ?? window.innerHeight) - field.bottom;
    // Leave enough room for a few result rows when the keyboard or viewport crowds the field.
    setSuggestUp(below < 160 && field.top - top > below);
  }

  return <section className={`panel op-section ${styles.team}`} aria-labelledby={titleId}>
    <div className={styles.title}>
      <h2 id={titleId}>Operator team</h2>
      <span className={styles.count} role="status">{team.length}<span className="visually-hidden"> operators</span></span>
      <InfoPopover label="About team stats">
        <p>Stats apply the selected contracts to each operator’s build, tile and deployment time. Skills, talents and module combat effects are excluded.</p>
      </InfoPopover>
    </div>
    <SearchInput
      inputRef={search}
      label="Search operators"
      placeholder="Add an operator…"
      value={query}
      onChange={searchOperators}
      upward={suggestUp}
      suggestions={matches}
      getKey={name => name}
      renderSuggestion={name => <span className={shared.suggestion}>
        {icons[name] && <ContentImg src={icons[name]} alt="" width={28} height={28} />}
        {name}
      </span>}
      onPick={addOperator}
      suggestLabel="Matching operators"
      emptyText="No matching operators"
    />
    {members.length ? <>
      <table className={styles.teamTable} aria-label="Team stat comparison" role="table">
        <thead className={styles.teamHeading} role="rowgroup"><tr role="row">
          <th scope="col" role="columnheader">Operator</th>
          {TEAM_COLUMNS.map(({ key, label }) => <th key={key} scope="col" role="columnheader">
            <span className={styles.columnLabel}><StatGlyph stat={key} />{label}</span>
          </th>)}
        </tr></thead>
        <tbody className={styles.teamBody} role="rowgroup">{members.map(({ name, operator, record, stats }) => {
          const classIcon = getClassIconPath(operator?.className);
          return <tr key={name} className={styles.teamRow} data-active={name === active || undefined} role="row">
            <th scope="row" role="rowheader">
              <div className={styles.member}>
                <button
                  type="button"
                  className={`btn-bare ${styles.memberButton}`}
                  aria-label={`Edit ${name} build`}
                  aria-haspopup="dialog"
                  ref={button => { if (button) editButtons.current.set(name, button); else editButtons.current.delete(name); }}
                  onClick={() => editOperator(name)}
                >
                  {icons[name] && <ContentImg className={styles.portrait} src={icons[name]} alt="" width={32} height={32} />}
                  <span className={styles.memberIdentity}>
                    <span className={styles.memberName}>{name}</span>
                    {operator?.className && <span className={styles.memberMeta}>
                      {classIcon && <ContentArt src={classIcon} className={`mode-mark ${styles.classIcon}`} aria-hidden="true" />}
                      <span>{operator.className}{stats && ` · E${stats.phase.elite} Lv ${stats.level}`}</span>
                    </span>}
                  </span>
                </button>
                <XButton label={`Remove ${name}`} onClick={event => removeOperator(name, event)} />
              </div>
            </th>
            {stats ? TEAM_COLUMNS.map(({ key, label }) => {
              const change = statChange(stats.original[key], stats.modified[key]);
              return <td role="cell" className={styles.metric} key={key}>
                <span className={styles.mobileLabel} aria-hidden="true">{label}</span>
                <span>{formatStatValue(stats.modified[key])}</span>
                <small className={change?.direction} aria-hidden={!change}>{change?.text}</small>
              </td>;
            }) : <td role="cell" className={styles.rowStatus} colSpan={TEAM_COLUMNS.length}>
              {record === 'error' ? <button className="ghost btn-sm" type="button" aria-label={`Retry ${name}`} onClick={() => void fetchOperator(name)}>Retry stats</button>
                : record === 'loading' || !record ? <span role="status">Loading stats…</span> : 'Stats unavailable'}
            </td>}
          </tr>;
        })}</tbody>
      </table>
      {editing && selected && <BattleplanDialog wide label={`${selected.name} build`} onClose={() => setEditing(false)}>
        {selected.operator && selected.build && selected.stats ? <BuildEditor
          operator={selected.operator}
          icon={icons[selected.name]}
          account={account}
          build={selected.build}
          stats={selected.stats}
          onChange={changeBuild}
        /> : <p className={shared.note}>{selected.record === 'error' ? 'Stats unavailable' : 'Loading stats…'}</p>}
      </BattleplanDialog>}
    </> : <p className={shared.empty}>Add operators to compare their stats under the selected contracts.</p>}
    {presetBoard && <PresetsDialog {...presetBoard} operators={operators} currentTeam={currentTeam} onLoadTeam={loadTeam} />}
  </section>;
}

function BuildEditor({ operator, icon, account, build, stats, onChange }: {
  operator: OperatorBuildData;
  icon?: string;
  account: AccountRecord | null;
  build: TeamBuild;
  stats: NonNullable<ReturnType<typeof calculateOperatorBuild>>;
  onChange: (value: TeamBuild | null) => void;
}) {
  const owned = account?.operatorBuilds?.[operator.name];
  const { phase, level, moduleMinLevel, moduleAvailable, activeModule, moduleStage, tile, original, modified } = stats;
  function update(patch: Partial<TeamBuild>) { onChange({ ...build, ...patch }); }
  return <>
    <div className={shared.row}>
      {icon && <ContentImg src={icon} alt="" width={40} height={40} />}
      <button className="ghost btn-sm" type="button" onClick={() => onChange(null)}>Reset to {owned ? 'account' : 'E0 Lv 1'}</button>
    </div>
    <div className={styles.editorGrid}>
      <div className={styles.editorFields}>
        <p className={`hint ${shared.note}`}>{owned ? `Default: imported ${account?.server} build.` : <>Default: E0 Lv 1. <Link href="/account">Import account</Link></>} {owned && (owned.trust === undefined || owned.equippedModule === undefined) && 'This older import lacks trust or equipped-module data. Set them below or import again.'}</p>
        <div className={shared.fields}>
          <label>Promotion<StyledSelect label="Operator promotion" value={String(phase.elite)} options={(operator.stats?.phases ?? []).map(row => ({ value: String(row.elite), label: `Elite ${row.elite}` }))} onChange={value => update({ elite: Number(value), level: 1, moduleIndex: -1 })} /></label>
          <label>Level<input aria-label="Operator level" type="number" min={phase.minLevel} max={phase.maxLevel} value={level} onChange={event => update({ level: clampInteger(event.target.valueAsNumber, phase.minLevel, phase.maxLevel) })} /></label>
          <label>Potential<StyledSelect label="Operator potential" value={String(build.potential)} options={Array.from({ length: operator.potential.levels.length ? 6 : 1 }, (_, index) => ({ value: String(index + 1), label: `P${index + 1}` }))} onChange={value => update({ potential: Number(value) })} /></label>
          <label>Trust (%)<input aria-label="Operator trust" type="number" min={0} max={200} value={build.trust} onChange={event => update({ trust: clampInteger(event.target.valueAsNumber, 0, 200) })} /></label>
          <label className={shared.wide}>Module{!moduleAvailable && operator.modules.some(row => row.type === 'Upgrade') && ` · E2 Lv ${moduleMinLevel}`}<StyledSelect label="Operator module" value={String(activeModule ? build.moduleIndex : -1)} disabled={!moduleAvailable} options={[{ value: '-1', label: 'None' }, ...operator.modules.flatMap((row, index) => row.type === 'Upgrade' ? [{ value: String(index), label: row.name ?? `Module ${index}` }] : [])]} onChange={value => update({ moduleIndex: Number(value), moduleStage: 0 })} /></label>
          {activeModule && <label>Module level<StyledSelect label="Module level" value={String(moduleStage)} options={activeModule.stages.map((_, index) => ({ value: String(index), label: String(index + 1) }))} onChange={value => update({ moduleStage: Number(value) })} /></label>}
        </div>
        <div className={shared.row}>
          {operator.bothTiles && <SegmentedControl label="Deployment tile" value={tile} onChange={value => update({ tile: value })} options={[{ value: 'ground', label: 'Ground' }, { value: 'high', label: 'High tile' }]} />}
          <label className={shared.inlineField}>Seconds after deployment<input aria-label="Seconds after deployment" type="number" min={0} max={9999} value={build.elapsed} onChange={event => update({ elapsed: clampInteger(event.target.valueAsNumber, 0, 9999) })} /></label>
        </div>
      </div>
      <div className={styles.editorStats}><StatComparison label={`${operator.name} stat comparison`} original={original} modified={modified} /></div>
    </div>
  </>;
}
