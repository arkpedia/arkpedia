import { useId, useState } from 'react';
import OperatorGameIcon, { STAT_ICONS } from './OperatorGameIcon';
import { applyModuleStatBonuses, clampInteger, getBaseStats, getTrustBonus, OperatorStats, parseModuleStatBonuses, StatKey } from '@/lib/operators/operatorStats';
import type { OperatorModule } from '@/lib/operators/operatorTypes';
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
export default function OperatorStatsPanel({ stats, modules = [], hidden }: { stats: OperatorStats; modules?: OperatorModule[]; hidden?: boolean }) {
  const id = useId();
  const levelId = `${id}-level`, trustId = `${id}-trust`, helpId = `${id}-trust-help`;
  const upgradeModules = modules.filter(module => module.type === 'Upgrade' && module.stages.length > 0);
  const [phaseIndex, setPhaseIndex] = useState(stats.phases.length - 1);
  const [moduleIndex, setModuleIndex] = useState<number | null>(null);
  const [moduleStageIndex, setModuleStageIndex] = useState(0);
  const phase = stats.phases[phaseIndex];
  const [levelInput, setLevelInput] = useState(String(phase.maxLevel));
  const [trustInput, setTrustInput] = useState('100');
  const level = clampInteger(Number(levelInput), phase.minLevel, phase.maxLevel);
  const trust = clampInteger(Number(trustInput), 0, 200);
  const base = getBaseStats(phase, level);
  const bonus = getTrustBonus(stats, trust);
  const activeModule = moduleIndex === null ? null : upgradeModules[moduleIndex];
  const activeModuleStage = activeModule?.stages[moduleStageIndex] ?? null;
  const moduleBonuses = parseModuleStatBonuses(activeModuleStage?.attributesIncreased);
  const moduleAdjusted = applyModuleStatBonuses(base, moduleBonuses);
  const maxPhaseIndex = stats.phases.length - 1;

  const moduleLabel = (module: OperatorModule, index: number) => {
    const code = module.name?.match(/^([^:]+):/)?.[1]?.trim();
    return code || module.badgeText || `Module ${index + 1}`;
  };

  const moduleShortLabel = (module: OperatorModule, index: number) => {
    const suffix = moduleLabel(module, index).split('-').pop()?.trim() || moduleLabel(module, index);
    const symbols: Record<string, string> = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'Δ' };
    return symbols[suffix.toLowerCase()] || suffix;
  };

  return (
    <section className={styles.stats} aria-label="Operator stats" hidden={hidden}>
      <h2>Stats</h2>
      <div className={styles.buildControls}>
        <fieldset className={styles.promotion}>
          <legend>Promotion</legend>
          <div className={styles.promotionOptions}>
            {stats.phases.map((item, index) => (
              <button type="button" key={item.elite} aria-pressed={index === phaseIndex}
                className="filter-chip" aria-label={`Elite ${item.elite}`} title={`Elite ${item.elite}`}
                onClick={() => {
                  setPhaseIndex(index);
                  if (index !== maxPhaseIndex) setModuleIndex(null);
                  setLevelInput(String(level === phase.maxLevel ? item.maxLevel : clampInteger(level, item.minLevel, item.maxLevel)));
                }}>
                <OperatorGameIcon label={`Elite ${item.elite}`} />
              </button>
            ))}
          </div>
        </fieldset>

        {upgradeModules.length > 0 && (
          <fieldset className={styles.moduleControls}>
            <legend>Module</legend>
            <div className={styles.moduleRow}>
              <div className={styles.moduleOptions} role="group" aria-label="Module">
                {upgradeModules.map((module, index) => (
                  <button type="button" key={module.name ?? index} className="filter-chip"
                    aria-pressed={moduleIndex === index} disabled={phaseIndex !== maxPhaseIndex}
                    aria-label={moduleLabel(module, index)}
                    title={phaseIndex === maxPhaseIndex
                      ? `${module.name ?? moduleLabel(module, index)}${moduleIndex === index ? ' — click again to disable' : ''}`
                      : 'Modules require the final promotion'}
                    onClick={() => {
                      if (moduleIndex === index) setModuleIndex(null);
                      else {
                        setModuleIndex(index);
                        setModuleStageIndex(0);
                      }
                    }}>
                    {moduleShortLabel(module, index)}
                  </button>
                ))}
              </div>
              {activeModule && (
                <div className={styles.moduleLevels} role="group" aria-label={`${activeModule.name ?? 'Module'} level`}>
                  <span>Level</span>
                  {activeModule.stages.map((stage, index) => (
                    <button type="button" key={stage.stage ?? index} className="filter-chip"
                      aria-pressed={moduleStageIndex === index} onClick={() => setModuleStageIndex(index)}>{index + 1}</button>
                  ))}
                </div>
              )}
            </div>
          </fieldset>
        )}
      </div>

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
          const moduleAdded = moduleBonuses[key] ?? 0;
          return (
            <div key={key} className={styles.stat}>
              <dt><OperatorGameIcon label={label} src={`/stat-icons/${STAT_ICONS[key]}.webp`} size={24} /></dt>
              <dd>
                <span className={styles.total}>{format(moduleAdjusted[key] + added)}</span>
                <span className={styles.breakdown}>
                  <span>{format(base[key])} base</span>
                  {hasTrust && <span className={styles.trustBonus}>+ {format(added)} trust</span>}
                  {moduleAdded !== 0 && <span className={styles.moduleBonus}>{moduleAdded > 0 ? '+' : '−'} {format(Math.abs(moduleAdded))} module</span>}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
      <dl className={styles.secondaryStats}>
        {secondary.map(({ key, label, unit }) => (
          <div key={key}><dt><OperatorGameIcon label={label} src={`/stat-icons/${STAT_ICONS[key]}.webp`} size={24} /></dt><dd>{format(moduleAdjusted[key])}{unit && <span> {unit}</span>}</dd></div>
        ))}
      </dl>
      <p className={styles.help}>{activeModuleStage ? `Base, trust, and ${moduleLabel(activeModule!, moduleIndex!)} level ${moduleStageIndex + 1}.` : 'Base + trust.'}</p>
    </section>
  );
}
