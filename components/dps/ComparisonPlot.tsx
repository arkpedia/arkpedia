import { useId, useRef, useState, type RefObject } from 'react';
import StyledSelect from '@/components/ui/StyledSelect';
import { calculate, profile, rankLabel, type Build, type Target } from '@/lib/dps/calculator';
import { firstBurst } from '@/lib/dps/breakpoints';
import { saveComparisonImage, type ImageView } from '@/lib/dps/comparisonImage';
import css from './Dps.module.css';

const colorTokens = ['--teal', '--amber', '--cat-blue', '--rarity-4', '--cat-orange', '--status-positive'];
const colorToken = (b: Build) => colorTokens[(b.id - 1) % colorTokens.length];
export const color = (b: Build) => 'var(' + colorToken(b) + ')';
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
export default function ComparisonPlot({
  builds,
  target,
  setTarget,
  targetName,
  timelineRef,
}: {
  builds: Build[];
  target: Target;
  setTarget: (t: Target) => void;
  targetName: string;
  timelineRef: RefObject<HTMLTableElement | null>;
}) {
  const [axis, setAxis] = useState<'def' | 'res' | 'injuryRes' | 'elementalRes'>('res');
  const [metric, setMetric] = useState<'dps' | 'damage' | 'injuryRate' | 'injury' | 'seconds' | 'repeat'>(
    'dps',
  );
  const [zoom, setZoom] = useState('full');
  const clipId = useId();
  const range = axis === 'def' ? Math.max(3000, Math.ceil(target.def / 500) * 500) : 100;
  const labels = {
    def: 'DEF',
    res: 'RES',
    injuryRes: 'Injury resistance',
    elementalRes: 'Elemental resistance',
  };
  const metrics = {
    seconds: 'Time to first burst (s)',
    repeat: 'First to second burst (s)',
    dps: 'HP damage / s',
    damage: 'HP damage / action',
    injuryRate: 'Injury / s',
    injury: 'Injury / action',
  };
  const points = Array.from({ length: 61 }, (_, i) => (i * range) / 60);
  const timing = metric === 'seconds' || metric === 'repeat';
  const measure = (b: Build, t: Target) =>
    metric === 'seconds' || metric === 'repeat' ? firstBurst(b, t, 'build')[metric] : calculate(b, t)[metric];
  const series = builds.map((b) => ({
    b,
    selected: measure(b, target),
    ys: points.map((x) => measure(b, { ...target, [axis]: x })),
  }));
  const highest = Math.max(1, ...series.flatMap((s) => [s.selected ?? 0, ...s.ys.map((y) => y ?? 0)]));
  const unit = 10 ** Math.floor(Math.log10(highest));
  const fullMax = (Math.ceil((highest / unit) * 2) * unit) / 2;
  const zoomOptions = [
    { value: 'full', label: 'Full range' },
    ...(timing ? [15, 30, 60].map((n) => ({ value: 's' + n, label: 'First ' + n + ' s' })) : []),
    ...[2, 4, 8, 16].map((n) => ({ value: 'x' + n, label: n + '×' })),
  ];
  const max = zoom.startsWith('s')
    ? Math.min(fullMax, Number(zoom.slice(1)))
    : zoom.startsWith('x')
      ? fullMax / Number(zoom.slice(1))
      : fullMax;
  const X = (x: number) => 62 + (x / range) * 608,
    Y = (y: number) => 218 - (y / max) * 180;
  const chart = useRef<SVGSVGElement>(null);
  const [saving, setSaving] = useState<ImageView | null>(null);
  const [exportError, setExportError] = useState('');
  async function save(view: ImageView) {
    if (!chart.current || saving || !builds.length) return;
    setSaving(view);
    setExportError('');
    try {
      await saveComparisonImage({
        view,
        svg: chart.current,
        target,
        targetName,
        metric: metrics[metric],
        probe: labels[axis] + ' ' + fmt(target[axis]),
        timeline: timelineRef.current,
        series: series.map(({ b, selected }) => ({
          build: b,
          colorToken: colorToken(b),
          value: fmt(selected) + (timing && selected !== null ? ' s' : ''),
        })),
      });
    } catch {
      setExportError('Could not create the PNG. Please try again.');
    } finally {
      setSaving(null);
    }
  }
  return (
    <section className={css.panel}>
      <div className={css.heading}>
        <h2>Response curve</h2>
        <div className={css.controls}>
          <Pick
            label="Measure"
            value={metric}
            options={Object.entries(metrics).map(([value, label]) => ({ value, label }))}
            change={(v) => {
              if (zoom.startsWith('s') && v !== 'seconds' && v !== 'repeat') setZoom('full');
              setMetric(v as typeof metric);
            }}
          />
          <Pick
            label="Vary"
            value={axis}
            options={Object.entries(labels).map(([value, label]) => ({ value, label }))}
            change={(v) => setAxis(v as typeof axis)}
          />
          <Pick label="Vertical zoom" value={zoom} options={zoomOptions} change={setZoom} />
        </div>
      </div>
      <svg
        ref={chart}
        className={css.plot}
        viewBox="0 0 700 261"
        role="img"
        aria-label={
          metrics[metric] +
          ' versus ' +
          labels[axis] +
          ', vertical range 0 to ' +
          fmt(max) +
          '. Values at the selected target are listed below.'
        }
        onPointerDown={(e) => {
          const q = e.currentTarget.createSVGPoint();
          q.x = e.clientX;
          q.y = e.clientY;
          const matrix = e.currentTarget.getScreenCTM();
          if (!matrix) return;
          const pos = q.matrixTransform(matrix.inverse());
          setTarget({
            ...target,
            [axis]: Math.max(0, Math.min(range, Math.round(((pos.x - 62) * range) / 608))),
          });
        }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x="57" y="38" width="618" height="185" />
          </clipPath>
        </defs>
        {highest > max && (
          <text x="670" y="19" textAnchor="end">
            Showing 0–{fmt(max)}
            {timing ? ' s' : ''}
          </text>
        )}
        <text x="62" y="19">
          {metrics[metric]}
        </text>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line x1="62" x2="670" y1={Y((max * i) / 4)} y2={Y((max * i) / 4)} />
            <text x="53" textAnchor="end" y={Y((max * i) / 4) + 4}>
              {fmt((max * i) / 4)}
            </text>
          </g>
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <text key={i} x={X((i * range) / 4)} y="237" textAnchor="middle">
            {fmt((i * range) / 4)}
          </text>
        ))}
        <text x="366" y="256" textAnchor="middle">
          {labels[axis]}
        </text>
        <line className={css.cursor} x1={X(target[axis])} x2={X(target[axis])} y1="34" y2="218" />
        {series.map(({ b, ys, selected }) => {
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
                stroke={color(b)}
                strokeWidth="2.5"
                strokeDasharray={b.id % 2 === 0 ? '7 3' : undefined}
              />
              {selected !== null && <circle fill={color(b)} cx={X(target[axis])} cy={Y(selected)} r="4" />}
            </g>
          );
        })}
      </svg>
      <label className={css.probe}>
        {labels[axis]}{' '}
        <input
          type="range"
          aria-label={'Inspect ' + labels[axis]}
          min={0}
          max={range}
          value={target[axis]}
          onChange={(e) => setTarget({ ...target, [axis]: +e.target.value })}
        />
        <output>{target[axis]}</output>
      </label>
      {timing && (
        <small>
          Measured from first contact against an empty gauge. The second burst includes recovery and refill. A
          dash in the legend means the burst falls outside the source’s active window or its trigger timing is
          unknown.
        </small>
      )}
      {!timing && series.some((s) => s.selected === null) && (
        <small>Choose a per-action measure to compare single activations.</small>
      )}
      <div className={css.legend}>
        {series.map(({ b, selected }) => (
          <span key={b.id}>
            <i style={{ background: color(b) }} />#{b.id} {profile(b).name}{' '}
            {b.skill ? 'S' + b.skill + ' ' + rankLabel(b.rank) : 'Normal'}{' '}
            <strong>
              {fmt(selected)}
              {timing && selected !== null ? ' s' : ''}
            </strong>
          </span>
        ))}
      </div>
      <div className={css.actions} aria-label="Export comparison" role="group">
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
      </div>
      {saving && <small role="status">Preparing PNG…</small>}
      {exportError && <small role="alert">{exportError}</small>}
    </section>
  );
}
