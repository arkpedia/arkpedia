import { useEffect, useRef, useState } from 'react';
import { ContentImg } from '@/components/content/ContentImage';
import XButton from '@/components/ui/XButton';
import { CcbGlyph } from './art';
import EnemyRecord from '@/components/enemies/EnemyRecord';
import SeasonHub from './SeasonHub';
import { CCB_TEXT as T } from './strings';
import { useHeightFloor } from '@/components/ui/useHeightFloor';
import OperatorComparison from './OperatorComparison';
import ContractBoard from './ContractBoard';
import StatComparison from './StatComparison';
import { contractSummary, groupComplete, totalRisk, activeModifierSummaries, board, modifiedStats, replacementId, resolvedDescription, toggleContract } from '@/lib/ccb/modifiers';
import type { BattleplanData, BattleplanEnemy, Contract } from '@/lib/ccb/types';
import styles from './Battleplan.module.css';

/** The whole interactive tool. Loaded in the browser only (pages/game-modes/ccb.tsx): none of it is worth a place in the Worker's server bundle. */
export default function BattleplanWorkspace({ seasons, operators, operatorIcons, source }: BattleplanData) {
  const firstSeason = seasons.find(row => row.maps.some(site => site.main && site.details)) ?? seasons[0];
  const [seasonId, setSeason] = useState(firstSeason.id);
  const season = seasons.find(row => row.id === seasonId) ?? seasons[0];
  const [mapId, setMap] = useState((firstSeason.maps.find(row => row.main) ?? firstSeason.maps[0]).id);
  const [focused, setFocused] = useState<Contract | null>(null);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [enemyId, setEnemy] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  const [handbook, setHandbook] = useState<BattleplanEnemy | null>(null);
  const identity = `${seasonId}/${mapId}`;
  const floor = useHeightFloor('ccb');
  const map = season.maps.find(row => row.id === mapId) ?? season.maps[0];
  const details = map.details;
  const all = map.groups.flatMap(group => group.contracts);
  const selected = selections[identity] ?? [];
  const active = all.filter(contract => selected.includes(contract.id));
  const names = Object.fromEntries([...(details?.enemies ?? []), ...(details?.variants ?? [])].map(enemy => [enemy.id, enemy.name]));
  const summaries = activeModifierSummaries(active, names);
  const activeById = new Map(active.map(contract => [contract.id, contract]));
  const hiddenGroups = new Set(active.flatMap(contract => contract.effects.filter(effect => effect.key === 'level_hidden_group_enable').map(effect => String(board(effect).key))));
  // The whole roster of the map is listed; the ones a contract has not switched on are marked, not hidden.
  const enemies = details?.enemies ?? [];
  const fielded = (row: BattleplanEnemy) => !row.conditional || !row.hiddenGroups.length || row.hiddenGroups.some(group => hiddenGroups.has(group));
  const enemy = enemies.find(row => row.id === enemyId) ?? enemies.find(fielded) ?? enemies[0];
  const replacedId = enemy ? replacementId(enemy.id, active) : '';
  const replacedEnemy = replacedId !== enemy?.id ? details?.variants.find(row => row.id === replacedId) : undefined;
  const combatEnemy = replacedEnemy ?? enemy;
  const score = totalRisk(map.groups, selected);
  const bonuses = map.groups.filter(group => group.bonus && groupComplete(group, selected));
  const shownFocus = focused && all.some(row => row.id === focused.id) ? focused : null;
  function select(contract: Contract) { setSelections(current => ({ ...current, [identity]: toggleContract(current[identity] ?? [], contract, all) })); }
  const facts = details ? [[T.life, details.battle.life], [T.deployLimit, details.battle.deployment], [T.initialDp, details.battle.initialDp], [T.dpRecovery, details.battle.dpRecovery]].filter(row => row[1] != null) : [];
  return (
    <main className={styles.workspace} ref={floor.ref}>
      <SeasonHub seasons={seasons} season={season} map={map} onMap={value => { setMap(value); setFocused(null); }} onSeason={value => {
        const next = seasons.find(row => row.id === value)!;
        setSeason(value); setMap((next.maps.find(row => row.main) ?? next.maps[0]).id); setFocused(null);
      }} />
      <section className={styles.stage} aria-label={`${map.name}: ${T.map}`}>
        {details?.preview ? <button type="button" className={`btn-bare ${styles.mapThumb}`} onClick={() => setMapOpen(true)} aria-label={T.mapOpen(map.name)}>
          <ContentImg src={details.preview} alt="" width={320} height={180} /><span className={styles.zoom} aria-hidden="true">⤢</span>
        </button> : <p className={styles.empty}>{details ? T.noMap : T.noStage}</p>}
        <div className={styles.stageFacts}>
          <span className={styles.kicker}>{map.area}</span>
          <h2>{map.name}</h2>
          {map.name !== map.originalName && <span lang="zh-CN" className={styles.mapOriginal}>{map.originalName}</span>}
          {!!facts.length && <dl className={styles.facts}>{facts.map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
        </div>
      </section>
        <div className={styles.battlefield}>
          <section className={`op-section ${styles.contractPanel}`} aria-label="Contract board">
            <div className={styles.row}><h2>{T.criteria}</h2><button className="ghost btn-sm" type="button" disabled={!selected.length} onClick={() => setSelections(current => ({ ...current, [identity]: [] }))}>{T.clear}</button></div>
            <ContractBoard key={identity} map={map} selected={selected} names={names} onSelect={select} onFocus={setFocused} />
          </section>
          <aside className={styles.activePanel}>
            <h2>{T.selected}</h2>
            <p className={styles.preview} aria-live="polite">{shownFocus ? <><b>▲{shownFocus.score}</b> {contractSummary(shownFocus, names)}</> : T.hover}</p>
            {active.length ? <ul className={styles.activeList}>
              {summaries.map(summary => {
                const icon = activeById.get(summary.id)?.icon;
                return <li key={summary.id}>
                  {icon && <CcbGlyph kind="runeicon" id={icon} className={styles.activeGlyph} />}
                  <span className={styles.points}>▲{summary.score}</span>
                  <span>{summary.text}{summary.unmodeled && <small className={styles.note}>{T.outside}</small>}</span>
                </li>;
              })}
              {bonuses.map(group => <li key={group.id} className={styles.bonusRow}>
                <span className={styles.points}>▲+{group.bonus}</span><span>{T.bonusLine(group.name)}</span>
              </li>)}
            </ul> : <p className={styles.empty}>{T.none}</p>}
            <div className={styles.total}><span className={styles.kicker}>{T.totalRisk}</span><output className={styles.score} aria-label="Contract score" aria-live="polite">▲ {score}</output></div>
          </aside>
        </div>
        <details className={styles.source}>
          <summary>{T.notes}</summary>
          <p>Historical CN snapshots with English translations for group names and contract effects.</p>
          <p>{T.bonusNote}</p>
          <a className="ghost btn-sm" href={source} target="_blank" rel="noreferrer">View contract source ↗</a>
          {!!active.length && <ul>{active.map(contract => <li key={contract.id} lang="zh-CN">
            <strong>{contract.name}</strong> {resolvedDescription(contract)}
          </li>)}</ul>}
        </details>
        <div className={styles.comparisons}>
        {!!enemies.length && <section className={styles.enemySection} aria-label={T.enemies}>
          <div className={styles.row}><h2>{T.enemies}</h2><span className="hint">{T.enemiesHint}</span></div>
          <div className={styles.enemyGrid} role="group" aria-label={T.enemies}>
            {enemies.map(row => <button type="button" key={row.id} className={`btn-bare ${styles.enemyTile}`} aria-pressed={row.id === enemy?.id} data-off={!fielded(row) || undefined} title={fielded(row) ? row.name : `${row.name} · ${T.conditional}`} onClick={() => setEnemy(row.id)}>
              {row.icon ? <ContentImg src={row.icon} alt="" width={72} height={72} /> : <span className={styles.enemyBlank} aria-hidden="true" />}
              <span className={styles.enemyTileName}>{row.name}</span>
            </button>)}
          </div>
        </section>}
          <section className={`panel op-section ${styles.comparison}`}>
            <h2>Enemy</h2>
            {enemy ? <>
              <div className={styles.row}><div className={styles.enemyName}>{enemy.icon && <ContentImg src={enemy.icon} width={52} height={52} alt="" />}<h3 className="entity-title entity-title-sm">{enemy.name}</h3></div><button type="button" className="ghost btn-sm" onClick={() => setHandbook(enemy)}>{T.handbook}</button></div>
              {!fielded(enemy) && <p className={styles.warning}>{T.conditional}</p>}
              {replacedEnemy && <p className={styles.warning}>Replaced by {replacedEnemy.name}</p>}
              <StatComparison label={`${enemy.name} stat comparison`} original={enemy.stats} modified={modifiedStats(combatEnemy!.stats, active, { side: 'enemy', id: combatEnemy!.id })} />
              <p className={styles.note}>Baseline uses this map’s enemy level and stat overrides. Damage taken is a multiplier, separate from DEF and RES.</p>
              {replacedId !== enemy.id && !replacedEnemy && <p className={styles.warning}>Replacement combat data is unavailable. The table still shows the original enemy.</p>}
            </> : <p className={styles.empty}>{details ? 'No enemy records are available for this map.' : T.noStage}</p>}
          </section>
        </div>
        <div id="ccb-squad" className={styles.squadAnchor} tabIndex={-1}>
          <OperatorComparison operators={operators} icons={operatorIcons ?? {}} contracts={active} />
        </div>
      {floor.spacer}
      {mapOpen && details?.preview && <MapDialog name={map.name} image={details.preview} onClose={() => setMapOpen(false)} />}
      {handbook && <EnemyRecord slug={handbook.slug} name={handbook.name} onClose={() => setHandbook(null)} />}
    </main>
  );
}

function MapDialog({ name, image, onClose }: { name: string; image: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const label = `${name}: ${T.map}`;
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  function close() {
    ref.current?.close();
    onClose();
  }
  return <dialog ref={ref} className={`panel ${styles.mapDialog}`} aria-label={label}
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <header className={styles.mapToolbar}>
      <span>{name}</span>
      <XButton label={`Close ${label}`} onClick={close} autoFocus />
    </header>
    <ContentImg src={image} alt={label} />
  </dialog>;
}
