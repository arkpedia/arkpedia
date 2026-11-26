import { CCB_TEXT as T } from './strings';
import styles from './BattleplanLoading.module.css';

export default function BattleplanLoading({ retry }: { retry?: () => void }) {
  return <main className={styles.workspace}>
    <div className={styles.loading}>
      <p role={retry ? 'alert' : 'status'}>{retry ? 'The battleplan could not load.' : T.loading}</p>
      {retry && <button type="button" className="ghost btn-sm" onClick={retry}>Try again</button>}
    </div>
  </main>;
}
