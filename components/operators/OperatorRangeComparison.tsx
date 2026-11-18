import type { CroppedRange } from '@/lib/operators/operatorAttackRanges';

function RangeGridBox({ range, label }: { range: CroppedRange; label: string }) {
  const CELL_PX = 16;
  return (
    <div className="op-range-grid-wrap" role="img" aria-label={label} title={label}>
      <div
        className="op-range-grid"
        style={{
          gridTemplateColumns: `repeat(${range.cols}, ${CELL_PX}px)`,
          gridTemplateRows: `repeat(${range.rows}, ${CELL_PX}px)`,
        }}
      >
        <div
          className="op-range-cell op-range-cell-self"
          style={{ gridColumn: range.opCell[1], gridRow: range.opCell[0] }}
        />
        {range.rangeCells.map((c, i) => (
          <div key={i} className="op-range-cell" style={{ gridColumn: c[1], gridRow: c[0] }} />
        ))}
      </div>
    </div>
  );
}

export default function RangeComparison({ label, before, after, afterLabel, note }: {
  label: string;
  before?: CroppedRange | null;
  after: CroppedRange;
  afterLabel: string;
  note?: string;
}) {
  return (
    <div className="op-skill-range">
      <span className="op-skill-range-label">{label}</span>
      <div className="op-skill-range-pair">
        {before && (
          <>
            <RangeGridBox range={before} label="Normal attack range" />
            <span className="op-skill-range-arrow" aria-hidden="true">→</span>
          </>
        )}
        <RangeGridBox range={after} label={afterLabel} />
      </div>
      {note && <span className="op-skill-range-note">{note}</span>}
    </div>
  );
}

export function MeleeRedeploymentArea({ range }: { range: CroppedRange }) {
  const label = 'Melee redeployment area';
  return <RangeComparison label={label} after={range} afterLabel={label}
    note="Filled tile marks the previous deployment position." />;
}
