import { useEffect, useState } from 'react';
import type { Appearance } from '@/lib/operators/operatorAppearances';
import styles from './OperatorPage.module.css';

/** Reserve the tallest caption so long outfit names never resize the artwork. */
export default function OperatorArtworkCaption({ appearances, activeIndex, prices }: {
  appearances: Appearance[];
  activeIndex: number;
  prices: Record<string, string>;
}) {
  const label = appearances[activeIndex]?.label ?? null;
  const [motion, setMotion] = useState({ label, previous: null as string | null, revision: 0 });
  // Keep the departing caption for the handoff, including rapid successive picks.
  if (motion.label !== label) setMotion({ label, previous: motion.label, revision: motion.revision + 1 });
  useEffect(() => {
    if (motion.previous === null) return;
    const timer = setTimeout(() => setMotion(current => current.revision === motion.revision ? { ...current, previous: null } : current), 500);
    return () => clearTimeout(timer);
  }, [motion.previous, motion.revision]);
  return <div className={styles.artworkCaption} aria-live="polite" aria-atomic="true">
    {appearances.map((appearance, index) => <div key={`${appearance.label}:${motion.revision}`} className={styles.artworkCaptionVariant}
      aria-hidden={index !== activeIndex} data-current={index === activeIndex}
      data-artwork-caption={index === activeIndex && motion.revision > 0 ? 'enter' : appearance.label === motion.previous ? 'exit' : undefined}>
      <span className={styles.artworkName} data-caption-name>{appearance.label}</span>
      {prices[appearance.label] && <span className={styles.artworkPrice} data-caption-price>{prices[appearance.label]}</span>}
    </div>)}
  </div>;
}
