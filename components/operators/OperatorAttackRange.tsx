import { useState } from 'react';
import type { OperatorAttackRange as RangeChoice } from '@/lib/operators/operatorAttackRanges';
import OperatorGameIcon from './OperatorGameIcon';
import styles from './OperatorAttackRange.module.css';

export default function OperatorAttackRange({ ranges }: { ranges: RangeChoice[] }) {
  const [selectedIndex, setSelectedIndex] = useState(ranges.length - 1);
  const selected = ranges[selectedIndex];
  if (!selected) return null;

  // Share a bounding box and origin so neither the grid nor nearby prose moves.
  const originRow = Math.max(...ranges.map(({ range }) => range.opCell[0]));
  const originCol = Math.max(...ranges.map(({ range }) => range.opCell[1]));
  const rows = originRow + Math.max(...ranges.map(({ range }) => range.rows - range.opCell[0]));
  const cols = originCol + Math.max(...ranges.map(({ range }) => range.cols - range.opCell[1]));
  const rowOffset = originRow - selected.range.opCell[0];
  const colOffset = originCol - selected.range.opCell[1];
  const label = `Elite ${selected.elite} attack range${selected.talent ? ` (${selected.talent})` : ''}`;

  return <div className={styles.range} role="group" aria-label="Attack range">
    <div className="op-range-grid-wrap" role="img" aria-label={label} title={label}>
      <div className="op-range-grid" style={{ gridTemplateColumns: `repeat(${cols}, 16px)`, gridTemplateRows: `repeat(${rows}, 16px)` }}>
        <div className="op-range-cell op-range-cell-self" style={{ gridColumn: originCol, gridRow: originRow }} />
        {selected.range.rangeCells.map(([row, col]) => <div key={`${row},${col}`} className="op-range-cell"
          style={{ gridColumn: col + colOffset, gridRow: row + rowOffset }} />)}
      </div>
    </div>
    <div className={styles.elites}>
      {ranges.map((choice, index) => ranges.length === 1
        ? <OperatorGameIcon key={choice.elite} label={`Elite ${choice.elite}`} size={22} />
        : <button key={choice.elite} type="button" className={`filter-chip ${styles.elite}`}
          aria-label={`Show Elite ${choice.elite} attack range`} aria-pressed={index === selectedIndex}
          title={`Elite ${choice.elite}${choice.talent ? ` · ${choice.talent}` : ''}`}
          onClick={() => setSelectedIndex(index)}>
          <OperatorGameIcon label={`Elite ${choice.elite}`} size={22} />
        </button>)}
    </div>
  </div>;
}
