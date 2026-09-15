import { useState } from 'react';
import OperatorGameIcon from './OperatorGameIcon';
import { highlightStats } from './HighlightedText';
import styles from './OperatorPage.module.css';

import type { TalentRow } from '@/lib/operators/operatorTypes';

export default function OperatorTalentRows({ rows, name }: { rows: TalentRow[]; name: string }) {
  const [selected, setSelected] = useState(() => {
    const index = rows.reduce((last, row, index) => row.potential ? last : index, 0);
    return Math.max(0, index);
  });
  return <>
    <div className={styles.talentOptions} role="group" aria-label={`${name} requirements`}>
      {rows.map((row, index) => <button type="button" key={index} aria-pressed={selected === index}
        aria-label={[row.stage === 'Base' ? 'Elite 0' : row.stage, row.potential || 'Base potential'].filter(Boolean).join(', ')}
        onClick={() => setSelected(index)}>
        {row.stage && <OperatorGameIcon label={row.stage === 'Base' ? 'Elite 0' : row.stage} size={26} />}
        {row.potential && <OperatorGameIcon label={row.potential} size={26} color />}
      </button>)}
    </div>
    <div className={styles.talentDescriptions}>
      {rows.map((row, index) => <p key={index} aria-hidden={index !== selected}
        style={{ visibility: index === selected ? 'visible' : 'hidden' }}>{highlightStats(row.description)}</p>)}
    </div>
  </>;
}
