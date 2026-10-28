import { useId, useState } from 'react';
import SegmentedControl from '@/components/ui/SegmentedControl';
import OperatorGameIcon, { STAT_ICONS } from './OperatorGameIcon';
import { summonStats, type Summon } from '@/lib/operators/summonStats';
import { clampInteger } from '@/lib/operators/operatorStats';
import styles from './OperatorDetails.module.css';

/* The summon's numbers in the operator's own stat block (OperatorStatsPanel): the four
   primary stats with their icons and the big total, then DP, block, interval and redeploy on
   the smaller row, so the eye reads a summon the way it just read its operator. The summon's
   keys are the game's (maxHp, blockCnt, baseAttackTime …); these name the icon and label for each. */
const primary: { key: string; icon: string; label: string }[] = [
  { key: 'maxHp', icon: STAT_ICONS.hp, label: 'HP' }, { key: 'atk', icon: STAT_ICONS.atk, label: 'ATK' },
  { key: 'def', icon: STAT_ICONS.def, label: 'DEF' }, { key: 'magicResistance', icon: STAT_ICONS.res, label: 'RES' },
];
const secondary: { key: string; icon: string; label: string; unit?: string }[] = [
  { key: 'cost', icon: STAT_ICONS.dp, label: 'DP cost' }, { key: 'blockCnt', icon: STAT_ICONS.block, label: 'Block count' },
  { key: 'baseAttackTime', icon: STAT_ICONS.interval, label: 'Attack interval', unit: 's' }, { key: 'respawnTime', icon: STAT_ICONS.redeploy, label: 'Redeploy time', unit: 's' },
];
const format = (value: number) => Number(value.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Parent keys this by operator so client navigation cannot carry over another summon's choice. */
export default function OperatorSummons({ summons }: { summons: Summon[] }) {
  const id = useId();
  const levelId = `${id}-level`;
  const [selected, setSelected] = useState(summons[0]?.id);
  const [elite, setElite] = useState(2);
  const [levelInput, setLevelInput] = useState('90');
  const summon = summons.find(value => value.id === selected) ?? summons[0];
  if (!summon) return null;
  const stage = Math.min(elite, summon.phases.length - 1), phase = summon.phases[stage];
  const level = clampInteger(Number(levelInput), 1, phase.maxLevel);
  const stats = summonStats(summon, stage, level);
  return <div className="operator-summons">
    {summons.length > 1 && <SegmentedControl label="Summon" options={summons.map(value => ({ value: value.id, label: value.name }))} value={summon.id} onChange={setSelected} />}
    <div className={styles.buildControls}>
      <fieldset className={styles.promotion}>
        <legend>Summon promotion</legend>
        <div className={styles.promotionOptions} role="group" aria-label="Summon promotion">
          {summon.phases.map((_, index) => (
            <button type="button" key={index} aria-pressed={index === stage} className="filter-chip" aria-label={`Elite ${index}`} title={`Elite ${index}`}
              onClick={() => { setElite(index); setLevelInput(String(level === phase.maxLevel ? summon.phases[index].maxLevel : clampInteger(level, 1, summon.phases[index].maxLevel))); }}>
              <OperatorGameIcon label={`Elite ${index}`} />
            </button>
          ))}
        </div>
      </fieldset>
    </div>
    <div className={`${styles.controls} ${styles.controlsSingle}`}>
      <div className={styles.control}>
        <label htmlFor={levelId}>Level</label>
        <div className={styles.numeric}>
          <input id={levelId} type="number" min={1} max={phase.maxLevel} step="1" value={levelInput}
            onChange={event => setLevelInput(event.target.value)} onBlur={() => setLevelInput(String(level))} />
          <button type="button" className="btn-sm" aria-label={`Set summon level to maximum, ${phase.maxLevel}`} onClick={() => setLevelInput(String(phase.maxLevel))}>Max {phase.maxLevel}</button>
        </div>
        <input className={styles.slider} type="range" aria-label="Summon level" min={1} max={phase.maxLevel} value={level}
          onChange={event => setLevelInput(event.target.value)} disabled={phase.maxLevel === 1} />
      </div>
    </div>
    <dl className={styles.primaryStats}>
      {primary.map(({ key, icon, label }) => (
        <div key={key} className={styles.stat}>
          <dt><OperatorGameIcon label={label} src={`/stat-icons/${icon}.webp`} size={24} /></dt>
          <dd>
            <span className={styles.total}>{format(stats[key] ?? 0)}</span>
            <span className={styles.breakdown}><span>{format(stats[key] ?? 0)} base</span></span>
          </dd>
        </div>
      ))}
    </dl>
    <dl className={styles.secondaryStats}>
      {secondary.map(({ key, icon, label, unit }) => (
        <div key={key}><dt><OperatorGameIcon label={label} src={`/stat-icons/${icon}.webp`} size={24} /></dt><dd>{format(stats[key] ?? 0)}{unit && <span> {unit}</span>}</dd></div>
      ))}
    </dl>
    <p className={styles.help}>Base summon stats before skills, talents and modules. Some summons inherit additional stats from their operator.</p>
  </div>;
}
