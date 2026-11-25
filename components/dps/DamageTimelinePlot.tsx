import type { CSSProperties, RefObject } from 'react';
import { damageAtTime, type DamageTargetPhase, type DamageTimeline } from '@/lib/dps/damageTimeline';
import css from './Dps.module.css';

const formatTick = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export default function DamageTimelinePlot({
  rows,
  activation,
  duration,
  time,
  inspect,
  width,
  chart,
  phases,
}: {
  rows: { id: number; timeline: DamageTimeline | null; color: string }[];
  activation: number;
  duration: number;
  time: number;
  inspect: (time: number) => void;
  width: number;
  chart: RefObject<SVGSVGElement | null>;
  phases: DamageTargetPhase[];
}) {
  const left = 62;
  const right = width - 30;
  const top = 38;
  const bottom = 218;
  const x = (s: number) => left + (s / duration) * (right - left);
  const plotted = rows.flatMap(({ id, timeline, color }, index) => {
    if (!timeline) return [];
    const times = new Set([0, duration]);
    for (const phase of phases) {
      if (phase.start <= duration) times.add(phase.start);
    }
    if (activation <= duration && (timeline.skill || timeline.opening)) {
      times.add(activation);
      if (timeline.skill) times.add(Math.min(duration, activation + timeline.skill.duration));
      if (timeline.opening) times.add(Math.min(duration, activation + 1));
    }
    const points = [...times].sort((a, b) => a - b).map(s => [s, damageAtTime(timeline, s, activation).dps] as const);
    return [{ id, color, index, points, cursor: damageAtTime(timeline, time, activation).dps }];
  });
  const peak = Math.max(1, ...plotted.flatMap(row => row.points.map(([, dps]) => dps)));
  const unit = 10 ** Math.floor(Math.log10(peak));
  const max = Math.ceil(peak / unit * 2) * unit / 2;
  const y = (dps: number) => bottom - (dps / max) * (bottom - top);
  const skillDurations = new Set(rows.flatMap(row => row.timeline ? [row.timeline.skill?.duration ?? 0] : []));
  const skillDuration = skillDurations.size === 1 ? [...skillDurations][0] : 0;
  const namedPhases = phases.filter((phase, i) => phase.name !== phases[i - 1]?.name);
  const inspectedPhase = namedPhases.filter(phase => phase.start <= time).at(-1);

  return (
    <div className={css.curveFrame}
      style={{
        maxWidth: (295 * width) / 261,
        '--axis-left': (left / width) * 100 + '%',
        '--axis-right': ((width - right) / width) * 100 + '%',
      } as CSSProperties}>
      <svg ref={chart} className={css.plot} viewBox={`0 0 ${width} 261`} role="img"
        aria-label="Damage per second over time. Use the time slider for exact values."
        onPointerDown={event => {
          const svg = event.currentTarget;
          const matrix = svg.getScreenCTM();
          if (!matrix) return;
          const point = svg.createSVGPoint();
          point.x = event.clientX;
          point.y = event.clientY;
          const position = point.matrixTransform(matrix.inverse());
          inspect(Math.max(0, Math.min(duration, Math.round(((position.x - left) / (right - left)) * duration * 10) / 10)));
        }}>
        <text x={namedPhases.length ? 12 : left} y="19">DPS</text>
        {skillDuration > 0 && activation < duration && (
          <rect x={x(activation)} y={top} width={x(Math.min(duration, activation + skillDuration)) - x(activation)}
            height={bottom - top} fill="var(--teal)" fillOpacity=".1" />
        )}
        {phases.map((phase, index) => phase.invulnerable && phase.start < duration && (
          <rect key={phase.name} x={x(phase.start)} y={top}
            width={x(Math.min(duration, phases[index + 1]?.start ?? duration)) - x(phase.start)}
            height={bottom - top} fill="var(--text-faint)" fillOpacity=".15" />
        ))}
        {[0, 1, 2, 3, 4].map(i => (
          <g key={i}>
            <line x1={left} x2={right} y1={y(max * i / 4)} y2={y(max * i / 4)} />
            <text x={left - 9} y={y(max * i / 4) + 4} textAnchor="end">{formatTick.format(max * i / 4)}</text>
          </g>
        ))}
        {[0, duration / 3, duration * 2 / 3, duration].map(s => (
          <text key={s} x={x(s)} y="237" textAnchor="middle">{formatTick.format(s)}</text>
        ))}
        <text x={(left + right) / 2} y="256" textAnchor="middle">Time (s)</text>
        {namedPhases.map((phase, index) => {
          if (phase.start >= duration) return null;
          const finish = Math.min(duration, namedPhases[index + 1]?.start ?? duration);
          const phaseWidth = x(finish) - x(phase.start);
          return <g key={phase.name}>
            {index > 0 && <line x1={x(phase.start)} x2={x(phase.start)} y1={top} y2={bottom} style={{ stroke: 'var(--text-faint)' }} />}
            {phaseWidth >= 68 && <text x={x(phase.start) + phaseWidth / 2} y="19" textAnchor="middle">{phase.name}</text>}
          </g>;
        })}
        <line className={css.cursor} x1={x(time)} x2={x(time)} y1={top} y2={bottom} />
        {plotted.map(({ id, color, index, points, cursor }) => (
          <g key={id}>
            <path
              d={points.map(([s, dps], i) => i ? `H ${x(s)} V ${y(dps)}` : `M ${x(s)} ${y(dps)}`).join(' ')}
              fill="none" stroke={color} strokeWidth="2.5" strokeDasharray={index % 2 === 1 ? '7 3' : undefined} />
            <circle cx={x(time)} cy={y(cursor)} r="4" fill={color} />
          </g>
        ))}
      </svg>
      <label className={css.probe}>
        <input type="range" aria-label="Inspect time" aria-valuetext={formatTick.format(time) + ' seconds'
            + (inspectedPhase ? ', ' + inspectedPhase.name : '')}
          min={0} max={duration} step={0.1} value={time} onChange={event => inspect(event.currentTarget.valueAsNumber)} />
        <output>{formatTick.format(time)} s</output>
      </label>
    </div>
  );
}
