import { useEffect, useState } from 'react';
import Link from 'next/link';
import ImportDialog from '@/components/account/ImportDialog';
import LocalTime from '@/components/ui/LocalTime';
import { PRIVACY_KEY, useAnalyticsDecision, useMediaDecision } from '@/lib/privacy/preferences';
import type { SiteUpdate } from '@/lib/site-updates/types';
import SiteUpdateContent from './SiteUpdateContent';
import styles from './SiteUpdate.module.css';

const VISIT_KEY = 'arkpedia:site-update-first-visit';
const SEEN_KEY = 'arkpedia:site-update-last-seen';

export default function MajorUpdateNotice({ pathname }: { pathname: string }) {
  const [firstVisit, setFirstVisit] = useState<number | null>(null);
  const [update, setUpdate] = useState<SiteUpdate | null>(null);
  const mediaDecided = useMediaDecision();
  const analyticsDecided = useAnalyticsDecision();
  const enabled = mediaDecided && analyticsDecided && !['/intro', '/whats-new', '/cookies'].includes(pathname) && !pathname.startsWith('/dashboard');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VISIT_KEY);
      const first = saved === null ? (localStorage.getItem(PRIVACY_KEY) === null ? Date.now() : 0) : Number(saved);
      if (saved === null) localStorage.setItem(VISIT_KEY, String(first));
      setFirstVisit(first);
    } catch { /* Keep automatic notices off when dismissal cannot persist. */ }
  }, []);

  useEffect(() => {
    if (firstVisit === null || !enabled) return;
    const visitedAt = firstVisit;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/site-updates?latest=1', { signal: controller.signal });
        if (!response.ok) return;
        const [latest] = await response.json() as SiteUpdate[];
        const seen = Number(localStorage.getItem(SEEN_KEY) ?? 0);
        if (!controller.signal.aborted && latest && latest.publishedAt > Math.max(visitedAt, seen) &&
            !document.querySelector('dialog[open]')) setUpdate(latest);
      } catch { /* Optional announcement. */ }
    }
    const syncSeen = (event: StorageEvent) => {
      if (event.key === SEEN_KEY) setUpdate(current => current && current.publishedAt > Number(event.newValue) ? current : null);
    };
    void load();
    window.addEventListener('focus', load);
    window.addEventListener('storage', syncSeen);
    return () => {
      controller.abort();
      window.removeEventListener('focus', load);
      window.removeEventListener('storage', syncSeen);
    };
  }, [firstVisit, enabled]);

  if (!update || !enabled) return null;
  function close() {
    if (!update) return;
    try { localStorage.setItem(SEEN_KEY, String(update.publishedAt)); } catch {}
    setUpdate(null);
  }

  return <ImportDialog title={update.title} onClose={close}>
    <p className="hint"><LocalTime iso={new Date(update.publishedAt).toISOString()} precision="day" /></p>
    <SiteUpdateContent content={update} />
    <div className={styles.actions}>
      <Link className="ghost btn-sm" href="/whats-new" onClick={close}>All updates</Link>
      <button type="button" className="primary btn-sm" onClick={close}>Got it</button>
    </div>
  </ImportDialog>;
}
