import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ContentImg } from '@/components/content/ContentImage';
import EnemyRecord from '@/components/enemies/EnemyRecord';
import BattleplanDialog, { jumpToDialogSection } from './BattleplanDialog';
import BattleplanStage, { BattleplanStageDetails } from './BattleplanStage';
import { CcbGlyph } from './art';
import SeasonHub from './SeasonHub';
import { CCB_TEXT as T } from './strings';
import OperatorComparison from './OperatorComparison';
import ContractBoard, { ContractTree } from './ContractBoard';
import StatComparison, { StatGlyph, formatStatValue, statChange } from './StatComparison';
import {
  activeModifierSummaries, board, groupComplete, maximumRisk, modifiedStats,
  replacementId, resolvedDescription, toggleContract, toggleContractGroup, totalRisk,
} from '@/lib/ccb/modifiers';
import type { BattleplanData, BattleplanEnemy } from '@/lib/ccb/types';
import type { PresetRisks } from '@/lib/ccb/presets';
import styles from './Battleplan.module.css';

const ENEMY_STATS = ['hp', 'atk', 'def', 'res'] as const;
const RISK_CATEGORIES = 'ccb-risk-categories';
const riskSection = (id: string) => `ccb-risk-${id}`;

export default function BattleplanWorkspace({ seasons, operators, operatorIcons, source }: BattleplanData) {
  const firstSeason = seasons.find(row => row.maps.some(site => site.main && site.details)) ?? seasons[0];
  const [seasonId, setSeason] = useState(firstSeason.id);
  const season = seasons.find(row => row.id === seasonId) ?? firstSeason;
  const [mapId, setMap] = useState((firstSeason.maps.find(row => row.main) ?? firstSeason.maps[0]).id);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [enemyId, setEnemy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'map' | 'risks' | 'modifiers' | 'enemy' | 'presets' | null>(null);
  const [activeRiskGroup, setActiveRiskGroup] = useState<string | null>(null);
  const [handbook, setHandbook] = useState<BattleplanEnemy | null>(null);
  const squad = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.location.hash !== '#ccb-squad') return;
    squad.current?.scrollIntoView();
    squad.current?.focus({ preventScroll: true });
  }, []);

  const map = season.maps.find(row => row.id === mapId) ?? season.maps[0];
  const identity = `${season.id}/${map.id}`;
  const details = map.details;
  const enemies = details?.enemies ?? [];
  const all = map.groups.flatMap(group => group.contracts);
  const selected = selections[identity] ?? [];
  const active = all.filter(contract => selected.includes(contract.id));
  const names = Object.fromEntries([...enemies, ...(details?.variants ?? [])].map(enemy => [enemy.id, enemy.name]));
  const hiddenGroups = new Set(active.flatMap(contract => contract.effects
    .filter(effect => effect.key === 'level_hidden_group_enable').map(effect => String(board(effect).key))));
  const fielded = (row: BattleplanEnemy) => !row.conditional || !row.hiddenGroups.length || row.hiddenGroups.some(id => hiddenGroups.has(id));
  const enemy = enemies.find(row => row.id === enemyId) ?? enemies.find(row => !row.conditional) ?? enemies[0];
  const replacedId = enemy ? replacementId(enemy.id, active) : null;
  const replacement = replacedId !== enemy?.id ? details?.variants.find(row => row.id === replacedId) : undefined;
  const combatEnemy = replacement ?? enemy;
  const enemyStats = combatEnemy ? modifiedStats(combatEnemy.stats, active, { side: 'enemy', id: combatEnemy.id }) : null;
  const score = totalRisk(map.groups, selected);
  const max = maximumRisk(map.groups);
  const close = () => setDialog(null);
  const openRisks = (groupId: string | null) => {
    if (dialog === 'risks' && groupId !== null && groupId === activeRiskGroup) {
      jumpToDialogSection(riskSection(groupId));
      return;
    }
    setActiveRiskGroup(groupId);
    setDialog('risks');
  };
  const updateSelection = (update: (current: string[]) => string[]) => {
    setSelections(current => ({ ...current, [identity]: update(current[identity] ?? []) }));
  };
  const loadRisks = (risks: PresetRisks) => {
    setSeason(risks.seasonId);
    setMap(risks.mapId);
    setEnemy(null);
    setSelections(current => ({ ...current, [`${risks.seasonId}/${risks.mapId}`]: risks.contracts }));
  };

  const renderRiskBoard = (inline: boolean) => <section id={inline ? undefined : RISK_CATEGORIES}
    tabIndex={inline ? undefined : -1} aria-label="Contract board" className={styles.riskBoard}>
    <div className={styles.row}>
      {inline && <h2 className="section-title">Risks</h2>}
      <button className="ghost btn-sm" type="button" disabled={!selected.length} onClick={() => updateSelection(() => [])}>{T.clear}</button>
    </div>
    <ContractBoard map={map} selected={selected} inDialog={!inline} currentGroupId={inline ? null : activeRiskGroup}
      onGroup={value => updateSelection(current => toggleContractGroup(current, value, all))}
      onInspect={value => openRisks(value.id)} />
    {inline && <button type="button" className="ghost btn-sm" aria-haspopup="dialog"
      onClick={() => setDialog('modifiers')}>Active modifiers</button>}
  </section>;

  function renderModifiers() {
    return <>
      {active.length ? <ul className={styles.activeList}>
        {activeModifierSummaries(active, names).map(summary => {
          const icon = all.find(contract => contract.id === summary.id)?.icon;
          return <li key={summary.id}>
            {icon && <CcbGlyph kind="runeicon" id={icon} className={styles.categoryGlyph} />}
            <span className={styles.points}>▲{summary.score}</span>
            <span>{summary.text}{summary.unmodeled && <small className={styles.note}>{T.outside}</small>}</span>
          </li>;
        })}
        {map.groups.filter(value => value.bonus && groupComplete(value, selected)).map(value => <li key={value.id}>
          <span className={styles.points}>▲+{value.bonus}</span><span>{T.bonusLine(value.name)}</span>
        </li>)}
      </ul> : <p className={styles.empty}>{T.none}</p>}
      <details className={styles.source}>
        <summary>{T.notes}</summary>
        <p>Historical CN snapshots with English translations for group names and contract effects.</p>
        <p>{T.bonusNote}</p>
        <a className="ghost btn-sm" href={source} target="_blank" rel="noreferrer">View contract source ↗</a>
        {!!active.length && <ul>{active.map(contract => <li key={contract.id} lang="zh-CN">
          <strong>{contract.name}</strong> {resolvedDescription(contract)}
        </li>)}</ul>}
      </details>
    </>;
  }

  return <main className={styles.workspace}>
    <SeasonHub seasons={seasons} season={season} map={map} onMap={value => {
      setMap(value); setEnemy(null);
    }} onSeason={value => {
      const next = seasons.find(row => row.id === value)!;
      if (value === seasonId) return;
      setSeason(value); setMap((next.maps.find(row => row.main) ?? next.maps[0]).id); setEnemy(null);
    }} />
    <div className={styles.workspaceBar}>
      <div className={styles.mapIdentity}>
        {map.logo && <CcbGlyph kind="stagelogo" id={map.logo} className={styles.categoryGlyph} />}
        <div>
          <h2 className="entity-title entity-title-sm">{map.name}</h2>
          <span className={styles.kicker}>{T.seasonLabel(season.number)} · {map.area}</span>
        </div>
      </div>
      <div className={styles.workspaceActions}>
        <a href="#ccb-battlefields" className="ghost btn-sm">Battlefields</a>
        <button type="button" className="ghost btn-sm" aria-haspopup="dialog" disabled={!details?.preview && !details?.fullPreview && !details?.layout}
          aria-label={T.mapOpen(map.name)} onClick={() => setDialog('map')}>Map</button>
        <button type="button" className={`ghost btn-sm ${styles.mobileRisks}`} aria-haspopup="dialog" onClick={() => openRisks(null)}>Risks</button>
        <button type="button" className="ghost btn-sm" aria-haspopup="dialog" onClick={() => setDialog('presets')}>Presets</button>
        <div className={styles.riskReadout}>
          <span className={styles.kicker}>{T.totalRisk}</span>
          <output aria-label="Contract score" aria-live="polite">▲ {score}</output>
          <span className={styles.groupScore}> / {max}</span>
        </div>
      </div>
    </div>

    <div className={styles.resultsGrid}>
      <aside className={`panel ${styles.riskRail}`}>{renderRiskBoard(true)}</aside>
      <div className={styles.results}>
        <div className={styles.overview}>
          <BattleplanStage map={map} contracts={active} onOpenMap={() => setDialog('map')} />
          <section className={`panel ${styles.enemySection}`} aria-label={T.enemies}>
            <div className={styles.row}><h2 className="section-title">Enemies</h2>
              {enemy && <button className="ghost btn-sm" type="button" aria-haspopup="dialog" onClick={() => setDialog('enemy')}>Enemy stats</button>}
            </div>
            {!!enemies.length && <div className={styles.enemyGrid} role="group" aria-label={T.enemies}
              style={{ '--enemy-columns': Math.min(enemies.length, 9) } as CSSProperties}>
              {enemies.map(row => <button type="button" key={row.id} className={`btn-bare ${styles.enemyTile}`}
                aria-label={row.name} aria-pressed={row.id === enemy?.id}
                data-off={!fielded(row) || undefined} title={fielded(row) ? row.name : `${row.name} · ${T.conditional}`} onClick={() => setEnemy(row.id)}>
                {row.icon ? <ContentImg src={row.icon} alt="" width={48} height={48} /> : <span className={styles.enemyBlank}>{row.name[0]}</span>}
              </button>)}
            </div>}
            {enemy && enemyStats ? <div className={styles.enemySummary}>
              <strong title={enemy.name}>{enemy.name}</strong>
              <dl>{ENEMY_STATS.map(key => {
                const change = statChange(enemy.stats[key] ?? null, enemyStats[key] ?? null);
                return <div key={key}>
                  <dt><StatGlyph stat={key} />{key.toUpperCase()}</dt>
                  <dd>{formatStatValue(enemyStats[key] ?? null)} <small className={change?.direction}>{change?.text}</small></dd>
                </div>;
              })}</dl>
            </div> : <p className={styles.empty}>{details ? 'No enemy records are available for this map.' : T.noStage}</p>}
          </section>
        </div>
        <div id="ccb-squad" ref={squad} className={styles.squadAnchor} tabIndex={-1}>
          <OperatorComparison operators={operators} icons={operatorIcons ?? {}} contracts={active}
            presetBoard={dialog === 'presets' ? {
              seasons, currentRisks: { seasonId: season.id, mapId: map.id, contracts: selected },
              onLoadRisks: loadRisks, onClose: close,
            } : null} />
        </div>
      </div>
    </div>

    {dialog === 'map' && details && <BattleplanDialog wide label={`${map.name}: ${T.map}`} onClose={close}>
      <BattleplanStageDetails map={map} contracts={active} />
    </BattleplanDialog>}
    {dialog === 'risks' && <BattleplanDialog label="Risks" className={styles.risksDialog} onClose={close}
      focusSection={activeRiskGroup === null ? null : riskSection(activeRiskGroup)}
      headerAction={<>
        <output aria-label="Risks sheet score" aria-live="polite" className={styles.groupScore}>▲ {score} / {max}</output>
        <button type="button" className="ghost btn-sm" onClick={() => jumpToDialogSection(RISK_CATEGORIES)}>Categories</button>
      </>}>
      {renderRiskBoard(false)}
      <details className={styles.source}><summary>Active modifiers</summary>{renderModifiers()}</details>
      <div className={styles.groups}>
        {map.groups.map(group => <ContractTree key={group.id} group={group} names={names} selected={selected} current={group.id === activeRiskGroup}
          sectionId={riskSection(group.id)} onSelect={contract => updateSelection(current => toggleContract(current, contract, all))} />)}
      </div>
    </BattleplanDialog>}
    {dialog === 'modifiers' && <BattleplanDialog label="Active modifiers" onClose={close}>{renderModifiers()}</BattleplanDialog>}
    {dialog === 'enemy' && enemy && enemyStats && <BattleplanDialog label={enemy.name} onClose={close}>
      <div className={styles.row}>
        {enemy.icon && <ContentImg src={enemy.icon} width={52} height={52} alt="" />}
        <button type="button" className="ghost btn-sm" onClick={() => { setHandbook(enemy); close(); }}>{T.handbook}</button>
      </div>
      {!fielded(enemy) && <p className={styles.warning}>{T.conditional}</p>}
      {replacement && <p className={styles.warning}>Replaced by {replacement.name}</p>}
      {replacedId !== enemy.id && !replacement && <p className={styles.warning}>Replacement combat data is unavailable.</p>}
      <StatComparison label={`${enemy.name} stat comparison`} original={enemy.stats} modified={enemyStats} />
      <p className={styles.note}>Baseline uses this map’s enemy level and stat overrides. Damage taken is a multiplier, separate from DEF and RES.</p>
    </BattleplanDialog>}
    {handbook && <EnemyRecord slug={handbook.slug} name={handbook.name} onClose={() => setHandbook(null)} />}
  </main>;
}
