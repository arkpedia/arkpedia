import { useEffect, useState } from 'react';
import Link from 'next/link';
import ImportDialog from '@/components/account/ImportDialog';
import { MEDIA_REQUEST, readPrivacy, readAnalyticsDecision, savePrivacy, type MediaRequest } from '@/lib/privacy/preferences';
export default function ExternalMediaPrompt() {
  const [request, setRequest] = useState<MediaRequest | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const open = (event: Event) => { setError(''); setRequest((event as CustomEvent<MediaRequest>).detail); };
    window.addEventListener(MEDIA_REQUEST, open); return () => window.removeEventListener(MEDIA_REQUEST, open);
  }, []);
  if (!request) return null;
  const cancel = () => { request.cancel?.(); setRequest(null); };
  return <ImportDialog title="Allow external media?" onClose={cancel}>
    <p>Playback connects to YouTube/Google and, for some music, Monster Siren. They receive connection information such as your IP address and browser details. YouTube may use cookies or similar storage under its own policy.</p>
    <p>Allow external playback on this browser? You can change this in <Link href="/cookies" onClick={cancel}>Privacy choices</Link>. Browsing Arkpedia works without it.</p>
    {error && <p role="alert">{error}</p>}
    <div className="account-shortcuts"><button type="button" className="ghost btn-sm" onClick={cancel}>Keep disabled</button><button type="button" className="primary btn-sm" onClick={() => {
      try { savePrivacy({ ...readPrivacy(), externalMedia: true }, readAnalyticsDecision()); setRequest(null); request.allow(); }
      catch { setError('This browser could not save the choice. Allow storage and try again.'); }
    }}>Allow external media</button></div>
  </ImportDialog>;
}
