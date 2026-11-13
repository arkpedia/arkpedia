import { STAT_LABELS } from '@/lib/ccb/modifiers';
import type { CombatStats } from '@/lib/ccb/types';
import styles from './Battleplan.module.css';

const format = (value: number | null) => value == null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: 3 });
export default function StatComparison({ original, modified, label }: { original: CombatStats; modified: CombatStats; label: string }) {
  return <table className={styles.stats} aria-label={label}>
    <thead><tr><th scope="col">Stat</th><th scope="col">Original</th><th scope="col">Modified</th><th scope="col">Change</th></tr></thead>
    <tbody>{Object.entries(original).filter(([key]) => key !== 'aspd').map(([key, value]) => {
      const next = modified[key] ?? null;
      const delta = next === null || value === null ? null : next - value;
      const direction = delta == null || Math.abs(delta) < 0.00001 ? '' : delta > 0 ? styles.higher : styles.lower;
      return <tr key={key}><th scope="row">{STAT_LABELS[key] ?? key}</th><td>{format(value)}</td><td className={direction}>{format(next)}</td><td className={direction}>{delta == null || Math.abs(delta) < 0.00001 ? '—' : `${delta > 0 ? '+' : ''}${format(delta)}`}</td></tr>;
    })}</tbody>
  </table>;
}
