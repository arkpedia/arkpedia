import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAccount } from '@/lib/account/accountStore';
import { getOperatorSearchResults } from '@/lib/operators/operatorSearch';
import { getBaseStats, getTrustBonus, applyModuleStatBonuses, parseModuleStatBonuses, clampInteger, type StatValues } from '@/lib/operators/operatorStats';
import type { Contract, OperatorBuildData } from '@/lib/ccb/types';
import { modifiedStats } from '@/lib/ccb/modifiers';
import SearchInput from '@/components/ui/SearchInput';
import StyledSelect from '@/components/ui/StyledSelect';
import SegmentedControl from '@/components/ui/SegmentedControl';
import StatComparison from './StatComparison';
import styles from './Battleplan.module.css';

export default function OperatorComparison({ operators, contracts }: { operators: string[]; contracts: Contract[] }) {
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [operator, setOperator] = useState<OperatorBuildData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setOperator(null); setError('');
    if (!name) return;
    const controller = new AbortController();
    fetch(`/api/ccb/operator/${encodeURIComponent(name)}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Could not load operator stats.');
      setOperator(await response.json());
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [name]);
  const matches = getOperatorSearchResults(operators.map(name => ({ name })), query).map(row => row.name);
  return <section className={`panel op-section ${styles.comparison}`}>
    <h2>Operator</h2>
    <SearchInput label="Search operators" placeholder="Search all operators…" value={query} onChange={setQuery} suggestions={matches} getKey={row => row} renderSuggestion={row => row} onPick={row => { setName(row); setQuery(row); }} suggestLabel="Matching operators" emptyText="No matching operators" />
    {!name ? <p className={styles.empty}>Select an operator to compare their stats.</p> : error ? <p role="alert">{error} <button type="button" className="ghost btn-sm" onClick={() => setName('')}>Choose again</button></p> : !operator ? <p role="status">Loading {name}…</p> : <BuildEditor key={operator.name} operator={operator} contracts={contracts} />}
  </section>;
}

function BuildEditor({ operator, contracts }: { operator: OperatorBuildData; contracts: Contract[] }) {
  const account = useAccount();
  const owned = account?.operatorBuilds?.[operator.name];
  const accountKey = `${account?.server}:${account?.importedAt}:${owned?.elite}:${owned?.level}:${owned?.potential}:${owned?.trust}:${owned?.equippedModule}`;
  const [custom, setCustom] = useState<{ key: string; elite: number; level: number; potential: number; trust: number; moduleIndex: number; moduleStage: number } | null>(null);
  const upgrades = operator.modules.map((row, index) => ({ row, index })).filter(({ row }) => row.type === 'Upgrade');
  const baseline = { elite: owned?.elite ?? 0, level: owned?.level ?? 1, potential: owned?.potential ?? 1, trust: owned?.trust ?? 0, moduleIndex: owned?.equippedModule != null ? upgrades[owned.equippedModule]?.index ?? -1 : -1, moduleStage: owned?.equippedModule != null ? owned.modules?.[owned.equippedModule] ?? 0 : 0 };
  const build = custom?.key === accountKey ? custom : baseline;
  const { trust, moduleIndex, moduleStage } = build;
  const [tileOverride, setTile] = useState<'ground' | 'high' | null>(null);
  const tile = tileOverride ?? (operator.position === 'Ranged' ? 'high' : 'ground');
  const [elapsed, setElapsed] = useState(0);
  const stats = operator.stats;
  if (!stats?.phases.length) return <p className={styles.empty}>Stats are not available for {operator.name} yet.</p>;
  const phase = stats.phases.find(row => row.elite === build.elite) ?? stats.phases[0];
  const level = clampInteger(build.level, phase.minLevel, phase.maxLevel);
  const base: StatValues = getBaseStats(phase, level);
  const bonus = getTrustBonus(stats, trust);
  for (const key of ['hp', 'atk', 'def'] as const) base[key] += bonus[key];
  let potentialAspd = 0;
  for (const row of operator.potential.levels) {
    if (row.level > build.potential) continue;
    const match = row.benefit.match(/^(DP cost|Redeployment time|ATK|DEF|Max HP|HP|RES|Attack Speed|ASPD)\s*([+-])\s*(\d+(?:\.\d+)?)/i);
    if (!match) continue;
    const key = ({ 'dp cost': 'dp', 'redeployment time': 'redeploy', atk: 'atk', def: 'def', hp: 'hp', 'max hp': 'hp', res: 'res' } as Record<string, keyof StatValues>)[match[1].toLowerCase()];
    if (key) base[key] += Number(match[3]) * (match[2] === '-' ? -1 : 1);
    else if (['attack speed', 'aspd'].includes(match[1].toLowerCase())) potentialAspd += Number(match[3]) * (match[2] === '-' ? -1 : 1);
  }
  const moduleMinLevel = operator.rarity === 6 ? 60 : operator.rarity === 5 ? 50 : 40;
  const moduleAvailable = phase.elite === 2 && level >= moduleMinLevel;
  const activeModule = moduleAvailable ? operator.modules[moduleIndex] : undefined;
  const moduleBonuses = parseModuleStatBonuses(activeModule?.stages[moduleStage]?.attributesIncreased);
  const original = { ...applyModuleStatBonuses(base, { ...moduleBonuses, aspd: potentialAspd + (moduleBonuses.aspd ?? 0) }), aspd: 100 + potentialAspd + (moduleBonuses.aspd ?? 0) };
  const modified = modifiedStats(original, contracts, { side: 'operator', className: operator.className, tile, elapsed });
  function update(patch: Partial<typeof baseline>) { setCustom({ key: accountKey, ...build, ...patch }); }
  return <>
    <div className={styles.row}>
      <h3 className="entity-title entity-title-sm">{operator.name}</h3>
      <button className="ghost btn-sm" type="button" onClick={() => { setCustom(null); setTile(null); setElapsed(0); }}>Reset to {owned ? 'account' : 'E0 Lv 1'}</button>
    </div>
    <p className={styles.note}>{owned ? `Default: imported ${account?.server} build.` : <>Default: E0 Lv 1. <Link href="/account">Import account</Link></>} {owned && (owned.trust === undefined || owned.equippedModule === undefined) && 'This older import lacks trust or equipped-module data. Set them below or import again.'}</p>
    <div className={styles.fields}>
      <label>Promotion<StyledSelect label="Operator promotion" value={String(phase.elite)} options={stats.phases.map(row => ({ value: String(row.elite), label: `Elite ${row.elite}` }))} onChange={value => update({ elite: Number(value), level: 1, moduleIndex: -1 })} /></label>
      <label>Level<input aria-label="Operator level" type="number" min={phase.minLevel} max={phase.maxLevel} value={level} onChange={event => update({ level: clampInteger(event.target.valueAsNumber, phase.minLevel, phase.maxLevel) })} /></label>
      <label>Potential<StyledSelect label="Operator potential" value={String(build.potential)} options={Array.from({ length: operator.potential.levels.length ? 6 : 1 }, (_, index) => ({ value: String(index + 1), label: `P${index + 1}` }))} onChange={value => update({ potential: Number(value) })} /></label>
      <label>Trust (%)<input aria-label="Operator trust" type="number" min={0} max={200} value={trust} onChange={event => update({ trust: clampInteger(event.target.valueAsNumber, 0, 200) })} /></label>
      <label className={styles.wide}>Module{!moduleAvailable && operator.modules.some(row => row.type === 'Upgrade') && ` · E2 Lv ${moduleMinLevel}`}<StyledSelect label="Operator module" value={String(activeModule ? moduleIndex : -1)} disabled={!moduleAvailable} options={[{ value: '-1', label: 'None' }, ...operator.modules.flatMap((row, index) => row.type === 'Upgrade' ? [{ value: String(index), label: row.name ?? `Module ${index}` }] : [])]} onChange={value => update({ moduleIndex: Number(value), moduleStage: 0 })} /></label>
      {activeModule && <label>Module level<StyledSelect label="Module level" value={String(moduleStage)} options={activeModule.stages.map((_, index) => ({ value: String(index), label: String(index + 1) }))} onChange={value => update({ moduleStage: Number(value) })} /></label>}
    </div>
    <div className={styles.row}><SegmentedControl label="Deployment tile" value={tile} onChange={setTile} options={[{ value: 'ground', label: 'Ground' }, { value: 'high', label: 'High tile' }]} /><label className={styles.inlineField}>Seconds after deployment<input aria-label="Seconds after deployment" type="number" min={0} max={9999} value={elapsed} onChange={event => setElapsed(clampInteger(event.target.valueAsNumber, 0, 9999))} /></label></div>
    <StatComparison label={`${operator.name} stat comparison`} original={original} modified={modified} />
    <p className={styles.note}>Sheet stats and direct module attributes. Skills, talents, and module combat effects are excluded. Red = lower; green = higher.</p>
  </>;
}
