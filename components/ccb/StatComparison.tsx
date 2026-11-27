import { ContentArt } from '@/components/content/ContentImage';
import { STAT_ICONS } from '@/components/operators/OperatorGameIcon';
import { STAT_LABELS } from '@/lib/ccb/modifiers';
import type { CombatStats } from '@/lib/ccb/types';
import styles from './Battleplan.module.css';

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

export function formatStatValue(value: number | null) {
  return value == null ? '—' : numberFormat.format(value);
}

export function statChange(original: number | null, modified: number | null) {
  const difference = modified == null || original == null ? 0 : modified - original;
  if (Math.abs(difference) < 0.00001) return null;
  return { text: `${difference > 0 ? '+' : ''}${formatStatValue(difference)}`, direction: difference > 0 ? styles.higher : styles.lower };
}

export function StatGlyph({ stat }: { stat: string }) {
  const icon = STAT_ICONS[stat];
  return icon ? <ContentArt src={`/stat-icons/${icon}.webp`} className={`mode-mark ${styles.statIcon}`} aria-hidden="true" /> : null;
}

export default function StatComparison({ original, modified, label }: { original: CombatStats; modified: CombatStats; label: string }) {
  return <table className={styles.stats} aria-label={label}>
    <thead><tr><th scope="col">Stat</th><th scope="col">Original</th><th scope="col">Modified</th><th scope="col">Change</th></tr></thead>
    <tbody>{Object.entries(original).filter(([key]) => key !== 'aspd').map(([key, value]) => {
      const next = modified[key] ?? null;
      const change = statChange(value, next);
      return <tr key={key}>
        <th scope="row"><span className={styles.statLabel}><StatGlyph stat={key} />{STAT_LABELS[key] ?? key}</span></th>
        <td>{formatStatValue(value)}</td>
        <td className={change?.direction}>{formatStatValue(next)}</td>
        <td className={change?.direction}>{change?.text ?? '—'}</td>
      </tr>;
    })}</tbody>
  </table>;
}
