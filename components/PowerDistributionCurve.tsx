interface Props {
  histogram: Record<string, number>;
  width?: number;
  height?: number;
  showGridlines?: boolean;
}

const SCALE_MIN = 5.8;
const SCALE_MAX = 7.2;
const STEP = 0.1;

function buildBuckets(histogram: Record<string, number>): { value: number; count: number }[] {
  const buckets: { value: number; count: number }[] = [];
  for (let v = SCALE_MIN; v <= SCALE_MAX + 1e-9; v += STEP) {
    const key = v.toFixed(1);
    buckets.push({ value: v, count: histogram[key] || 0 });
  }
  return buckets;
}

function scaleX(value: number, width: number, padding: number): number {
  const usable = width - padding * 2;
  const t = (value - SCALE_MIN) / (SCALE_MAX - SCALE_MIN);
  return padding + t * usable;
}

export default function PowerDistributionCurve({ histogram, width = 160, height = 46, showGridlines = false }: Props) {
  const padding = 4;
  const gridLabelSpace = showGridlines ? 16 : 0;
  const plotHeight = height - gridLabelSpace;
  const buckets = buildBuckets(histogram);
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  const points = buckets.map((b, i) => {
    const x = padding + (i / (buckets.length - 1)) * (width - padding * 2);
    const y = plotHeight - padding - (b.count / maxCount) * (plotHeight - padding * 2);
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${plotHeight - padding} L ${points[0].x.toFixed(1)} ${plotHeight - padding} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="power-distribution-svg">
      {showGridlines &&
        buckets.map((b) => {
          const x = scaleX(b.value, width, padding);
          return (
            <g key={b.value}>
              <line x1={x} x2={x} y1={0} y2={plotHeight} stroke="var(--line-soft)" strokeWidth={1} strokeDasharray="2,3" />
              <text x={x} y={height - 3} textAnchor="middle" fontSize={8} fill="var(--text-faint)" style={{ fontFamily: 'var(--font-mono)' }}>
                {b.value.toFixed(1)}
              </text>
            </g>
          );
        })}
      <path d={areaPath} fill="var(--teal-dim)" opacity={0.6} />
      <path d={linePath} fill="none" stroke="var(--teal)" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}