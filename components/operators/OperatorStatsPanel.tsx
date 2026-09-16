import { useId, useState } from 'react';
import OperatorGameIcon, { STAT_ICONS } from './OperatorGameIcon';
import { clampInteger, getBaseStats, getTrustBonus, OperatorStats, StatKey } from '@/lib/operators/operatorStats';
import styles from './OperatorDetails.module.css';

const primary: { key: 'hp' | 'atk' | 'def' | 'res'; label: string }[] = [
  { key: 'hp', label: 'HP' }, { key: 'atk', label: 'ATK' },
  { key: 'def', label: 'DEF' }, { key: 'res', label: 'RES' },
];
const secondary: { key: StatKey; label: string; unit?: string }[] = [
  { key: 'dp', label: 'DP cost' }, { key: 'block', label: 'Block count' },
  { key: 'interval', label: 'Attack interval', unit: 's' }, { key: 'redeploy', label: 'Redeploy time', unit: 's' },
];
const format = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 3 });

/** Parent keys this by operator so client navigation cannot carry over an invalid elite/level. */
export default function OperatorStatsPanel({ stats, hidden, compact = false }: { stats: OperatorStats; hidden?: boolean; compact?: boolean }) {
  const id = useId();
  const levelId = `${id}-level`, trustId = `${id}-trust`, helpId = `${id}-trust-help`;
  const [phaseIndex, setPhaseIndex] = useState(stats.phases.length - 1);
  const phase = stats.phases[phaseIndex];
  const [levelInput, setLevelInput] = useState(String(phase.maxLevel));
  const [trustInput, setTrustInput] = useState('100');
  const level = clampInteger(Number(levelInput), phase.minLevel, phase.maxLevel);
  const trust = clampInteger(Number(trustInput), 0, 200);
  const base = getBaseStats(phase, level);
  const bonus = getTrustBonus(stats, trust);

  return (
    <section className={`${styles.stats}${compact ? ` ${styles.compact}` : ''}`} aria-label="Operator stats" hidden={hidden}>
      <h2>Stats</h2>
      <fieldset className={styles.promotion}>
        <legend className="visually-hidden">Promotion</legend>
        <div className={styles.promotionOptions}>
          {stats.phases.map((item, index) => (
            <button type="button" key={item.elite} aria-pressed={index === phaseIndex}
              className={index === phaseIndex ? 'primary' : 'ghost'} aria-label={`Elite ${item.elite}`} title={`Elite ${item.elite}`}
              onClick={() => {
                setPhaseIndex(index);
                setLevelInput(String(level === phase.maxLevel ? item.maxLevel : clampInteger(level, item.minLevel, item.maxLevel)));
              }}>
              <OperatorGameIcon label={`Elite ${item.elite}`} />
            </button>
          ))}
        </div>
      </fieldset>

      <div className={styles.controls}>
        <div className={styles.control}>
          <label htmlFor={levelId}>Level</label>
          <div className={styles.numeric}>
            <input id={levelId} type="number" min={phase.minLevel} max={phase.maxLevel} step="1"
              value={levelInput} onChange={event => setLevelInput(event.target.value)}
              onBlur={() => setLevelInput(String(level))} />
            <button type="button" className={styles.maxButton} aria-label={`Set level to maximum, ${phase.maxLevel}`} onClick={() => setLevelInput(String(phase.maxLevel))}><small>MAX</small>{phase.maxLevel}</button>
          </div>
          <input className={styles.slider} type="range" aria-label="Operator level" min={phase.minLevel} max={phase.maxLevel}
            value={level} onChange={event => setLevelInput(event.target.value)} disabled={phase.minLevel === phase.maxLevel} />
        </div>
        <div className={styles.control}>
          <label htmlFor={trustId}>Trust</label>
          <div className={styles.numeric}>
            <input id={trustId} type="number" min="0" max="200" step="1" aria-describedby={helpId}
              value={trustInput} onChange={event => setTrustInput(event.target.value)}
              onBlur={() => setTrustInput(String(trust))} />
            <span>%</span>
          </div>
          <input className={styles.slider} type="range" aria-label="Operator trust" min="0" max="200"
            value={trust} onChange={event => setTrustInput(event.target.value)} aria-describedby={helpId} />
        </div>
      </div>
      <span id={helpId} className="visually-hidden">Trust bonuses reach their maximum at 100%.</span>

      <dl className={styles.primaryStats}>
        {primary.map(({ key, label }) => {
          const added = key === 'res' ? 0 : bonus[key];
          const hasTrust = key !== 'res' && stats.trust[key] !== 0;
          return (
            <div key={key} className={styles.stat}>
              <dt><OperatorGameIcon label={label} src={`/stat-icons/${STAT_ICONS[key]}.webp`} size={24} /></dt>
              <dd>
                <span className={styles.total}>{format(base[key] + added)}</span>
                <span className={styles.breakdown}>
                  {format(base[key])} base{hasTrust && <span className={styles.trustBonus}> + {format(added)} trust</span>}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
      <dl className={styles.secondaryStats}>
        {secondary.map(({ key, label, unit }) => (
          <div key={key}><dt><OperatorGameIcon label={label} src={`/stat-icons/${STAT_ICONS[key]}.webp`} size={24} /></dt><dd>{format(base[key])}{unit && <span> {unit}</span>}</dd></div>
        ))}
      </dl>
      <p className={styles.help}>Base + trust only.</p>
    </section>
  );
}
