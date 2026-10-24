import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { collectCloudData, fingerprint, restoreCloudData, type CloudData } from './data';
import { isResettingBrowserData } from '@/lib/account/resetData';

interface Remote { user: { id: string; name: string }; revision: number; gameSync: boolean; data: CloudData; providers: string[] }
interface Marker { userId: string; revision: number; fingerprint: string }
const MARKER = 'arkpedia:cloud-sync-v1';
type Status = 'loading' | 'unavailable' | 'signed-out' | 'choice' | 'ready' | 'error';
interface SyncState { status: Status; remote: Remote | null; providers: string[]; message: string }
interface SyncContext extends SyncState {
  refresh: () => Promise<void>;
  choose: (source: 'browser' | 'cloud') => Promise<void>;
  consent: (enabled: boolean) => Promise<void>;
  erase: () => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
}
const Context = createContext<SyncContext | null>(null);

function readMarker(): Marker | null {
  try { return JSON.parse(localStorage.getItem(MARKER) ?? 'null'); } catch { return null; }
}
function mark(remote: Remote, data: CloudData) {
  localStorage.setItem(MARKER, JSON.stringify({ userId: remote.user.id, revision: remote.revision, fingerprint: fingerprint(data) }));
}
async function request(method = 'GET', body?: unknown) {
  const response = await fetch('/api/cloud-account', { method, credentials: 'same-origin', cache: 'no-store',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const data = await response.json();
  return { response, data };
}

export function CloudSyncProvider({ children, onRestore }: { children: ReactNode; onRestore: () => void }) {
  const [state, setState] = useState<SyncState>({ status: 'loading', remote: null, providers: [], message: '' });
  const busy = useRef(false), paused = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
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
      const marker = readMarker();
      if (!marker || marker.userId !== remote.user.id || marker.revision !== remote.revision) {
        setState({ status: 'choice', remote, providers: remote.providers, message: 'Choose which data to use before syncing this browser. Export a backup first if you want to keep both copies.' });
        return;
      }
      const local = collectCloudData(localStorage, remote.gameSync);
      if (marker.fingerprint !== fingerprint(local)) {
        const sent = await request('PUT', { owner: remote.user.id, revision: remote.revision, data: local });
        if (isResettingBrowserData() || paused.current) return;
        if (sent.response.status === 409) { setState({ status: 'choice', remote, providers: remote.providers, message: sent.data.error }); return; }
        if (!sent.response.ok) throw new Error(sent.data.error);
        remote.revision = sent.data.revision;
        remote.data = sent.data.data;
        // A change made during the request must be uploaded on the next tick.
        mark(remote, local);
      }
      setState({ status: 'ready', remote, providers: remote.providers, message: 'Personal saves sync automatically while Arkpedia is open.' });
    } catch (error) { setState(s => ({ ...s, status: 'error', message: error instanceof Error ? error.message : 'Sync failed. Your browser data is safe.' })); }
    finally { busy.current = false; }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && ['ready', 'error'].includes(stateRef.current.status)) void refresh();
    }, 15000);
    const focus = () => { if (['ready', 'error'].includes(stateRef.current.status)) void refresh(); };
    window.addEventListener('focus', focus);
    return () => { clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [refresh]);

  async function choose(source: 'browser' | 'cloud') {
    if (busy.current) return;
    busy.current = true;
    try {
      // Read the latest revision; never override a version not shown to the reader.
      const { response, data } = await request();
      if (!response.ok) throw new Error(data.error);
      const remote = data as Remote;
      if (remote.user.id !== stateRef.current.remote?.user.id || remote.revision !== stateRef.current.remote?.revision) {
        setState({ status: 'choice', remote, providers: remote.providers, message: 'The cloud copy changed again. Review your choice and try once more.' }); return;
      }
      if (source === 'cloud') {
        restoreCloudData(remote.data, remote.gameSync);
        mark(remote, collectCloudData(localStorage, remote.gameSync));
        setState({ status: 'ready', remote, providers: remote.providers, message: 'Cloud data restored. Music playback continues.' });
        onRestore();
      } else {
        const local = collectCloudData(localStorage, remote.gameSync);
        const sent = await request('PUT', { owner: remote.user.id, revision: remote.revision, data: local });
        if (!sent.response.ok) throw new Error(sent.data.error);
        remote.revision = sent.data.revision; remote.data = sent.data.data;
        mark(remote, local);
        setState({ status: 'ready', remote, providers: remote.providers, message: 'This browser’s data is saved. Further changes sync automatically.' });
      }
    } catch (error) { setState(s => ({ ...s, status: 'error', message: error instanceof Error ? error.message : 'Could not sync.' })); }
    finally { busy.current = false; }
  }

  async function mutate(method: 'PATCH' | 'DELETE', gameSync?: boolean) {
    if (busy.current || !state.remote) return;
    busy.current = true;
    try {
      const result = await request(method, { owner: state.remote.user.id, revision: state.remote.revision, ...(method === 'PATCH' ? { gameSync } : {}) });
      if (!result.response.ok) throw new Error(result.data.error);
      const remote = { ...state.remote, ...result.data } as Remote;
      // Stop automatic upload until the reader chooses what to save after consent changes/deletion.
      localStorage.removeItem(MARKER);
      setState({ status: 'choice', remote, providers: state.providers,
        message: method === 'DELETE' ? 'Cloud saves deleted. Browser data remains here. Choose a copy to resume sync.'
          : gameSync ? 'Game-data storage enabled. Choose this browser to upload its imported snapshot, or restore the cloud copy.'
            : 'Imported data deleted from the active cloud save. Your local import is unchanged. Choose a copy to resume personal sync.' });
    } catch (error) { setState(s => ({ ...s, status: 'error', message: error instanceof Error ? error.message : 'Could not update cloud saves.' })); }
    finally { busy.current = false; }
  }
  function pause() { paused.current = true; localStorage.removeItem(MARKER); }
  async function resume() { paused.current = false; await refresh(); }
  return <Context.Provider value={{ ...state, refresh, choose, consent: enabled => mutate('PATCH', enabled), erase: () => mutate('DELETE'), pause, resume }}>{children}</Context.Provider>;
}

export function useCloudSync() {
  const context = useContext(Context);
  if (!context) throw new Error('Cloud sync provider is missing.');
  return context;
}
