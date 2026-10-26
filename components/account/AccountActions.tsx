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
  const [settingsWasRemote, setSettingsWasRemote] = useState(false);
  const tables = useContext(ContentTablesContext), release = useContext(ContentContext);
  const sync = useCloudSync(), router = useRouter();
  const close = () => { setAction(null); requestAnimationFrame(() => { if (opener.current?.isConnected) opener.current.focus({ preventScroll: true }); }); };
  useEffect(() => { const dismiss = () => setAction(null); router.events.on('routeChangeStart', dismiss); return () => router.events.off('routeChangeStart', dismiss); }, [router.events]);
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
  const avatar = <><div className="account-profile-summary"><ProfileAvatar /><h3>Profile picture</h3></div><AvatarPicker /></>;
  return <Context.Provider value={{ open: value => {
    const active = document.activeElement as HTMLElement | null;
    const menu = active?.closest('.action-popover');
    opener.current = menu ? [...document.querySelectorAll<HTMLElement>('[aria-controls]')].find(element => element.getAttribute('aria-controls') === menu.id) ?? active : active;
    setError(''); setSettingsWasRemote(!!sync.remote); setAction(value); } }}>
    {children}
    {action === 'import' && (localTables || loaded ? <ContentContext.Provider value={localTables ? release : loaded!.release}><ContentTablesContext.Provider value={localTables ? tables : loaded!.tables}><DataDialog onClose={close} /></ContentTablesContext.Provider></ContentContext.Provider> : <ImportDialog title="Import / export" onClose={close}><p role={error ? 'alert' : 'status'}>{error || 'Loading import tools…'}</p>{error && <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button>}</ImportDialog>)}
    {action === 'settings' && (sync.remote ? <CloudAccountPanel settingsOnly initialSettings="profile" profileContent={avatar} onSettingsClose={close} onOpenData={() => setAction('import')} /> : settingsWasRemote ? null : <ImportDialog title="Account settings" onClose={close}>{avatar}<CloudAccountPanel /></ImportDialog>)}
  </Context.Provider>;
}
