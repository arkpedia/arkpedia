import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { fetchAsset } from '@/lib/assets/assetRetry';
import { ContentContext, ContentTablesContext } from '@/lib/content/context';
import type { ContentRelease } from '@/lib/content/types';
import { useCloudSync } from '@/lib/cloud-account/SyncProvider';
import ImportDialog from './ImportDialog';
import ProfileAvatar from './ProfileAvatar';
const DataDialog = dynamic(() => import('./DataDialog'), { ssr: false });
const AvatarPicker = dynamic(() => import('./AvatarPicker'), { ssr: false });
const CloudAccountPanel = dynamic(() => import('./CloudAccountPanel'), { ssr: false });
type Action = 'import' | 'settings';
const Context = createContext<{ open: (action: Action) => void }>({ open: () => {} });
export const useAccountActions = () => useContext(Context);

/** Overlays keep their caller mounted, including its scroll, filters and music. */
export default function AccountActions({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<Action | null>(null);
  const [loaded, setLoaded] = useState<{ tables: Record<string, unknown>; release: ContentRelease | null } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const opener = useRef<HTMLElement | null>(null);
  const [settingsTab, setSettingsTab] = useState<'profile' | 'saving' | 'logins' | 'data'>('profile');
  const [onboarding, setOnboarding] = useState(false);
  const setupOwner = useRef<string | null>(null);
  const tables = useContext(ContentTablesContext), release = useContext(ContentContext);
  const sync = useCloudSync(), router = useRouter();
  const onboardingKey = 'arkpedia:account-onboarding';
  const requested = router.query.confirm === 'delete' ? 'data' :
    ['profile', 'saving', 'logins'].includes(String(router.query.settings)) ? String(router.query.settings) :
    router.query.account === 'welcome' || router.query.signin === 'failed' ? 'profile' : '';
  useEffect(() => {
    if (!router.isReady || !requested) return;
    setSettingsTab(requested as typeof settingsTab); setAction('settings');
  }, [router.isReady, router.pathname, requested]);
  useEffect(() => {
    const remote = sync.remote;
    if (!remote) { setupOwner.current = null; return; }
    if (!remote.profile) {
      if (setupOwner.current === remote.user.id) return;
      setupOwner.current = remote.user.id;
      try { sessionStorage.setItem(onboardingKey, remote.user.id); } catch { /* The current visit can still finish setup. */ }
      setOnboarding(false); setSettingsTab('profile'); setAction('settings'); return;
    }
    let pending = setupOwner.current;
    try { pending = sessionStorage.getItem(onboardingKey); } catch { /* Use this visit's marker. */ }
    if (pending !== remote.user.id) return;
    // Keep the save choice in the same popup before advancing to saving preferences.
    if (sync.status !== 'ready' && sync.status !== 'paused') return;
    setOnboarding(true); setSettingsTab('saving'); setAction('settings');
  }, [sync.remote, sync.status]);
  const close = () => {
    if (onboarding && sync.remote?.profile) {
      try { sessionStorage.removeItem(onboardingKey); } catch { /* No persistent marker to clear. */ }
      setupOwner.current = null;
    }
    setAction(null); setOnboarding(false);
    const query = { ...router.query };
    for (const key of ['account', 'settings', 'confirm', 'signin']) delete query[key];
    if (requested) void router.replace({ pathname: router.pathname, query, hash: router.asPath.split('#')[1] ?? '' }, undefined, { shallow: true, scroll: false });
    requestAnimationFrame(() => { if (opener.current?.isConnected) opener.current.focus({ preventScroll: true }); });
  };
  useEffect(() => {
    const dismiss = (_url: string, { shallow }: { shallow: boolean }) => { if (!shallow) setAction(null); };
    router.events.on('routeChangeStart', dismiss); return () => router.events.off('routeChangeStart', dismiss);
  }, [router.events]);
  const localTables = ['game-account-map', 'import-aliases', 'material-catalogue'].every(name => tables[name] != null);
  useEffect(() => {
    if (action !== 'import' || localTables || loaded) return;
    const controller = new AbortController();
    // Load the deployment's account props only when needed, without changing routes
    // or bundling game tables into the shared header. Keep its release with its tables.
    const buildId = JSON.parse(document.getElementById('__NEXT_DATA__')?.textContent ?? '{}').buildId;
    setError('');
    void fetchAsset(`${router.basePath}/_next/data/${encodeURIComponent(buildId)}/account.json`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Import tools could not load. Please try again.');
      const { pageProps } = await response.json();
      if (!pageProps?.__contentTables || !['game-account-map', 'import-aliases', 'material-catalogue'].every(name => pageProps.__contentTables[name] != null)) throw new Error('Import tools could not load. Please try again.');
      setLoaded({ tables: pageProps.__contentTables, release: pageProps.__contentRelease ?? null });
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [action, localTables, loaded, router.basePath, attempt]);
  const avatar = <AvatarPicker head={<div className="account-profile-summary"><ProfileAvatar /><h3>Profile picture</h3></div>} />;
  return <Context.Provider value={{ open: value => {
    const active = document.activeElement as HTMLElement | null;
    const menu = active?.closest('.action-popover');
    opener.current = menu ? [...document.querySelectorAll<HTMLElement>('[aria-controls]')].find(element => element.getAttribute('aria-controls') === menu.id) ?? active : active;
    setError(''); setSettingsTab(onboarding ? 'saving' : 'profile'); setAction(value); } }}>
    {children}
    {action === 'import' && (localTables || loaded ? <ContentContext.Provider value={localTables ? release : loaded!.release}><ContentTablesContext.Provider value={localTables ? tables : loaded!.tables}><DataDialog onClose={close} /></ContentTablesContext.Provider></ContentContext.Provider> : <ImportDialog title="Import / export" onClose={close}><p role={error ? 'alert' : 'status'}>{error || 'Loading import tools…'}</p>{error && <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button>}</ImportDialog>)}
    {action === 'settings' && (sync.status === 'unavailable'
      ? <ImportDialog title="Account settings" onClose={close}>{avatar}</ImportDialog>
      : <CloudAccountPanel key={`${settingsTab}:${onboarding}`} settingsOnly initialSettings={settingsTab} onboarding={onboarding} pictureContent={avatar} onSettingsClose={close} onOpenData={() => { close(); setAction('import'); }} />)}
  </Context.Provider>;
}
