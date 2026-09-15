import { StatsRow } from '@/lib/types';

interface Props {
  row: StatsRow;
  width?: number;
  height?: number;
  showLabel?: boolean;
  showGridlines?: boolean;
  showScaleEnds?: boolean;
}

const SCALE_MIN = 5.8;
const SCALE_MAX = 7.2;
const STEP = 0.1;

function scaleX(value: number, width: number, padding: number): number {
  const usable = width - padding * 2;
  const t = (value - SCALE_MIN) / (SCALE_MAX - SCALE_MIN);
  return padding + t * usable;
}

function gridlineValues(): number[] {
  const values: number[] = [];
  for (let v = SCALE_MIN; v <= SCALE_MAX + 1e-9; v += STEP) {
    values.push(Math.round(v * 10) / 10);
  }
  return values;
}

export default function PowerBoxPlot({ row, width = 160, height = 46, showLabel = false, showGridlines = false, showScaleEnds = false }: Props) {
  const padding = 6;
  const needsLabelSpace = showGridlines || showScaleEnds;
  const gridLabelSpace = needsLabelSpace ? 16 : 0;
  const plotHeight = height - gridLabelSpace;
  const midY = showLabel ? plotHeight - 14 : plotHeight / 2;
  const boxHeight = showLabel ? 14 : 16;

  const xWhiskerLow = scaleX(row.p5, width, padding);
  const xWhiskerHigh = scaleX(row.p95, width, padding);
  const xQ1 = scaleX(row.q1, width, padding);
  const xQ3 = scaleX(row.q3, width, padding);
  const xMedian = scaleX(row.median, width, padding);
  const xMean = scaleX(row.mean, width, padding);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="power-boxplot-svg">
      {showGridlines &&
        gridlineValues().map((v) => {
          const x = scaleX(v, width, padding);
          return (
            <g key={v}>
              <line
                x1={x}
                x2={x}
                y1={0}
                y2={plotHeight}
                stroke="var(--line-soft)"
                strokeWidth={1}
                strokeDasharray="2,3"
              />
              <text
                x={x}
                y={height - 3}
                textAnchor="middle"
                fontSize={8}
                fill="var(--text-faint)"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {v.toFixed(1)}
              </text>
            </g>
          );
        })}

      {showScaleEnds &&
        [SCALE_MIN, SCALE_MAX].map((v) => {
          const x = scaleX(v, width, padding);
          return (
            <g key={v}>
              <line x1={x} x2={x} y1={0} y2={plotHeight} stroke="var(--text-dim)" strokeWidth={1} />
              <text
                x={x}
                y={height - 3}
                textAnchor={v === SCALE_MIN ? 'start' : 'end'}
                fontSize={8}
                fill="var(--text-faint)"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {v.toFixed(1)}
              </text>
            </g>
          );
        })}

      {/* whisker line: p5 to p95, the outlier-trimmed response range */}
      <line x1={xWhiskerLow} x2={xWhiskerHigh} y1={midY} y2={midY} stroke="var(--text-dim)" strokeWidth={1.5} />
      <line x1={xWhiskerLow} x2={xWhiskerLow} y1={midY - 4} y2={midY + 4} stroke="var(--text-dim)" strokeWidth={1.5} />
      <line x1={xWhiskerHigh} x2={xWhiskerHigh} y1={midY - 4} y2={midY + 4} stroke="var(--text-dim)" strokeWidth={1.5} />

      {/* box: Q1 to Q3 */}
      <rect
        x={Math.min(xQ1, xQ3)}
        y={midY - boxHeight / 2}
        width={Math.max(1, Math.abs(xQ3 - xQ1))}
        height={boxHeight}
        fill="var(--teal-dim)"
        stroke="var(--teal)"
        strokeWidth={1.5}
        rx={2}
      />

      {/* median tick inside the box */}
      <line x1={xMedian} x2={xMedian} y1={midY - boxHeight / 2} y2={midY + boxHeight / 2} stroke="var(--teal)" strokeWidth={2} />

      {/* mean marker, small diamond */}
      <circle cx={xMean} cy={midY} r={2.5} fill="var(--amber)" />

      {showLabel && (
        <text x={width / 2} y={plotHeight - 4} textAnchor="middle" fontSize={9} fill="var(--text-dim)" style={{ fontFamily: 'var(--font-mono)' }}>
          {row.operator_name}
        </text>
      )}
    </svg>
  );
}