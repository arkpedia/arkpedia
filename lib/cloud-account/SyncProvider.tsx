import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { collectCloudData, fingerprint, restoreCloudData, type CloudData } from './data';
import { isResettingBrowserData } from '@/lib/account/resetData';
import { syncDecision, type SyncMarker } from './sync-policy';
import type { AccountProfile } from './profile';
import { archiveUploadChunks, type PullArchive } from '@/lib/account/pullArchive';
import { archivesForOwner, claimArchives, collectPullArchives, restorePullArchives } from '@/lib/account/pullArchiveStore';

interface Remote {
  user: { id: string; name: string }; profile: AccountProfile | null; linkedProviders: string[];
  linkedAccounts: { id: string; providerId: string }[];
  revision: number; archiveRevision?: number; gameSync: boolean; personalSync?: boolean; historySync?: boolean; archives?: PullArchive[]; paused: boolean; data: CloudData; providers: string[]; updatedAt?: string;
}
const MARKER = 'arkpedia:cloud-sync-v1';
type Status = 'loading' | 'unavailable' | 'signed-out' | 'setup' | 'choice' | 'ready' | 'paused' | 'error';
interface SyncState { status: Status; remote: Remote | null; providers: string[]; message: string }
interface SyncContext extends SyncState {
  refresh: () => Promise<void>; choose: (source: 'browser' | 'cloud') => Promise<void>;
  consent: (enabled: boolean, category?: 'gameSync' | 'historySync' | 'personalSync') => Promise<void>; erase: () => Promise<void>;
  pause: () => void; resume: () => Promise<void>;
}
const Context = createContext<SyncContext | null>(null);
function readMarker(): SyncMarker | null {
  try { return JSON.parse(localStorage.getItem(MARKER) ?? 'null'); } catch { return null; }
}
function mark(remote: Remote, data: CloudData) {
  localStorage.setItem(MARKER, JSON.stringify({ userId: remote.user.id, revision: remote.revision, fingerprint: fingerprint(data) }));
}
let retryAt = 0;
async function request(method = 'GET', body?: unknown, known?: Remote | null) {
  if (Date.now() < retryAt) throw new Error('Cloud saving is waiting before retrying. Your browser data is unchanged.');
  const archiveHeaders: Record<string, string> = known?.archiveRevision === undefined ? {} : { 'X-Arkpedia-Archive-Owner': known.user.id, 'X-Arkpedia-Archive-Revision': String(known.archiveRevision) };
  const response = await fetch('/api/cloud-account', { method, credentials: 'same-origin', cache: 'no-store',
    headers: { ...archiveHeaders, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (response.status === 429 || response.status >= 500) {
    const delay = Number(response.headers.get('retry-after') || 60);
    retryAt = Date.now() + Math.min(300, Math.max(1, Number.isFinite(delay) ? delay : 60)) * 1000;
  } else retryAt = 0;
  const data = await response.json();
  if (data.archivesUnchanged) {
    if (!known || data.user?.id !== known.user.id || data.archiveRevision !== known.archiveRevision) throw new Error('Archive identity changed. Refresh your account.');
    data.archives = known.archives ?? [];
  }
  return { response, data };
}

const DISABLED: SyncContext = {
  status: 'unavailable', remote: null, providers: [], message: '',
  refresh: async () => {}, choose: async () => {}, consent: async () => {},
  erase: async () => {}, pause: () => {}, resume: async () => {},
};

export function CloudSyncProvider({ children, onRestore }: { children: ReactNode; onRestore: () => void }) {
  if (process.env.ARKPEDIA_CLOUD_ACCOUNTS !== '1') return <Context.Provider value={DISABLED}>{children}</Context.Provider>;
  return <EnabledCloudSyncProvider onRestore={onRestore}>{children}</EnabledCloudSyncProvider>;
}

function EnabledCloudSyncProvider({ children, onRestore }: { children: ReactNode; onRestore: () => void }) {
  const [state, setState] = useState<SyncState>({ status: 'loading', remote: null, providers: [], message: '' });
  const busy = useRef(false), paused = useRef(false), stateRef = useRef(state);
  stateRef.current = state;
  const show = useCallback((remote: Remote, status: Status, message: string) => setState({ remote, status, providers: remote.providers, message }), []);
  const restore = useCallback((remote: Remote) => {
    restorePullArchives(remote.historySync ? remote.archives ?? [] : []);
    restoreCloudData(remote.data, remote.gameSync, localStorage, remote.personalSync ?? true);
    mark(remote, collectCloudData(localStorage, remote.gameSync, remote.personalSync ?? true));
    show(remote, 'ready', 'Up to date'); onRestore();
  }, [onRestore, show]);
  const upload = useCallback(async (remote: Remote, local: CloudData) => {
    const sent = await request('PUT', { owner: remote.user.id, revision: remote.revision, data: local });
    if (isResettingBrowserData() || paused.current) return;
    if (sent.response.status === 409) { show(remote, 'choice', 'Your cloud save changed. Review both copies before continuing.'); return; }
    if (!sent.response.ok) throw new Error(sent.data.error);
    const saved = { ...remote, ...sent.data, updatedAt: new Date().toISOString() };
    mark(saved, local); show(saved, 'ready', 'Up to date');
  }, [show]);
  const syncArchives = useCallback(async (initial: Remote): Promise<Remote> => {
    if (!initial.historySync || initial.paused || !initial.profile) return initial;
    const local = archivesForOwner(collectPullArchives(localStorage), initial.user.id);
    const chunks = archiveUploadChunks(local, initial.archives ?? []);
    let remote = initial;
    for (const archives of chunks) {
      let finished = false;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (paused.current || isResettingBrowserData()) throw new Error('Cloud saving was paused.');
        if (!remote.historySync || remote.paused) return remote;
        const result = await request('POST', { owner: remote.user.id, revision: remote.revision, archives });
        if (result.response.status === 409) {
          const latest = await request('GET', undefined, remote);
          if (!latest.response.ok || latest.data.user.id !== initial.user.id) throw new Error('Your signed-in account changed. Reopen your account.');
          remote = latest.data; continue;
        }
        if (!result.response.ok) throw new Error(result.data.error);
        remote = { ...remote, ...result.data }; finished = true; break;
      }
      if (!finished) throw new Error('Another device is updating your archive. Retry sync; existing pulls are safe.');
    }
    restorePullArchives(remote.archives ?? []);
    claimArchives([...local, ...remote.archives ?? []], initial.user.id);
    const marker = readMarker();
    // Archive-only writes do not create a conflict with this browser's personal edits.
    if (marker?.userId === initial.user.id && marker.revision === initial.revision && fingerprint(initial.data) === fingerprint(remote.data)) {
      localStorage.setItem(MARKER, JSON.stringify({ ...marker, revision: remote.revision }));
    }
    return remote;
  }, []);
  const refresh = useCallback(async () => {
    if (busy.current || paused.current || isResettingBrowserData()) return;
    busy.current = true;
    try {
      const { response, data } = await request('GET', undefined, stateRef.current.remote);
      if (paused.current || isResettingBrowserData()) return;
      if (response.status === 401) { setState({ status: 'signed-out', remote: null, providers: data.providers ?? [], message: '' }); return; }
      if (response.status === 503) { setState(s => ({ ...s, status: s.remote ? 'error' : 'unavailable', message: data.error })); return; }
      if (!response.ok) throw new Error(data.error);
      const received = data as Remote, previous = readMarker();
      const browserArchives = collectPullArchives(localStorage);
      if (previous && previous.userId !== received.user.id && browserArchives.length && received.profile && !received.paused) {
        claimArchives(browserArchives, previous.userId);
        show(received, 'choice', 'This browser contains another Arkpedia account’s history. Choose whether to use its browser data or keep this account’s cloud data.'); return;
      }
      const remote = await syncArchives(received);
      if (!remote.profile) { show(remote, 'setup', 'Choose your Arkpedia username.'); return; }
      const local = collectCloudData(localStorage, remote.gameSync, remote.personalSync ?? true);
      const decision = syncDecision(remote, local, readMarker());
      if (decision === 'paused') { show(remote, 'paused', 'Cloud saving is paused. Your browser data stays here.'); return; }
      if (decision === 'choice') { show(remote, 'choice', 'This browser and your account have different saves. Choose which copy to keep.'); return; }
      if (decision === 'restore') { restore(remote); return; }
      if (decision === 'upload') { await upload(remote, local); return; }
      mark(remote, local); show(remote, 'ready', 'Up to date');
    } catch (error) { setState(s => ({ ...s, status: 'error', message: error instanceof Error ? error.message : 'Could not sync. Your browser data is safe.' })); }
    finally { busy.current = false; }
  }, [restore, show, upload, syncArchives]);

  useEffect(() => {
    void refresh();
    const tick = () => { if (document.visibilityState === 'visible' && ['ready', 'error', 'paused'].includes(stateRef.current.status)) void refresh(); };
    const timer = setInterval(tick, 15000);
    window.addEventListener('focus', tick);
    return () => { clearInterval(timer); window.removeEventListener('focus', tick); };
  }, [refresh]);

  async function choose(source: 'browser' | 'cloud') {
    if (busy.current || paused.current) return;
    busy.current = true;
    try {
      const { response, data } = await request('GET', undefined, stateRef.current.remote);
      if (!response.ok) throw new Error(data.error);
      let remote = data as Remote;
      if (remote.user.id !== stateRef.current.remote?.user.id || remote.revision !== stateRef.current.remote?.revision) {
        show(remote, 'choice', 'The cloud copy changed again. Review your choice and try once more.'); return;
      }
      if (!remote.profile) { show(remote, 'setup', 'Choose your Arkpedia username.'); return; }
      const previous = readMarker();
      if (previous && previous.userId !== remote.user.id && source === 'browser') claimArchives(collectPullArchives(localStorage), remote.user.id, true);
      const chosen = remote;
      remote = await syncArchives(remote);
      if (remote.paused && !chosen.paused) { show(remote, 'paused', 'Cloud saving was paused on another device. Your browser data stays here.'); return; }
      if (fingerprint(remote.data) !== fingerprint(chosen.data) || remote.personalSync !== chosen.personalSync || remote.gameSync !== chosen.gameSync || remote.historySync !== chosen.historySync) {
        show(remote, 'choice', 'Another device changed your save or saving choices. Review your choice again.'); return;
      }
      if (source === 'cloud') restore(remote);
      else await upload(remote, collectCloudData(localStorage, remote.gameSync, remote.personalSync ?? true));
    } catch (error) { setState(s => ({ ...s, status: 'error', message: error instanceof Error ? error.message : 'Could not sync.' })); }
    finally { busy.current = false; }
  }

  async function mutate(method: 'PATCH' | 'DELETE', enabled?: boolean, category = 'gameSync') {
    const current = stateRef.current;
    if (busy.current || !current.remote || paused.current) throw new Error('Sync is busy. Try again in a moment.');
    busy.current = true;
    try {
      const result = await request(method, { owner: current.remote.user.id, revision: current.remote.revision, savingVersion: 2, ...(method === 'PATCH' ? { [category]: enabled } : {}) });
      if (!result.response.ok) throw new Error(result.data.error);
      const remote = { ...current.remote, ...result.data } as Remote;
      if (method === 'DELETE') show(remote, 'paused', 'Cloud saves deleted. Your browser data and Arkpedia account are kept.');
      else { mark(remote, remote.data); show(remote, remote.paused ? 'paused' : 'ready', enabled ? 'Saving enabled.' : 'Selected cloud data removed.'); }
    } catch (error) { setState(s => ({ ...s, status: 'error', message: error instanceof Error ? error.message : 'Could not update cloud saves.' })); throw error; }
    finally { busy.current = false; }
    if (method === 'PATCH') await refresh();
  }
  // Retain the previous owner so another account cannot silently inherit these saves.
  function pause() { paused.current = true; }
  async function resume() { paused.current = false; await refresh(); }
  return <Context.Provider value={{ ...state, refresh, choose, consent: (enabled, category) => mutate('PATCH', enabled, category), erase: () => mutate('DELETE'), pause, resume }}>{children}</Context.Provider>;
}

export function useCloudSync() {
  const context = useContext(Context);
  if (!context) throw new Error('Cloud sync provider is missing.');
  return context;
}
