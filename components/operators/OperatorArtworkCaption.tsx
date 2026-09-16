import type { Appearance } from '@/lib/operators/operatorAppearances';
import styles from './OperatorPage.module.css';

/** Reserve the tallest caption so long outfit names never resize the artwork. */
export default function OperatorArtworkCaption({ appearances, activeIndex, prices }: {
  appearances: Appearance[];
  activeIndex: number;
  prices: Record<string, string>;
}) {
  return <div className={styles.artworkCaption} aria-live="polite" aria-atomic="true">
    {appearances.map((appearance, index) => <div key={appearance.label} className={styles.artworkCaptionVariant}
      aria-hidden={index !== activeIndex} style={{ visibility: index === activeIndex ? 'visible' : 'hidden' }}>
      <span className={styles.artworkName}>{appearance.label}</span>
      {prices[appearance.label] && <span className={styles.artworkPrice}>{prices[appearance.label]}</span>}
    </div>)}
  </div>;
}
