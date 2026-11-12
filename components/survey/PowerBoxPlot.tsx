import { StatsRow } from '@/lib/results/types';

interface Props {
  row: StatsRow;
  width?: number;
  height?: number;
  showLabel?: boolean;
  showGridlines?: boolean;
  showScaleEnds?: boolean;
  scale?: {min:number;max:number;step:number};
}

const SCALE_MIN = 5.8;
const SCALE_MAX = 7.2;
const STEP = 0.1;

function scaleX(value: number, width: number, padding: number, min:number, max:number): number {
  const usable = width - padding * 2;
  const t = (value - min) / (max - min);
  return padding + t * usable;
}

function gridlineValues(min:number,max:number,step:number): number[] {
  const values: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) {
    values.push(Math.round(v * 10) / 10);
  }
  return values;
}

export default function PowerBoxPlot({ row, width = 160, height = 46, showLabel = false, showGridlines = false, showScaleEnds = false, scale = {min:SCALE_MIN,max:SCALE_MAX,step:STEP} }: Props) {
  const padding = 6;
  const coordinate=(value:number)=>scaleX(value,width,padding,scale.min,scale.max);
  const needsLabelSpace = showGridlines || showScaleEnds;
  const gridLabelSpace = needsLabelSpace ? 16 : 0;
  const plotHeight = height - gridLabelSpace;
  const midY = showLabel ? plotHeight - 14 : plotHeight / 2;
  const boxHeight = showLabel ? 14 : 16;

  const xWhiskerLow = coordinate(row.p5);
  const xWhiskerHigh = coordinate(row.p95);
  const xQ1 = coordinate(row.q1);
  const xQ3 = coordinate(row.q3);
  const xMedian = coordinate(row.median);
  const xMean = coordinate(row.mean);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="power-boxplot-svg" role="img" aria-label={`${row.operator_name}: average ${row.mean.toFixed(2)}, median ${row.median.toFixed(2)}, middle half ${row.q1.toFixed(2)} to ${row.q3.toFixed(2)}, 5th to 95th percentile ${row.p5.toFixed(2)} to ${row.p95.toFixed(2)}`}>
      {showGridlines &&
        gridlineValues(scale.min,scale.max,scale.step).map((v) => {
          const x = coordinate(v);
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
                fontSize={scale.step>=1?11:8}
                fill="var(--text-faint)"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {scale.step>=1?String(v):v.toFixed(1)}
              </text>
            </g>
          );
        })}

      {showScaleEnds &&
        [scale.min, scale.max].map((v) => {
          const x = coordinate(v);
          return (
            <g key={v}>
              <line x1={x} x2={x} y1={0} y2={plotHeight} stroke="var(--text-dim)" strokeWidth={1} />
              <text
                x={x}
                y={height - 3}
                textAnchor={v === scale.min ? 'start' : 'end'}
                fontSize={scale.step>=1?11:8}
                fill="var(--text-faint)"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {scale.step>=1?String(v):v.toFixed(1)}
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