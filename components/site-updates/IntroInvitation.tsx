import { useEffect, useState } from 'react';
import Link from 'next/link';
import ImportDialog from '@/components/account/ImportDialog';
import { PRIVACY_KEY, useAnalyticsDecision, useMediaDecision } from '@/lib/privacy/preferences';
import styles from './SiteUpdate.module.css';

const INTRO_KEY = 'arkpedia:intro-offer-v1';

export default function IntroInvitation({ pathname }: { pathname: string }) {
  const [pending, setPending] = useState(false);
  const mediaDecided = useMediaDecision();
  const analyticsDecided = useAnalyticsDecision();

  useEffect(() => {
    try {
      const offer = localStorage.getItem(INTRO_KEY);
      const firstVisit = offer === 'pending' || (offer === null && localStorage.getItem(PRIVACY_KEY) === null);
      if (firstVisit && offer === null) localStorage.setItem(INTRO_KEY, 'pending');
      setPending(firstVisit);
    } catch { /* The Intro remains available in About. */ }
  }, []);

  if (!pending || pathname !== '/' || !mediaDecided || !analyticsDecided) return null;
  function dismiss() {
    try { localStorage.setItem(INTRO_KEY, 'dismissed'); } catch {}
    setPending(false);
  }

  return <ImportDialog title="Welcome to Arkpedia" onClose={dismiss}>
    <p>Take a quick tour of the database, planning tools, and event schedule. You can open Intro again from the About menu.</p>
    <div className={styles.actions}>
      <button className="ghost btn-sm" type="button" onClick={dismiss}>Skip for now</button>
      <Link className="btn primary btn-sm" href="/intro" onClick={dismiss}>Start Intro</Link>
    </div>
  </ImportDialog>;
}
