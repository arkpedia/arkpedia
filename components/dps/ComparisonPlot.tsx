import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import { downloadBlob } from '@/lib/ui/downloadBlob';
import { ContentImg } from '@/components/content/ContentImage';
import SegmentedControl from '@/components/ui/SegmentedControl';
import StyledSelect from '@/components/ui/StyledSelect';
import { calculate, profile, rankLabel, type Build, type Target } from '@/lib/dps/calculator';
import { firstBurst } from '@/lib/dps/breakpoints';
import { renderComparisonImage, type ImageView } from '@/lib/dps/comparisonImage';
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
type Metric = 'dps' | 'damage' | 'injuryRate' | 'injury' | 'seconds' | 'repeat';
function measure(b: Build, t: Target, metric: Metric) {
  return metric === 'seconds' || metric === 'repeat'
    ? firstBurst(b, t, 'build')[metric]
    : calculate(b, t)[metric];
}
export default function ComparisonPlot({
  builds,
  target,
  targetName,
  timelineRef,
}: {
  builds: Build[];
  target: Target;
  targetName: string;
  timelineRef: RefObject<HTMLTableElement | null>;
}) {
  const [view, setView] = useState<'curve' | 'bars' | 'timeline'>('curve');
  const [chosenAxis, setAxis] = useState<'def' | 'res' | 'injuryRes' | 'elementalRes'>();
  const [chosenMetric, setMetric] = useState<Metric>();
  const results = useMemo(() => builds.map((b) => calculate(b, target)), [builds, target]);
  const metric = chosenMetric ?? (results.every((r) => r.dps === null) ? 'damage' : 'dps');
  const axis =
    chosenAxis ??
    (['seconds', 'repeat', 'injury', 'injuryRate'].includes(metric)
      ? 'injuryRes'
      : results.every((r) => r.components.Physical > 0 && r.components.Arts === 0)
        ? 'def'
        : 'res');
  const [inspection, setInspection] = useState<{ target: Target; axis: string; value: number } | null>(null);
  const inspect = (value: number) => setInspection({ target, axis, value });
  const probe =
    view === 'curve' && inspection?.target === target && inspection.axis === axis
      ? inspection.value
      : target[axis];
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
  const timing = metric === 'seconds' || metric === 'repeat';
  const points = useMemo(() => Array.from({ length: 61 }, (_, i) => (i * range) / 60), [range]);
  const curves = useMemo(
    () =>
      view === 'curve'
        ? builds.map((b) => points.map((x) => measure(b, { ...target, [axis]: x }, metric)))
        : [],
    [view, builds, points, target, axis, metric],
  );
  const series = builds.map((b, i) => ({
    b,
    selected:
      view === 'timeline'
        ? null
        : measure(b, probe === target[axis] ? target : { ...target, [axis]: probe }, metric),
    burst: view === 'timeline' ? firstBurst(b, target, 'build') : null,
    ys: curves[i] ?? [],
  }));
  const lastTime = Math.max(
    1,
    ...series.map(({ burst }) => (burst?.seconds == null ? 0 : burst.seconds + (burst.repeat ?? 0))),
  );
  const legendValue = (row: (typeof series)[number]) => {
    if (view !== 'timeline') return fmt(row.selected) + (timing && row.selected !== null ? ' s' : '');
    const r = row.burst;
    if (!r?.amount) return 'No elemental buildup';
    if (r.seconds == null)
      return r?.count ? fmt(r.count) + ' actions · timing unknown' : 'No modeled burst in this window';
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
  const focus = high - low <= span ? (low + high) / 2 : values[0];
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
        targetName,
        metric: view === 'timeline' ? 'Elemental burst timeline' : metrics[metric],
        probe: view === 'curve' ? labels[axis] + ' ' + fmt(probe) : 'Selected target',
        timeline: timelineRef.current,
        series: series.map((row, index) => ({
          build: row.b,
          colorToken: colorToken(index),
          value: legendValue(row),
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
    <section ref={panel} className={css.panel}>
      <div className={css.heading}>
        <h2>Damage comparison</h2>
        <SegmentedControl
          label="Chart view"
          options={
            [
              { value: 'curve', label: 'Response curve' },
              { value: 'bars', label: 'At target' },
              { value: 'timeline', label: 'Burst timeline' },
            ] as const
          }
          value={view}
          onChange={setView}
        />
      </div>
      {view !== 'timeline' && (
        <div className={css.heading}>
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
            {view === 'curve' && (
              <Pick
                label="Vary"
                value={axis}
                options={Object.entries(labels).map(([value, label]) => ({ value, label }))}
                change={(v) => setAxis(v as typeof axis)}
              />
            )}
            {view === 'curve' && (
              <Pick label="Vertical zoom" value={zoom} options={zoomOptions} change={setZoom} />
            )}
          </div>
        </div>
      )}
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
              '. Values at the probe are listed below.'
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
              <text x={right} y="19" textAnchor="end">
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
              ? metrics[metric] + ' at the selected target'
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
      {view !== 'timeline' && timing && (
        <small>
          Measured from first contact against an empty gauge. The second burst includes recovery and refill. A
          dash in the legend means the burst falls outside the source’s active window or its trigger timing is
          unknown.
        </small>
      )}
      {view !== 'timeline' && !timing && series.some((s) => s.selected === null) && (
        <small>Choose a per-action measure to compare single activations.</small>
      )}
      {(view === 'timeline' || timing) && builds.some(b => b.operator === 'cello' && b.skill === 1) && (
        <small>Virtuosa S1 timing assumes full opening charges, one target in her aura, and uninterrupted SP recovery.</small>
      )}
      <div className={css.legend}>
        {series.map((row, index) => (
          <span key={row.b.id}>
            <i style={{ background: color(index) }} />#{index + 1} {profile(row.b).name}{' '}
            {row.b.skill ? 'S' + row.b.skill + ' ' + rankLabel(row.b.rank) : 'Normal'}{' '}
            <strong>{legendValue(row)}</strong>
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
