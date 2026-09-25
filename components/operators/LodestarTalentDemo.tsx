import { useState } from 'react';
import SegmentedControl from '@/components/ui/SegmentedControl';
import styles from './LodestarTalentDemo.module.css';

/** A single isolated lane; no perpendicular qualifying row/column is implied. */
export default function LodestarTalentDemo({ unlocked }: { unlocked: boolean }) {
  const [blocked, setBlocked] = useState(false);
  const bonus = unlocked ? (blocked ? 5 : 10) : 0;

  return <details className={styles.demo}>
    <summary>How the lane bonus works</summary>
    <div className={styles.body}>
      <p>A row or column of 6+ passable ground tiles doubles the effect. Walls and high ground break the line.</p>
      <SegmentedControl className={styles.options} label="Lane example" value={blocked ? 'wall' : 'open'}
        onChange={(value) => setBlocked(value === 'wall')}
        options={[{ value: 'open', label: 'Open lane' }, { value: 'wall', label: 'Wall in lane' }]} />
      <div className={styles.lane} role="img" aria-label={!unlocked ? 'The lane bonus is inactive until Elite 2.' : blocked ? 'Six tile lane with a wall in tile four. Neither remaining segment reaches six tiles.' : 'Six consecutive passable ground tiles. An ally and an enemy both receive the doubled effect.'}>
        {Array.from({ length: 6 }, (_, index) => <span key={index} className={`${styles.tile} ${blocked && index === 3 ? styles.wall : !blocked && unlocked ? styles.active : ''}`} aria-hidden="true">
          {blocked && index === 3 ? <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h18v16H3zM3 10h18M3 15h18M9 4v6m6 0v5m-6 0v5" /></svg> : index === 1 ? <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m12 3 8 9-8 9-8-9z" /><path d="M8 12h8m-4-4v8" /></svg> : index === 5 ? <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m12 3 9 17H3zM8 15h8" /></svg> : null}
        </span>)}
      </div>
      <div className={styles.result} aria-live="polite" aria-atomic="true">
        <span>Allies <strong>+{bonus} ASPD</strong></span>
        <span>Enemies <strong>−{bonus} ASPD</strong></span>
        <small>{!unlocked ? 'Talent unlocks at Elite 2' : blocked ? 'Interrupted lane · standard effect' : '6 consecutive tiles · doubled effect'}</small>
      </div>
      <a className={styles.source} href="https://arknights.wiki.gg/wiki/Thorns_the_Lodestar#Talents" target="_blank" rel="noreferrer">Mechanics source ↗</a>
    </div>
  </details>;
}
