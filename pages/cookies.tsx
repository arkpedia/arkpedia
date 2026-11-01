import { useEffect, useState } from 'react';
import { getSetting, setSetting } from '@/lib/settings/siteSettings';
import AutoplayMusicChoice from '@/components/music/AutoplayMusicChoice';
import PageMeta from '@/components/layout/PageMeta';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import InformationLayout from '@/components/ui/InformationLayout';
import InfoPopover from '@/components/ui/InfoPopover';
import { readPrivacy, savePrivacy } from '@/lib/privacy/preferences';
export default function CookiesPage() {
  const [autoplay, setAutoplay] = useState(false);
  const [analytics, setAnalytics] = useState(false), [externalMedia, setExternalMedia] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState('');
  useEffect(() => { const value = readPrivacy(); setAnalytics(value.analytics); setExternalMedia(value.externalMedia); setAutoplay(getSetting('backgroundMusic')); setReady(true); }, []);
  const save = (necessaryOnly = false) => {
    try { setSetting('backgroundMusic', !necessaryOnly && externalMedia && autoplay); savePrivacy({ analytics: necessaryOnly ? false : analytics, externalMedia: necessaryOnly ? false : externalMedia }, true, true); window.location.reload(); }
    catch { setError('This browser could not save your choice. Optional services remain disabled on a fresh visit unless a valid choice can be read.'); }
  };
  return <><PageMeta title="Cookies & privacy choices" description="What Arkpedia keeps in your browser and the choices you have about it." path="/cookies" />
    <PageHeader eyebrow="Rhodes Island // Privacy choices" title="Cookies & privacy choices" sub="Optional services stay off until you choose to enable them." />
    <InformationLayout sections={[{id:'choices',label:'Your choices'}, {id:'storage',label:'Cookies & storage'}]}><section id="choices" className="information-section reading-copy"><h2 className="entity-title">Your choices on this browser</h2>
      <p>Arkpedia uses browser storage for the features you request. Optional analytics and external playback are separate choices. Refusing them does not block the reference pages, planning tools or account access.</p>
      <div className="privacy-choice-list"><div className="panel privacy-choice"><label className="check"><input type="checkbox" checked={analytics} disabled={!ready} onChange={event => setAnalytics(event.target.checked)} />Allow usage statistics</label><p>Cloudflare counts page views and visits and measures page-loading performance to help us improve Arkpedia. Your imported account, pull history and saves are not sent as analytics events. This is optional; no analytics script loads before permission.</p></div>
      <div className="panel privacy-choice"><label className="check"><input type="checkbox" checked={externalMedia} disabled={!ready} onChange={event => setExternalMedia(event.target.checked)} />Allow external media</label><p>YouTube players and external music playback. Their providers receive connection information and may use their own cookies or storage.</p><AutoplayMusicChoice checked={autoplay} onChange={setAutoplay} disabled={!ready || !externalMedia} /></div></div>
      <div className="privacy-choice-actions"><button className="primary btn-sm" type="button" disabled={!ready} onClick={() => save()}>Save privacy choices</button><button className="ghost btn-sm" type="button" disabled={!ready} onClick={() => save(true)}>Use necessary only</button><InfoPopover label="About saving privacy choices"><p>Choices last up to 180 days and stay on this browser; they do not sync with your account. Saving reloads this page so withdrawn services stop.</p></InfoPopover></div>{error && <p role="alert">{error}</p>}
    </section><section id="storage" className="information-section reading-copy"><h2 className="entity-title">Cookies and storage used for requested features</h2>
      <dl><dt>Sign-in and security</dt><dd>Account-enabled deployments use first-party Arkpedia authentication cookies, including an <strong>arkpedia.session_token</strong> cookie (with a <strong>__Secure-</strong> prefix on HTTPS). Login sessions last up to 14 days and can be refreshed while you use the service. Short-lived login/security cookies may also be used during authentication.</dd>
      <dt>Browser saves</dt><dd><strong>localStorage</strong> keeps feature choices, plans, favourites, imports and archives until cleared or replaced. A remembered Yostar sign-in is stored only if you choose it. <strong>sessionStorage</strong> keeps temporary tab/session state, such as playback restoration and navigation state.</dd>
      <dt>Privacy choice</dt><dd><strong>arkpedia:privacy:v1</strong> stores these optional-service choices for up to 180 days. Invalid, missing or expired choices default to off.</dd>
      <dt>Optional analytics</dt><dd>Cloudflare Web Analytics is cookieless. Its analytics script loads only after you allow analytics.</dd></dl>
      <p>Import / export can export or clear browser saves. Account settings controls cloud data separately. Your browser can also clear this site’s cookies and storage; doing so may sign you out and remove local-only saves.</p>
      <p>For purposes, recipients and your rights, see the <Link href="/privacy">Privacy notice</Link>. EU guidance distinguishes technically necessary storage from optional tracking: <a href="https://europa.eu/youreurope/business/growing/digitalising/online-privacy/index_en.htm">European Commission guidance</a>.</p>
    </section></InformationLayout></>;
}
