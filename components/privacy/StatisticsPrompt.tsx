import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import XButton from '@/components/ui/XButton';
import { readPrivacy, savePrivacy, useAnalyticsDecision } from '@/lib/privacy/preferences';

export default function StatisticsPrompt() {
  const { pathname } = useRouter();
  const decided = useAnalyticsDecision();
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState('');
  if (pathname === '/cookies' || decided || dismissed) return null;
  const choose = (analytics: boolean) => {
    try { savePrivacy({ ...readPrivacy(), analytics }); }
    catch {
      if (analytics) { setError('This browser could not save your choice. Statistics remain off.'); return; }
      // Refusing still dismisses this tab when browser storage is unavailable.
      setDismissed(true);
    }
  };
  return <section className="statistics-prompt panel reading-copy" role="region" aria-label="Usage statistics choice">
    <div className="statistics-prompt-heading"><h2 className="entity-title entity-title-sm">Help improve Arkpedia?</h2><XButton label="No thanks, close statistics prompt" onClick={() => choose(false)} /></div>
    <p>Allow cookieless page-view and loading statistics? Your imported account, pulls and saves are never sent as analytics events.</p>
    <div className="statistics-prompt-actions"><button type="button" className="ghost btn-sm" onClick={() => choose(true)}>Allow statistics</button><button type="button" className="ghost btn-sm" onClick={() => choose(false)}>No thanks</button></div>
    <Link href="/cookies">Privacy choices</Link>
    {error && <p role="alert">{error}</p>}
  </section>;
}
