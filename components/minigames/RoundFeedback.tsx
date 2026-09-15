import { MAX_MISTAKES, Progress } from '@/lib/minigames/logic';
import styles from '@/styles/minigames.module.css';

export default function RoundFeedback({ progress, notice }: { progress: Progress; notice: string }) {
  return <div className={styles.feedback}>
    <p className={styles.muted}>{MAX_MISTAKES - progress.wrong.length} wrong {MAX_MISTAKES - progress.wrong.length === 1 ? 'guess' : 'guesses'} remaining</p>
    {progress.wrong.length > 0 && <ul className={styles.wrong} aria-label="Incorrect guesses">{progress.wrong.map((name) => <li key={name}>✕ {name}</li>)}</ul>}
    <p className={styles.notice} role="status" aria-live="polite">{notice}</p>
  </div>;
}
