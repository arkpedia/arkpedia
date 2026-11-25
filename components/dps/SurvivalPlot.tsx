import { useState, type CSSProperties } from 'react';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { hpAt, type HealthPoint, type simulateSurvival } from '@/lib/dps/survival';
import { fmt, Pick } from './ComparisonPlot';
import css from './Dps.module.css';

export default function SurvivalPlot({ result, duration, setDuration, hasHealers, missing }: {
  result: ReturnType<typeof simulateSurvival> | null;
  duration: number;
  setDuration: (value: number) => void;
  hasHealers: boolean;
  missing: string;
}) {
  const [probe, setProbe] = useState<number>();
  const compact = useMediaQuery('(max-width: 780px)');
  const width = compact ? 400 : 720;
  const left = 65, right = width - 24, top = 32, bottom = 229;
  const x = (time: number) => left + time / duration * (right - left);
  const maxHp = result?.peakHp ?? 1;
  const y = (hp: number) => bottom - hp / maxHp * (bottom - top);
  const path = (points: HealthPoint[]) => points.map(({ time, hp }, i) =>
    `${i ? 'L' : 'M'} ${x(time).toFixed(2)} ${y(hp).toFixed(2)}`).join(' ');
  const inspected = Math.min(probe ?? duration, duration);
  const inspectedHp = result ? hpAt(result.healed.points, inspected) : 0;
  const windows = result?.defenderWindows ?? [];
  const skillHits = result?.abilityHits.filter(hit => hit.time <= (result.healed.defeatedAt ?? duration)) ?? [];
  const latestHit = skillHits.filter(hit => hit.time <= inspected).at(-1);

  return (
    <section className={css.panel} id="survival-hp-chart">
      <div className={css.heading}>
        <h2 className="section-title">HP over time</h2>
        <Pick label="Time window" value={duration}
          options={[15, 30, 60, 90, 120].map(value => ({ value: String(value), label: value + ' s' }))}
          change={value => setDuration(Number(value))} />
      </div>
      {result ? (
        <>
          <div className={css.targetResults}>
            <div role="status">
              <strong>{result.healed.defeatedAt === null ? `Survives ${duration} s` : `Defeated at ${fmt(result.healed.defeatedAt)} s`}</strong>
              <small>{fmt(result.healed.finalHp)} / {fmt(result.finalMaxHp)} HP at {duration} s · Lowest HP {fmt(result.healed.lowest)}</small>
            </div>
            {result.basicHits > 0 && <small>Basic attacks{windows.length > 0 ? ' off-skill' : ''} · {fmt(result.dps)} DPS after defenses · {fmt(result.hitDamage)} damage per hit
              {result.basicHits > 1 && ` · ${result.basicHits} hits per attack`}</small>}
            {result.aura && <small>True damage aura · {fmt(result.aura.damage)} damage every {fmt(result.aura.interval)} s</small>}
          </div>
          <div className={css.curveFrame} style={{
            maxWidth: 295 * width / 265,
            '--axis-left': left / width * 100 + '%',
            '--axis-right': (width - right) / width * 100 + '%',
          } as CSSProperties}>
            <svg className={css.plot} viewBox={`0 0 ${width} 265`} role="img" aria-label="Operator HP over time">
              <text x="14" y="18">HP</text>
              {windows.map(window => <rect key={window.start} x={x(window.start)} y={top}
                width={x(Math.min(duration, window.end ?? duration)) - x(window.start)} height={bottom - top} fill="var(--teal-dim)" />)}
              {[0, 0.25, 0.5, 0.75, 1].map(fraction => (
                <g key={fraction}>
                  <line x1={left} x2={right} y1={y(fraction * maxHp)} y2={y(fraction * maxHp)} />
                  <text x={left - 8} y={y(fraction * maxHp) + 4} textAnchor="end">{fmt(Math.round(fraction * maxHp))}</text>
                  <text x={x(fraction * duration)} y={bottom + 19} textAnchor="middle">{fmt(fraction * duration)} s</text>
                </g>
              ))}
              {hasHealers && <path fill="none" stroke="var(--text-dim)" strokeWidth="1.6" strokeDasharray="5 4" d={path(result.alone.points)} />}
              <path fill="none" stroke="var(--teal)" strokeWidth="2" d={path(result.healed.points)} />
              {skillHits.map(hit => <circle key={hit.time} cx={x(hit.time)} cy={top - 9} r="3" fill="var(--amber)">
                <title>{hit.name} at {fmt(hit.time)} s</title>
              </circle>)}
              <line className={css.cursor} x1={x(inspected)} x2={x(inspected)} y1={top} y2={bottom} />
              <circle cx={x(inspected)} cy={y(inspectedHp)} r="3" fill="var(--teal)" />
            </svg>
            <div className={css.probe}>
              <input type="range" aria-label="Inspect time" aria-valuetext={`${fmt(inspected)} seconds, ${fmt(inspectedHp)} HP`}
                min={0} max={duration} step={0.1} value={inspected} onChange={event => setProbe(event.currentTarget.valueAsNumber)} />
              <output>{fmt(inspected)} s</output>
            </div>
          </div>
          <div className={css.targetResults} role="group" aria-label="HP at inspected time">
            <div><span style={{ borderColor: 'var(--teal)' }}>{hasHealers ? 'With healing' : 'Operator HP'}</span>
              <strong>{fmt(inspectedHp)} HP</strong></div>
            {hasHealers && <div><span style={{ borderColor: 'var(--text-dim)', borderInlineStartStyle: 'dashed' }}>Without healing</span>
              <strong>{fmt(hpAt(result.alone.points, inspected))} HP</strong>
              {result.alone.defeatedAt !== null && <small>Defeated at {fmt(result.alone.defeatedAt)} s</small>}
            </div>}
            {latestHit && <small><span style={{ borderColor: 'var(--amber)' }}>Last enemy skill hit</span> {latestHit.name} at {fmt(latestHit.time)} s · {fmt(latestHit.damage)} damage</small>}
            {result.defenderSkill && <small><span style={{ borderColor: 'var(--teal)' }}>Defender skill</span> {result.defenderSkill} · {windows.map(window =>
              window.end === null ? 'Always active' : `${fmt(window.start)}–${fmt(window.end)} s`).join(', ') || 'No activation in this window'}</small>}
          </div>
          {result.healerCycles.length > 0 && <div className={css.targetResults} role="group" aria-label="Planned healer activations">
            <small>Planned healer activations</small>
            {result.healerCycles.map(({ id, name, casts }) => <small key={id}>{name} · {casts.map(cast =>
              cast.end === null ? `${fmt(cast.start)} s (permanent)` : `${fmt(cast.start)}–${fmt(cast.end)} s`).join(', ') || 'No activation in this window'}</small>)}
          </div>}
        </>
      ) : <p>{missing}</p>}
    </section>
  );
}
