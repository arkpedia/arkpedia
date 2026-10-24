import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { collectCloudData, fingerprint, restoreCloudData, type CloudData } from './data';
import { isResettingBrowserData } from '@/lib/account/resetData';
import { syncDecision, type SyncMarker } from './sync-policy';
import type { AccountProfile } from './profile';

interface Remote {
  user: { id: string; name: string }; profile: AccountProfile | null; linkedProviders: string[];
  linkedAccounts: { id: string; providerId: string }[];
  revision: number; gameSync: boolean; paused: boolean; data: CloudData; providers: string[]; updatedAt?: string;
}
const MARKER = 'arkpedia:cloud-sync-v1';
type Status = 'loading' | 'unavailable' | 'signed-out' | 'setup' | 'choice' | 'ready' | 'paused' | 'error';
interface SyncState { status: Status; remote: Remote | null; providers: string[]; message: string }
interface SyncContext extends SyncState {
  refresh: () => Promise<void>; choose: (source: 'browser' | 'cloud') => Promise<void>;
  consent: (enabled: boolean) => Promise<void>; erase: () => Promise<void>;
  pause: () => void; resume: () => Promise<void>;
}
const Context = createContext<SyncContext | null>(null);
function readMarker(): SyncMarker | null {
  try { return JSON.parse(localStorage.getItem(MARKER) ?? 'null'); } catch { return null; }
}
function mark(remote: Remote, data: CloudData) {
  localStorage.setItem(MARKER, JSON.stringify({ userId: remote.user.id, revision: remote.revision, fingerprint: fingerprint(data) }));
}
async function request(method = 'GET', body?: unknown) {
  const response = await fetch('/api/cloud-account', { method, credentials: 'same-origin', cache: 'no-store',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  return { response, data: await response.json() };
}

export function CloudSyncProvider({ children, onRestore }: { children: ReactNode; onRestore: () => void }) {
  const [state, setState] = useState<SyncState>({ status: 'loading', remote: null, providers: [], message: '' });
  const busy = useRef(false), paused = useRef(false), stateRef = useRef(state);
  stateRef.current = state;
  const show = useCallback((remote: Remote, status: Status, message: string) => setState({ remote, status, providers: remote.providers, message }), []);
  const restore = useCallback((remote: Remote) => {
    restoreCloudData(remote.data, remote.gameSync);
    mark(remote, collectCloudData(localStorage, remote.gameSync));
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
  const refresh = useCallback(async () => {
    if (busy.current || paused.current || isResettingBrowserData()) return;
    busy.current = true;
    try {
      const { response, data } = await request();
      if (paused.current || isResettingBrowserData()) return;
      if (response.status === 401) { setState({ status: 'signed-out', remote: null, providers: data.providers ?? [], message: '' }); return; }
      if (response.status === 503) { setState(s => ({ ...s, status: s.remote ? 'error' : 'unavailable', message: data.error })); return; }
      if (!response.ok) throw new Error(data.error);
      const remote = data as Remote;
      if (!remote.profile) { show(remote, 'setup', 'Choose your Arkpedia username.'); return; }
      const local = collectCloudData(localStorage, remote.gameSync);
      const decision = syncDecision(remote, local, readMarker());
      if (decision === 'paused') { show(remote, 'paused', 'Cloud saving is paused. Your browser data stays here.'); return; }
      if (decision === 'choice') { show(remote, 'choice', 'This browser and your account have different saves. Choose which copy to keep.'); return; }
      if (decision === 'restore') { restore(remote); return; }
      if (decision === 'upload') { await upload(remote, local); return; }
      mark(remote, local); show(remote, 'ready', 'Up to date');
    } catch (error) { setState(s => ({ ...s, status: 'error', message: error instanceof Error ? error.message : 'Could not sync. Your browser data is safe.' })); }
    finally { busy.current = false; }
  }, [restore, show, upload]);

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
      const { response, data } = await request();
      if (!response.ok) throw new Error(data.error);
      const remote = data as Remote;
      if (remote.user.id !== stateRef.current.remote?.user.id || remote.revision !== stateRef.current.remote?.revision) {
        show(remote, 'choice', 'The cloud copy changed again. Review your choice and try once more.'); return;
      }
      if (!remote.profile) { show(remote, 'setup', 'Choose your Arkpedia username.'); return; }
      if (source === 'cloud') restore(remote);
      else await upload(remote, collectCloudData(localStorage, remote.gameSync));
    } catch (error) { setState(s => ({ ...s, status: 'error', message: error instanceof Error ? error.message : 'Could not sync.' })); }
    finally { busy.current = false; }
  }

  async function mutate(method: 'PATCH' | 'DELETE', gameSync?: boolean) {
    const current = stateRef.current;
    if (busy.current || !current.remote || paused.current) return;
    busy.current = true;
    try {
      const result = await request(method, { owner: current.remote.user.id, revision: current.remote.revision, ...(method === 'PATCH' ? { gameSync } : {}) });
      if (!result.response.ok) throw new Error(result.data.error);
      const remote = { ...current.remote, ...result.data } as Remote;
      if (method === 'DELETE') show(remote, 'paused', 'Cloud saves deleted. Your browser data and Arkpedia account are kept.');
      else { mark(remote, remote.data); show(remote, 'ready', gameSync ? 'Imported game-data storage enabled.' : 'Imported game data removed from cloud saves.'); }
    } catch (error) { setState(s => ({ ...s, status: 'error', message: error instanceof Error ? error.message : 'Could not update cloud saves.' })); throw error; }
    finally { busy.current = false; }
    if (method === 'PATCH') await refresh();
  }
  // Retain the previous owner so another account cannot silently inherit these saves.
  function pause() { paused.current = true; }
  async function resume() { paused.current = false; await refresh(); }
  return <Context.Provider value={{ ...state, refresh, choose, consent: enabled => mutate('PATCH', enabled), erase: () => mutate('DELETE'), pause, resume }}>{children}</Context.Provider>;
}

export function useCloudSync() {
  const context = useContext(Context);
  if (!context) throw new Error('Cloud sync provider is missing.');
  return context;
}
