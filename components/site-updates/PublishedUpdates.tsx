import { useEffect, useState } from 'react';
import LocalTime from '@/components/ui/LocalTime';
import type { SiteUpdate } from '@/lib/site-updates/types';
import SiteUpdateContent from './SiteUpdateContent';
import styles from './SiteUpdate.module.css';

export default function PublishedUpdates() {
  const [updates, setUpdates] = useState<SiteUpdate[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/site-updates', { signal: controller.signal }).then(async response => {
      if (response.ok) setUpdates(await response.json() as SiteUpdate[]);
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  if (!updates.length) return null;
  return <section aria-label="Published site updates" className={styles.history}>
    {updates.map(update => <article className="panel" key={update.id}>
      <h2 className="section-title">{update.title}</h2>
      <span className="hint"><LocalTime iso={new Date(update.publishedAt).toISOString()} precision="day" /></span>
      <SiteUpdateContent content={update} />
    </article>)}
  </section>;
}
