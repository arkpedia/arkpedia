import PageMeta from '@/components/layout/PageMeta';
import Link from 'next/link';
import ModeMark from '@/components/stages/ModeMark';
import type { GetStaticProps } from 'next';
import { useState } from 'react';
import { ContentImg } from '@/components/content/ContentImage';
import PageHeader from '@/components/ui/PageHeader';
import StyledSelect from '@/components/ui/StyledSelect';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { useHeightFloor } from '@/components/ui/useHeightFloor';
import OperatorComparison from '@/components/ccb/OperatorComparison';
import ContractBoard from '@/components/ccb/ContractBoard';
import StatComparison from '@/components/ccb/StatComparison';
import { activeModifierSummaries, board, modifiedStats, replacementId, resolvedDescription, toggleContract } from '@/lib/ccb/modifiers';
import type { BattleplanMap, BattleplanSeason, Contract, MapDetails } from '@/lib/ccb/types';
import styles from '@/components/ccb/Battleplan.module.css';

interface Props {
  seasons: (Omit<BattleplanSeason, 'maps'> & { maps: (BattleplanMap & { details: MapDetails })[] })[];
  operators: string[];
  source: string;
}

export default function BattleplanPage({ seasons, operators, source }: Props) {
  const [seasonId, setSeason] = useState(seasons[0].id);
  const season = seasons.find(row => row.id === seasonId) ?? seasons[0];
  const [mapId, setMap] = useState(seasons[0].maps.find(row => row.main)!.id);
  const [mode, setMode] = useState<'main' | 'rotation'>('main');
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [enemyId, setEnemy] = useState('');
  const identity = `${seasonId}/${mapId}`;
  const floor = useHeightFloor('ccb');
  const map = season.maps.find(row => row.id === mapId) ?? season.maps[0];
  const all = map.groups.flatMap(group => group.contracts);
  const selected = selections[identity] ?? [];
  const active = all.filter(contract => selected.includes(contract.id));
  const names = Object.fromEntries([...map.details.enemies, ...map.details.variants].map(enemy => [enemy.id, enemy.name]));
  const summaries = activeModifierSummaries(active, names);
  const hiddenGroups = new Set(active.flatMap(contract => contract.effects.filter(effect => effect.key === 'level_hidden_group_enable').map(effect => String(board(effect).key))));
  const enemies = map.details.enemies.filter(enemy => !enemy.conditional || !enemy.hiddenGroups.length || enemy.hiddenGroups.some(group => hiddenGroups.has(group)));
  const enemy = enemies.find(row => row.id === enemyId) ?? enemies[0];
  const replacedId = enemy ? replacementId(enemy.id, active) : '';
  const replacedEnemy = replacedId !== enemy?.id ? map.details.variants.find(row => row.id === replacedId) : undefined;
  const combatEnemy = replacedEnemy ?? enemy;
  const score = active.reduce((total, row) => total + row.score, 0);
  function select(contract: Contract) { setSelections(current => ({ ...current, [identity]: toggleContract(current[identity] ?? [], contract, all) })); }
  function changeMode(value: 'main' | 'rotation') {
    setMode(value);
    const target = season.maps.find(row => row.main === (value === 'main'));
    if (target) setMap(target.id);
  }
  return <>
    <PageMeta title="CCB Helper" description="Select Contingency Contract Battleplan maps and contracts, then compare original and modified operator and enemy stats." noindex />
    <PageHeader slim eyebrow={<><ModeMark name="contingency-contract.svg" className="head-mark" />Contingency Contract // Battle preparation</>} title="CCB Helper" sub="Choose a battlefield, select contracts, and inspect their effects." />
    <main className={styles.workspace} ref={floor.ref}>
      <Link className="btn" href="/game-modes">← Game Modes</Link>
      <div className={styles.toolbar}>
        <StyledSelect label="CCB season" value={season.id} options={seasons.map(row => ({ value: row.id, label: `CCB #${row.number} · ${row.name}` }))} onChange={value => {
          const next = seasons.find(row => row.id === value)!;
          setSeason(value); setMap((next.maps.find(row => row.main === (mode === 'main')) ?? next.maps[0]).id);
        }} />
        <SegmentedControl label="Map type" value={mode} onChange={changeMode} options={[{ value: 'main', label: 'Main map' }, { value: 'rotation', label: 'Rotational maps' }]} />
        <span className={styles.archiveLabel}>CN archive · CCB #1–4</span>
      </div>
      <div className={styles.maps} role="group" aria-label="Battlefields">
        {season.maps.filter(row => row.main === (mode === 'main')).map(choice => <button type="button" className={`btn-bare ${styles.mapCard}`} aria-pressed={choice.id === mapId} key={choice.id} onClick={() => setMap(choice.id)}>
          {choice.details.preview && <ContentImg src={choice.details.preview} alt="" width={200} height={112} />}
          <span><span className={styles.mapArea}>{choice.area}</span><strong>{choice.name}</strong>{choice.name !== choice.originalName && <span lang="zh-CN" className={styles.mapOriginal}>{choice.originalName}</span>}</span>
        </button>)}
      </div>
        <div className={styles.battlefield}>
          <section className={`panel op-section ${styles.contractPanel}`} aria-label="Contract board">
            <div className={styles.row}><h2>Test criteria</h2><button className="ghost btn-sm" type="button" disabled={!selected.length} onClick={() => setSelections(current => ({ ...current, [identity]: [] }))}>Clear contracts</button></div>
            <ContractBoard key={identity} map={map} selected={selected} names={names} onSelect={select} />
          </section>
          <aside className={`panel op-section ${styles.activePanel}`}>
            <div className={styles.row}><h2>Active modifiers</h2><output className={styles.score} aria-label="Contract score" aria-live="polite">▲ {score}</output></div>
            {active.length ? <ul className={styles.activeList}>{summaries.map(summary => <li key={summary.id}><span className={styles.points}>▲{summary.score}</span><span>{summary.text}{summary.unmodeled && <small className={styles.note}>Includes effects outside the stat table</small>}</span></li>)}</ul> : <p className={styles.empty}>{map.main ? 'Open a criteria group to select contracts.' : 'Select nodes to combine contracts.'}</p>}
            <details className={styles.source}><summary>Archive and calculation notes</summary><p>Historical Chinese contract snapshots. English group names and effect summaries are editorial translations. This archive does not establish the next Global season or its schedule.</p><p>Contract points are summed. Group completion bonuses and reward progress are not included.</p><p><a href={source} target="_blank" rel="noreferrer">View pinned source ↗</a></p>{active.length > 0 && <ul>{active.map(contract => <li key={contract.id} lang="zh-CN"><strong>{contract.name}</strong>: {resolvedDescription(contract)}</li>)}</ul>}</details>
          </aside>
        </div>
        <div className={styles.comparisons}>
          <OperatorComparison operators={operators} contracts={active} />
          <section className={`panel op-section ${styles.comparison}`}>
            <h2>Enemy</h2>
            {enemy ? <>
              <StyledSelect label="Map enemy" value={enemy.id} options={enemies.map(row => ({ value: row.id, label: `${row.name}${row.conditional ? ' · conditional' : ''}` }))} onChange={setEnemy} />
              <div className={styles.enemyName}>{enemy.icon && <ContentImg src={enemy.icon} width={52} height={52} alt="" />}<h3 className="entity-title entity-title-sm">{enemy.name}</h3></div>
              {replacedEnemy && <p className={styles.warning}>Replaced by {replacedEnemy.name}</p>}
              <StatComparison label={`${enemy.name} stat comparison`} original={enemy.stats} modified={modifiedStats(combatEnemy.stats, active, { side: 'enemy', id: combatEnemy.id })} />
              <p className={styles.note}>Baseline uses this map’s enemy level and stat overrides. Damage taken is a multiplier, separate from DEF and RES.</p>
              {replacedId !== enemy.id && !replacedEnemy && <p className={styles.warning}>Replacement combat data is unavailable. The table still shows the original enemy.</p>}
            </> : <p className={styles.empty}>No enemy records are available for this map.</p>}
          </section>
        </div>
      {floor.spacer}
    </main>
  </>;
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  const { archive, mapDetails } = await import('@/lib/ccb/server');
  const { getAllOperators } = await import('@/lib/operators/operators');
  const seasons = [...archive.seasons].reverse().map(season => ({ ...season, maps: season.maps.map(map => {
    const details = mapDetails(map.stage);
    if (!details) throw new Error(`CCB archive lacks stage ${map.stage}`);
    return { ...map, details };
  }) }));
  return { props: { seasons, operators: getAllOperators().map(row => row.name).sort((a, b) => a.localeCompare(b)), source: archive.source } };
};
