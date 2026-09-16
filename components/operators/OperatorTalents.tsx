import { ReactNode, useState } from 'react';
import type { Talent, TalentRow } from '@/lib/operators/operatorTypes';
import OperatorGameIcon from './OperatorGameIcon';
import { highlightStats } from '../ui/HighlightedText';
import styles from './OperatorPage.module.css';

const eliteOf = (row: TalentRow) => Number(row.stage?.match(/\d+/)?.[0] ?? 0);
const potentialOf = (row: TalentRow) => Number(row.potential?.match(/\d+/)?.[0] ?? 1);

export default function OperatorTalents({ talents, elites, renderDetails }: {
  talents: Talent[];
  elites: number[];
  renderDetails: (talent: Talent, unlocked: boolean) => ReactNode;
}) {
  const hasBaseTalent = talents.some(talent => talent.rows.some(row => eliteOf(row) === 0));
  const promotions = [...new Set(elites.length ? elites : [0, ...talents.flatMap(t => t.rows.map(eliteOf))])]
    .filter(level => level !== 0 || hasBaseTalent)
    .sort((a, b) => a - b);
  const potentials = [...new Set([1, ...talents.flatMap(t => t.rows.map(potentialOf))])].sort((a, b) => a - b);
  const [elite, setElite] = useState(() => promotions[promotions.length - 1]);
  const [potential, setPotential] = useState(1);

  return <>
    <div className={styles.talentControls}>
      <h2>Talents</h2>
      <div className={styles.talentSelectors}>
        <div className={styles.talentOptions} role="group" aria-label="Talent promotion">
          {promotions.map(level => <button type="button" key={level} title={`Elite ${level}`} aria-label={`Elite ${level}`} aria-pressed={elite === level} onClick={() => setElite(level)}>
            <OperatorGameIcon label={`Elite ${level}`} size={20} />
            <span>E{level}</span>
          </button>)}
        </div>
        <div className={styles.talentOptions} role="group" aria-label="Talent potential"
          style={potentials.length > 3 ? { display: 'grid', gridTemplateColumns: `repeat(${Math.ceil(potentials.length / 2)}, 44px)` } : undefined}>
          {potentials.map(rank => <button type="button" key={rank} title={`Potential ${rank}`} aria-label={`Potential ${rank}`} aria-pressed={potential === rank} onClick={() => setPotential(rank)}>
            <OperatorGameIcon label={`Potential ${rank}`} size={20} color />
            <span>P{rank}</span>
          </button>)}
        </div>
      </div>
    </div>
    {talents.map((talent, index) => {
      const selected = talent.rows
        .filter(row => eliteOf(row) <= elite && potentialOf(row) <= potential)
        .sort((a, b) => eliteOf(b) - eliteOf(a) || potentialOf(b) - potentialOf(a))[0];
      const unlock = Math.min(...talent.rows.map(eliteOf));
      return <article key={index} className={styles.talentCard}>
        <div className={styles.talentHeading}>
          <h3>{talent.name || `Talent ${index + 1}`}</h3>
          <span className={styles.talentBadges}>
            <OperatorGameIcon label={`Elite ${selected ? eliteOf(selected) : unlock}`} size={25} />
            <span className={styles.talentPotentialBadge}>
              {selected?.potential && <OperatorGameIcon label={selected.potential} size={25} color />}
            </span>
          </span>
        </div>
        <div className={styles.talentDescriptions}>
          {talent.rows.map((row, rowIndex) => <p key={rowIndex} aria-hidden={row !== selected}
            style={{ visibility: row === selected ? 'visible' : 'hidden' }}>{highlightStats(row.description)}</p>)}
          {!selected && <p>Unlocks at Elite {unlock}.</p>}
        </div>
        {renderDetails(talent, Boolean(selected))}
      </article>;
    })}
  </>;
}
