import { BACKUP_STORES } from '@/lib/account/backup';
import { fingerprint, type CloudData } from './data';

export interface SyncMarker { userId: string; revision: number; fingerprint: string }
interface Snapshot { user: { id: string }; revision: number; data: CloudData; paused?: boolean }
const stores = new Set(BACKUP_STORES.map(store => store.key));
function hasSavedData(data: CloudData): boolean {
  return Object.entries(data).some(([key, value]) => stores.has(key) && value != null &&
    (Array.isArray(value) ? value.length > 0 : typeof value === 'object' ? Object.keys(value).length > 0 : !!value));
}

export function syncDecision(remote: Snapshot, local: CloudData, marker: SyncMarker | null): 'paused' | 'ready' | 'upload' | 'restore' | 'choice' {
  if (remote.paused) return 'paused';
  const here = fingerprint(local), there = fingerprint(remote.data);
  if (here === there) return 'ready';
  if (marker?.userId === remote.user.id) {
    if (marker.revision > remote.revision) return 'choice';
    if (marker.revision === remote.revision) return 'upload';
    return here === marker.fingerprint ? 'restore' : 'choice';
  }
  if (marker && hasSavedData(local)) return 'choice';
  if (remote.revision === 0 && Object.keys(remote.data).length === 0) return 'upload';
  return hasSavedData(local) ? 'choice' : 'restore';
}
