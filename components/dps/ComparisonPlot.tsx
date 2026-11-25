import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import { downloadBlob } from '@/lib/ui/downloadBlob';
import { ContentImg } from '@/components/content/ContentImage';
import SegmentedControl from '@/components/ui/SegmentedControl';
import StyledSelect from '@/components/ui/StyledSelect';
import {
  buildConditions,
  calculate,
  defaultSource,
  profile,
  rankLabel,
  selectedModule,
  type Build,
  type Target,
} from '@/lib/dps/calculator';
import { firstBurst } from '@/lib/dps/breakpoints';
import { chartControls, type ChartMetric as Metric, type DefenseAxis } from '@/lib/dps/controls';
import { damageBasis, dpsLabel, sharedDamageBasis } from '@/lib/dps/damageLabels';
import { damageAtTime, damageTimeline } from '@/lib/dps/damageTimeline';
import { renderComparisonImage, type ImageView } from '@/lib/dps/comparisonImage';
import DamageTimelinePlot from './DamageTimelinePlot';
import css from './Dps.module.css';

const colorTokens = ['--teal', '--amber', '--cat-blue', '--rarity-4', '--cat-orange', '--status-positive'];
const colorToken = (index: number) => colorTokens[index % colorTokens.length];
export const color = (index: number) => 'var(' + colorToken(index) + ')';
export const fmt = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
export function Pick({
  label,
  value,
  options,
  change,
}: {
  label: string;
  value: string | number;
  options: (string | number | { value: string; label: string })[];
  change: (s: string) => void;
}) {
  return (
    <div className={css.field}>
      <span>{label}</span>
      <StyledSelect
        label={label}
        value={String(value)}
        onChange={change}
        options={options.map((o) => (typeof o === 'object' ? o : { label: String(o), value: String(o) }))}
      />
    </div>
  );
}
const chartViews = [
  { value: 'curve', label: 'Response curve' },
  { value: 'bars', label: 'At target' },
  { value: 'damage-time', label: 'Timeline' },
  { value: 'timeline', label: 'Elemental burst' },
] as const;
type View = (typeof chartViews)[number]['value'];
const labels: Record<DefenseAxis, string> = {
  def: 'DEF',
  res: 'RES',
  injuryRes: 'Injury resistance',
  elementalRes: 'Elemental resistance',
};
function resultValue(result: ReturnType<typeof calculate>, metric: Exclude<Metric, 'seconds' | 'repeat'>) {
  return metric === 'damage' && result.hps !== null ? null : result[metric];
}
function measure(b: Build, t: Target, metric: Metric) {
  return metric === 'seconds' || metric === 'repeat'
    ? firstBurst(b, t, 'build')[metric]
    : resultValue(calculate(b, t), metric);
}
function seriesLabels(builds: Build[]) {
  const descriptions = builds.map((b) => [
    'E' + b.elite + ' Lv ' + b.level,
    'P' + b.potential,
    b.stage ? selectedModule(b)!.name + b.stage : 'No module',
    b.operator === 'phatm2' && b.skill === 2 ? (b.plotSummon ? 'Blood’s Whisper' : 'Skill attacks') : '',
    buildConditions(b),
  ]);
  return builds.map((b, i) => {
    const peers = builds.flatMap((peer, j) =>
      peer.operator === b.operator && peer.skill === b.skill ? [descriptions[j]] : [],
    );
    const differences = descriptions[i].filter((value, k) => peers.some((peer) => peer[k] !== value));
    return [
      profile(b).name + (b.skill ? ' S' + b.skill + ' ' + rankLabel(b.rank) : ' · ' + defaultSource(b)),
      ...differences,
    ]
      .filter(Boolean)
      .join(' · ');
  });
}
const metricUnits: Record<Metric, string> = {
  dps: 'DPS',
  damage: 'damage',
  hps: 'HPS',
  injuryRate: 'injury/s',
  injury: 'injury',
  seconds: 's',
  repeat: 's',
};
const isPerSource = (metric: Metric) => metric === 'damage' || metric === 'injury';
function metricValue(value: number | null, metric: Metric, result: ReturnType<typeof calculate>) {
  if (value === null) return '—';
  return fmt(value) + ' ' + metricUnits[metric] + (isPerSource(metric) ? ' ' + damageBasis(result) : '');
}
function targetDelta(value: number, baseline: number, metric: Metric, reference: number) {
  const delta = value - baseline;
  const magnitude = fmt(Math.abs(delta));
  if (magnitude === '0') return 'Same as #' + reference;
  if (metric === 'seconds' || metric === 'repeat')
    return magnitude + ' s ' + (delta < 0 ? 'faster' : 'slower') + ' than #' + reference;
  return (delta > 0 ? '+' : '−') + magnitude + ' ' + metricUnits[metric] + ' vs #' + reference;
}
export default function ComparisonPlot({
  builds,
  target,
  targetName,
  targetNote,
  timelineRef,
  baselineId,
}: {
  builds: Build[];
  target: Target;
  targetName: string;
  targetNote?: string;
  timelineRef: RefObject<HTMLTableElement | null>;
  baselineId?: number;
}) {
  const [chosenView, setView] = useState<View>('curve');
  const [chosenAxis, setAxis] = useState<DefenseAxis>();
  const [chosenMetric, setMetric] = useState<Metric>();
  const results = useMemo(() => builds.map((b) => calculate(b, target)), [builds, target]);
  const basis = sharedDamageBasis(results.filter(result => result.hps === null || result.damage > 0));
  const metrics: Record<Metric, string> = {
    seconds: 'Time to first burst (s)',
    repeat: 'First to second burst (s)',
    dps: dpsLabel(builds),
    damage: 'Damage ' + basis,
    hps: 'HPS',
    injuryRate: 'Injury per second',
    injury: 'Injury ' + basis,
  };
  const setup = useMemo(() => chartControls(builds, target, chosenMetric), [builds, target, chosenMetric]);
  const { metric, defaultMetric, axes } = setup;
  const views = chartViews.filter(option => option.value === 'bars'
    || (option.value === 'curve' && axes.length > 0)
    || (option.value === 'damage-time' && results.some(r => r.damage > 0))
    || (option.value === 'timeline' && metric !== 'hps' && setup.burstTimeline));
  const view = views.some(option => option.value === chosenView) ? chosenView : 'bars';
  const showingDamageTime = view === 'damage-time';
  const names = useMemo(() => seriesLabels(builds), [builds]);
  const defaultAxis = axes[0] ?? 'def';
  const manualAxis = chosenAxis && axes.includes(chosenAxis) ? chosenAxis : undefined;
  const axis = manualAxis ?? defaultAxis;
  const [inspection, setInspection] = useState<{ target: Target; axis: DefenseAxis; value: number } | null>(null);
  const inspect = (value: number) => setInspection({ target, axis, value });
  const [limits, setLimits] = useState<Partial<Record<DefenseAxis, number>>>({});
  const defaultRange = axis === 'def' ? Math.max(3000, Math.ceil(target.def / 500) * 500) : Math.max(100, target[axis]);
  const range = limits[axis] ?? defaultRange;
  const inspected = inspection?.target === target && inspection.axis === axis;
  const probe = view === 'curve' ? Math.min(range, inspected ? inspection.value : target[axis]) : target[axis];
  const [chosenZoom, setZoom] = useState('full');
  const clipId = useId();
  const timing = metric === 'seconds' || metric === 'repeat';
  const zoom = !timing && chosenZoom.startsWith('s') ? 'full' : chosenZoom;
  const points = useMemo(() => Array.from({ length: 61 }, (_, i) => (i * range) / 60), [range]);
  const curves = useMemo(
    () =>
      view === 'curve'
        ? builds.map((b) => points.map((x) => measure(b, { ...target, [axis]: x }, metric)))
        : [],
    [view, builds, points, target, axis, metric],
  );
  const targetMetric = view === 'timeline' ? 'seconds' : metric;
  const showingHealing = !showingDamageTime && targetMetric === 'hps';
  const scenarioName = showingHealing ? 'One injured ally' : targetName;
  const targetBursts = useMemo(
    () => (view === 'timeline' || timing ? builds.map((b) => firstBurst(b, target, 'build')) : []),
    [view, timing, builds, target],
  );
  const targetValues = results.map((r, i) =>
    targetMetric === 'seconds' || targetMetric === 'repeat' ? targetBursts[i][targetMetric] : resultValue(r, targetMetric),
  );
  const baseline = Math.max(0, builds.findIndex(build => build.id === baselineId));
  const series = builds.map((b, i) => ({
    b,
    result: results[i],
    selected: probe === target[axis] ? targetValues[i] : measure(b, { ...target, [axis]: probe }, metric),
    burst: view === 'timeline' ? targetBursts[i] : null,
    ys: curves[i] ?? [],
  }));
  const lastTime = Math.max(
    1,
    ...series.map(({ burst }) => (burst?.seconds == null ? 0 : burst.seconds + (burst.repeat ?? 0))),
  );
  const legendValue = (row: (typeof series)[number]) => {
    if (view !== 'timeline') return metricValue(row.selected, metric, row.result);
    const r = row.burst;
    if (!r?.amount) return 'No elemental buildup';
    if (r.seconds == null)
      return r.count ? fmt(r.count) + ' ' + r.unit + ' · timing unknown' : 'No modeled burst in this window';
    return (
      fmt(r.seconds) +
      ' s first' +
      (r.repeat == null ? ' · second unknown' : ' · ' + fmt(r.seconds + r.repeat) + ' s second')
    );
  };
  const highest = Math.max(1, ...series.flatMap((s) => [s.selected ?? 0, ...s.ys.map((y) => y ?? 0)]));
  const unit = 10 ** Math.floor(Math.log10(highest));
  const fullMax = (Math.ceil((highest / unit) * 2) * unit) / 2;
  const zoomOptions = [
    { value: 'full', label: 'Full range' },
    ...(timing ? [15, 30, 60].map((n) => ({ value: 's' + n, label: n + ' s window' })) : []),
    ...[2, 4, 8, 16].map((n) => ({ value: 'x' + n, label: n + '×' })),
  ];
  const span = zoom.startsWith('s')
    ? Math.min(fullMax, Number(zoom.slice(1)))
    : zoom.startsWith('x')
      ? fullMax / Number(zoom.slice(1))
      : fullMax;
  const values = series.flatMap((row) => (row.selected === null ? [] : [row.selected]));
  const low = Math.min(...values),
    high = Math.max(...values);
  const focus = high - low <= span ? (low + high) / 2 : (series[baseline]?.selected ?? values[0]);
  const min = values.length ? Math.max(0, Math.min(fullMax - span, focus - span / 2)) : 0;
  const max = min + span;
  const panel = useRef<HTMLElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (!panel.current) return;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 520));
    observer.observe(panel.current);
    return () => observer.disconnect();
  }, []);
  const chartWidth = compact ? 400 : 700;
  const right = chartWidth - 30;
  const plotWidth = right - 62;
  const X = (x: number) => 62 + (x / range) * plotWidth,
    Y = (y: number) => 218 - ((y - min) / span) * 180;
  const chart = useRef<SVGSVGElement>(null);
  const [duration, setDuration] = useState(45);
  const [activationTime, setActivationTime] = useState(5);
  const [inspectedTime, setInspectedTime] = useState(5);
  const activation = Math.min(duration - 1, activationTime);
  const time = Math.min(duration, inspectedTime);
  const damageModels = useMemo(() => showingDamageTime
    ? builds.map((b, i) => damageTimeline(b, target, results[i]))
    : [], [showingDamageTime, builds, target, results]);
  const damageRows = damageModels.map((timeline, i) => {
    const sample = timeline && damageAtTime(timeline, time, activation);
    let value = 'Timeline unavailable';
    if (timeline && sample) {
      const phase = (sample.openingDamage && timeline.opening?.label) || (
        sample.skillActive ? 'Skill active' : sample.retreated ? 'Retreated'
          : timeline.attackDps > 0 ? 'Normal attacks' : 'Skill inactive'
      );
      value = fmt(sample.dps) + ' DPS · ' + phase;
    }
    const details = [];
    if (timeline?.skill) {
      const { duration: length, dps } = timeline.skill;
      details.push(`Skill DPS ${fmt(dps)} · ${fmt(activation)}–${fmt(activation + length)} s (${fmt(length)} s)`);
    }
    if (timeline?.opening) {
      details.push(`${timeline.opening.label} at ${fmt(activation)} s · ${fmt(timeline.opening.damage)} damage`);
    }
    if (timeline?.attackDps && (timeline.skill || timeline.opening)) {
      details.push(`Attack DPS ${fmt(timeline.attackDps)}`);
    }
    return { id: builds[i].id, color: color(i), timeline, value, details };
  });
  const hasDamageTimeline = damageRows.some(row => row.timeline);
  const [saving, setSaving] = useState<ImageView | null>(null);
  const [preview, setPreview] = useState<{ view: ImageView; blob: Blob } | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  useEffect(() => {
    if (!preview) return;
    const url = URL.createObjectURL(preview.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [preview]);
  const [exportError, setExportError] = useState('');
  async function save(imageView: ImageView) {
    if (!chart.current || saving || !builds.length) return;
    setSaving(imageView);
    setExportError('');
    try {
      const blob = await renderComparisonImage({
        view: imageView,
        svg: chart.current,
        target,
        targetName: scenarioName,
        targetNote: showingHealing ? undefined : targetNote,
        healingView: showingHealing,
        metric: showingDamageTime ? 'Damage timeline' : view === 'timeline' ? 'Elemental burst' : metrics[metric],
        probe: showingDamageTime ? fmt(time) + ' s' : view === 'curve' ? labels[axis] + ' ' + fmt(probe) : 'Selected target',
        timeline: showingHealing || showingDamageTime ? null : timelineRef.current,
        series: series.map((row, index) => ({
          build: row.b,
          colorToken: colorToken(index),
          value: damageRows[index]?.value ?? legendValue(row),
          details: damageRows[index]?.details,
        })),
      });
      setPreview({ view: imageView, blob });
    } catch {
      setExportError('Could not create the PNG. Please try again.');
    } finally {
      setSaving(null);
    }
  }
  return (
    <section id="damage-comparison" tabIndex={-1} ref={panel} className={css.panel}>
      <div className={css.heading}>
        <h2 className="section-title">{showingHealing ? 'Healing comparison' : 'Damage comparison'}</h2>
        {views.length > 1 && <SegmentedControl
          label="Chart view"
          options={views}
          value={view}
          onChange={setView}
        />}
      </div>
      {showingDamageTime ? (
        <>
          {hasDamageTimeline && (
            <>
              <div className={css.heading}>
                <div className={css.controls}>
                  <Pick label="Chart length" value={duration} options={[15, 30, 45, 60, 90, 120].map(s => ({
                    value: String(s), label: s + ' s',
                  }))} change={value => setDuration(Number(value))} />
                  {damageRows.some(row => row.timeline?.skill || row.timeline?.opening) && (
                    <label className={css.field}>
                      Activate skill at (s)
                      <input type="number" min={0} max={duration - 1} value={activation}
                        onChange={event => {
                          const value = event.currentTarget.valueAsNumber;
                          const next = Number.isFinite(value) ? Math.max(0, Math.min(duration - 1, Math.round(value))) : 0;
                          setActivationTime(next);
                          setInspectedTime(next);
                        }} />
                    </label>
                  )}
                </div>
              </div>
              <DamageTimelinePlot rows={damageRows} activation={activation} duration={duration}
                time={time} inspect={setInspectedTime} width={chartWidth} chart={chart} />
            </>
          )}
          <div className={css.targetResults} role="group" aria-label="Damage timeline results">
            <small>{targetName}{hasDamageTimeline && ' · ' + fmt(time) + ' s'}</small>
            {damageRows.map((row, i) => (
              <div key={row.id}>
                <span style={{ borderColor: row.color }}>#{i + 1} {names[i]}</span>
                <strong>{row.value}</strong>
                {row.details.map(detail => <small key={detail}>{detail}</small>)}
              </div>
            ))}
          </div>
          {hasDamageTimeline && (
            <small>
              Shows one activation using average DPS for each phase.
              {damageRows.some(row => row.timeline?.opening) && ' Opening damage appears as a one-second spike at activation.'}
            </small>
          )}
          {damageRows.some(row => !row.timeline) && (
            <small>Timeline supports normal attacks, timed skills, and single casts with known damage. Select At target for other sources.</small>
          )}
        </>
      ) : <>
      {(view === 'curve' || (setup.metrics.length > 1 && (view !== 'timeline' || setup.metrics.includes('hps')))) && (
        <div className={css.heading}>
          <div className={css.controls}>
            {setup.metrics.length > 1 && <Pick
              label="Measure"
              value={chosenMetric && setup.metrics.includes(chosenMetric) ? chosenMetric : 'auto'}
              options={[
                { value: 'auto', label: 'Auto · ' + metrics[defaultMetric] },
                ...setup.metrics.map(value => ({ value, label: metrics[value] })),
              ]}
              change={v => {
                setMetric(v === 'auto' ? undefined : v as Metric);
                if (view === 'timeline') setView('curve');
              }}
            />}
            {view === 'curve' && (
              <Pick
                label="Vary"
                value={manualAxis ?? 'auto'}
                options={[
                  { value: 'auto', label: 'Auto · ' + labels[defaultAxis] },
                  ...axes.map(value => ({ value, label: labels[value] })),
                ]}
                change={v => setAxis(v === 'auto' ? undefined : v as DefenseAxis)}
              />
            )}
          </div>
        </div>
      )}
      <div className={css.targetResults} role="group" aria-label="Selected target results">
        <small>
          {scenarioName} · {metrics[targetMetric]}
        </small>
        {series.map(({ b, result }, i) => (
          <div key={b.id}>
            <span style={{ borderColor: color(i) }}>
              #{i + 1} {names[i]}
            </span>
            <strong>
              {targetValues[i] === null
                ? 'Unavailable'
                : metricValue(targetValues[i], targetMetric, result)}
            </strong>
            {series.length > 1 && i === baseline && <small>Baseline</small>}
            {i !== baseline && targetValues[i] !== null && targetValues[baseline] !== null
              && (!isPerSource(targetMetric) || damageBasis(result) === damageBasis(results[baseline])) && (
              <small>{targetDelta(targetValues[i], targetValues[baseline], targetMetric, baseline + 1)}</small>
            )}
          </div>
        ))}
      </div>
      {view === 'curve' ? (
        <div
          className={css.curveFrame}
          style={
            {
              maxWidth: (295 * chartWidth) / 261,
              '--axis-left': (62 / chartWidth) * 100 + '%',
              '--axis-right': ((chartWidth - right) / chartWidth) * 100 + '%',
            } as CSSProperties
          }
        >
          <svg
            ref={chart}
            className={css.plot}
            viewBox={`0 0 ${chartWidth} 261`}
            role="img"
            aria-label={
              metrics[metric] +
              ' versus ' +
              labels[axis] +
              ', vertical range ' +
              fmt(min) +
              ' to ' +
              fmt(max) +
              '. Values are listed alongside the chart.'
            }
            onPointerDown={(e) => {
              const q = e.currentTarget.createSVGPoint();
              q.x = e.clientX;
              q.y = e.clientY;
              const matrix = e.currentTarget.getScreenCTM();
              if (!matrix) return;
              const pos = q.matrixTransform(matrix.inverse());
              inspect(Math.max(0, Math.min(range, Math.round(((pos.x - 62) * range) / plotWidth))));
            }}
          >
            <defs>
              <clipPath id={clipId}>
                <rect x="57" y="38" width={plotWidth + 10} height="185" />
              </clipPath>
            </defs>
            {span < fullMax && (
              <text x={right} y="35" textAnchor="end">
                Showing {fmt(min)}–{fmt(max)}
                {timing ? ' s' : ''}
              </text>
            )}
            <text x="62" y="19">
              {metrics[metric]}
            </text>
            {[0, 1, 2, 3, 4].map((i) => (
              <g key={i}>
                <line x1="62" x2={right} y1={Y(min + (span * i) / 4)} y2={Y(min + (span * i) / 4)} />
                <text x="53" textAnchor="end" y={Y(min + (span * i) / 4) + 4}>
                  {fmt(min + (span * i) / 4)}
                </text>
              </g>
            ))}
            {[0, 1, 2, 3, 4].map((i) => (
              <text key={i} x={X((i * range) / 4)} y="237" textAnchor="middle">
                {fmt((i * range) / 4)}
              </text>
            ))}
            <text x={62 + plotWidth / 2} y="256" textAnchor="middle">
              {labels[axis]}
            </text>
            <line className={css.cursor} x1={X(probe)} x2={X(probe)} y1="34" y2="218" />
            {series.map(({ b, ys, selected }, index) => {
              let path = '';
              ys.forEach((y, i) => {
                if (y === null) return;
                const x = X(points[i]);
                path +=
                  i === 0 || ys[i - 1] === null
                    ? ' M' + x + ',' + Y(y)
                    : timing
                      ? ' H' + x + ' V' + Y(y)
                      : ' L' + x + ',' + Y(y);
              });
              return (
                <g key={b.id} clipPath={'url(#' + clipId + ')'}>
                  <path
                    d={path}
                    fill="none"
                    stroke={color(index)}
                    strokeWidth="2.5"
                    strokeDasharray={index % 2 === 1 ? '7 3' : undefined}
                  />
                  {selected !== null && <circle fill={color(index)} cx={X(probe)} cy={Y(selected)} r="4" />}
                </g>
              );
            })}
          </svg>
          <label className={css.probe}>
            <input
              type="range"
              aria-label={'Inspect ' + labels[axis]}
              min={0}
              max={range}
              value={probe}
              onChange={(e) => inspect(+e.target.value)}
            />
            <output>{fmt(probe)}</output>
          </label>
        </div>
      ) : (
        <svg
          ref={chart}
          className={css.rowPlot}
          viewBox={'0 0 400 ' + ((view === 'timeline' ? 36 : 20) + series.length * 36)}
          role="img"
          aria-label={
            view === 'bars'
              ? showingHealing ? 'Healing per second for one ally' : metrics[metric] + ' at the selected target'
              : 'First and second elemental bursts from first contact'
          }
        >
          <text x="12" y="16">
            {view === 'bars' ? metrics[metric] : 'Seconds from first contact'}
          </text>
          {series.map((row, i) => {
            const y = 44 + 36 * i,
              start = 14,
              span = 312;
            const r = row.burst;
            const timeX = (t: number) => start + (span * t) / lastTime;
            return (
              <g key={row.b.id}>
                <text x="12" y={y - 9}>
                  #{i + 1} {profile(row.b).name} · {row.b.skill ? 'S' + row.b.skill : 'Normal'}
                </text>
                <line x1={start} x2={start + span} y1={y} y2={y} />
                {view === 'bars' ? (
                  <>
                    {row.selected !== null && (
                      <rect
                        x={start}
                        y={y - 5}
                        height="10"
                        width={(span * row.selected) / highest}
                        fill={color(i)}
                      />
                    )}
                    <text x="391" y={y + 4} textAnchor="end">
                      {fmt(row.selected)}
                    </text>
                  </>
                ) : r?.seconds != null ? (
                  <>
                    <path stroke={color(i)} strokeWidth="3" d={`M ${start} ${y} H ${timeX(r.seconds)}`} />
                    {r.repeat !== null && (
                      <>
                        <path
                          stroke={color(i)}
                          strokeWidth="3"
                          strokeDasharray="3 3"
                          d={`M ${timeX(r.seconds)} ${y} h ${(span * (r.recovery ?? 0)) / lastTime}`}
                        />
                        <path
                          stroke={color(i)}
                          strokeWidth="3"
                          d={`M ${timeX(r.seconds + (r.recovery ?? 0))} ${y} H ${timeX(r.seconds + r.repeat)}`}
                        />
                        <circle cx={timeX(r.seconds + r.repeat)} cy={y} r="4" fill={color(i)} />
                      </>
                    )}
                    <circle cx={timeX(r.seconds)} cy={y} r="4" fill={color(i)} />
                  </>
                ) : (
                  <text x="391" y={y + 4} textAnchor="end">
                    —
                  </text>
                )}
              </g>
            );
          })}
          {view === 'timeline' &&
            [0, 0.5, 1].map((f) => (
              <text key={f} x={14 + f * 312} y={29 + series.length * 36} textAnchor="middle">
                {fmt(f * lastTime)} s
              </text>
            ))}
        </svg>
      )}
      {view === 'timeline' && (
        <small>
          Dots mark bursts. The dotted interval shows recovery before injury can build again. Each source
          starts with an empty gauge.
        </small>
      )}
      {view === 'curve' && (
        <details className={css.chartSettings}>
          <summary>Chart settings</summary>
          <div className={css.controls}>
            <Pick label="Vertical zoom" value={zoom} options={zoomOptions} change={setZoom} />
            <label className={css.field}>
              {labels[axis]} axis maximum
              <input type="number" min={1} max={axis === 'def' ? undefined : defaultRange}
                placeholder={String(defaultRange)} value={limits[axis] ?? ''}
                onChange={event => {
                  const next = event.currentTarget.valueAsNumber;
                  const max = axis === 'def' ? Infinity : defaultRange;
                  setLimits(previous => ({ ...previous, [axis]: Number.isFinite(next) ? Math.min(max, Math.max(1, next)) : undefined }));
                }} />
            </label>
            {inspected && <button type="button" className="ghost btn-sm" onClick={() => {
              setInspection(null);
              if (target[axis] > range) setLimits(previous => ({ ...previous, [axis]: undefined }));
            }}>Reset probe to target</button>}
          </div>
        </details>
      )}
      {view !== 'timeline' && timing && (
        <small>
          Measured from first contact against an empty gauge. The second burst includes recovery and refill. A
          dash in the legend means the burst falls outside the source’s active window or its trigger timing is
          unknown.
        </small>
      )}
      {view !== 'timeline' && (metric === 'dps' || metric === 'injuryRate') && (
        <small>{metric === 'dps' ? 'DPS' : 'Injury per second'} averages the source while it is active.
          {series.some(row => row.selected === null && row.result.hps === null) && ' For a single cast or trigger, choose its damage or injury total.'}
        </small>
      )}
      {showingHealing && (
        <small>HPS is healing per second for one ally in range with HP to restore. It uses the selected source while active.</small>
      )}
      {view !== 'timeline' && isPerSource(metric) && (
        <small>Each value covers all modeled hits from the listed attack, tick or use against one target.</small>
      )}
      {(view === 'timeline' || timing) && builds.some((b) => b.operator === 'cello' && b.skill === 1) && (
        <small>
          Virtuosa S1 timing assumes full opening charges, one target in her aura, and uninterrupted SP
          recovery.
        </small>
      )}
      {(view === 'timeline' || (view === 'curve' && probe !== target[axis])) && (
        <div className={css.legend}>
          {view === 'curve' && (
            <small>
              At {labels[axis]} {fmt(probe)}
            </small>
          )}
          {series.map((row, index) => (
            <span key={row.b.id}>
              <i style={{ background: color(index) }} />#{index + 1} {names[index]}{' '}
              <strong>{legendValue(row)}</strong>
            </span>
          ))}
        </div>
      )}
      </>}
      {(!showingDamageTime || hasDamageTimeline) && <div className={css.actions} aria-label="Export comparison" role="group">
        {(['condensed', 'detailed'] as const).map((view) => (
          <button
            type="button"
            key={view}
            className="btn btn-sm"
            disabled={!!saving || !builds.length}
            onClick={() => void save(view)}
          >
            {view === 'condensed' ? 'Condensed PNG' : 'Detailed PNG'}
          </button>
        ))}
      </div>}
      {preview && (
        <ImportDialog
          title={(preview.view === 'condensed' ? 'Condensed' : 'Detailed') + ' PNG preview'}
          className={'account-dialog-fit ' + css.previewDialog}
          onClose={() => {
            setPreview(null);
            setPreviewUrl('');
          }}
          actions={
            <button
              className="btn primary btn-sm"
              onClick={() => downloadBlob(preview.blob, 'arkpedia-dps-' + preview.view + '.png')}
            >
              Save image
            </button>
          }
        >
          {previewUrl && (
            <ContentImg className={css.previewImage} src={previewUrl} alt="DPS comparison export" />
          )}
        </ImportDialog>
      )}
      {saving && <small role="status">Preparing PNG…</small>}
      {exportError && <small role="alert">{exportError}</small>}
    </section>
  );
}
