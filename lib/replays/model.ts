import { Unzip, UnzipInflate, unzipSync, strFromU8 } from 'fflate';
import { isServerId, type ServerId } from '@/lib/account-import/yostar';

export const MAX_REPLAY_BYTES = 512_000;
export const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
export const MAX_REPLAYS = 3000;
export const STAGE_ID = /^[a-zA-Z0-9_-]{1,100}$/;
export interface StageMarker { stageId: string; fingerprint: string; hasReplay: boolean }
export interface ReplayRecord { namespace: string; stageId: string; fingerprint: string; hash: string; payload: string; savedAt: number }
export type ReplayManifest = Pick<ReplayRecord, 'stageId' | 'fingerprint' | 'hash'>;
export function namespaceFor(server: ServerId, uid: string): string {
  if (!isServerId(server) || !/^\d{1,24}$/.test(uid)) throw new Error('Game account identity is missing.');
  return `${server}:${uid}`;
}
export function validNamespace(value: unknown): value is string { return typeof value === 'string' && /^(en|jp|kr):\d{1,24}$/.test(value); }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function stageMarkers(user: Record<string, unknown>): StageMarker[] {
  const stages = object(user.dungeon) && object(user.dungeon.stages) ? user.dungeon.stages : {};
  return Object.entries(stages).filter(([id,v]) => STAGE_ID.test(id) && object(v)).slice(0,10_000).map(([stageId, raw]) => {
    const v = raw as Record<string, unknown>;
    const counters = ['hasBattleReplay','startTimes','completeTimes','practiceTimes','state'].map(k => typeof v[k] === 'number' && Number.isSafeInteger(v[k]) && (v[k] as number) >= 0 ? v[k] : null);
    return { stageId, fingerprint: JSON.stringify(counters), hasReplay: v.hasBattleReplay === 1 || v.hasBattleReplay === true };
  }).sort((a,b) => a.stageId.localeCompare(b.stageId));
}
export function needsReplay(marker: StageMarker, cached?: ReplayManifest): boolean { return marker.hasReplay && (!cached || cached.fingerprint !== marker.fingerprint); }
function clean(value: unknown, depth = 0): unknown {
  if (depth > 24) throw new Error('Auto-deploy data is nested too deeply.');
  if (Array.isArray(value)) return value.map(v => clean(v, depth+1));
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => {
    if (/^(email|emailCode|codeToken|authToken|accessToken|refreshToken|idToken|token|password|secret|deviceId|authorization|cookie|__proto__|constructor|prototype)$/i.test(key)) throw new Error('Auto-deploy data contains an unexpected private field.');
    return [key,clean(value[key], depth+1)];
  }));
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Invalid auto-deploy number.');
  return value;
}
export function validateReplay(payload: string, stageId: string): string {
  if (!STAGE_ID.test(stageId) || new TextEncoder().encode(payload).length > MAX_REPLAY_BYTES) throw new Error('Auto-deploy is too large or has an invalid stage.');
  const value: unknown = JSON.parse(payload);
  if (!object(value) || !object(value.journal) || !object(value.journal.metadata) || value.journal.metadata.stageId !== stageId
    || !Array.isArray(value.journal.squad) || !Array.isArray(value.journal.logs)) throw new Error('Auto-deploy does not match the requested stage.');
  // Only the replay document, never its enclosing authenticated response.
  const result = JSON.stringify(clean(value));
  if (new TextEncoder().encode(result).length > MAX_REPLAY_BYTES) throw new Error('Auto-deploy is too large.');
  return result;
}
export function decodeReplay(encoded: string, stageId: string): string {
  if (encoded.length > MAX_REPLAY_BYTES * 2 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('Invalid auto-deploy archive.');
  const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  // Inspect the directory without allocating from its claimed sizes. ZIP64 entries
  // can use 0xffffffff here even when the archive has an ordinary end record.
  let entries = 0, matches = 0;
  try {
    unzipSync(bytes, { filter: entry => { entries++; if (entry.name === 'default_entry') matches++; return false; } });
  } catch { throw new Error('Auto-deploy archive is not a readable ZIP file.'); }
  if (!matches) throw new Error(`Auto-deploy archive contains no replay file (${entries} ${entries === 1 ? 'entry' : 'entries'}).`);
  if (matches !== 1) throw new Error('Auto-deploy archive contains duplicate replay files.');

  const chunks: Uint8Array[] = [];
  let size = 0, started = false, complete = false, failure = '';
  const archive = new Unzip(file => {
    if (file.name !== 'default_entry') return;
    if (started) { failure = 'Auto-deploy archive contains duplicate replay files.'; return; }
    started = true;
    file.ondata = (error, chunk, final) => {
      if (failure) return;
      if (error) { failure = 'Auto-deploy archive could not be decompressed.'; return; }
      size += chunk.length;
      if (size > MAX_REPLAY_BYTES) {
        failure = 'Auto-deploy exceeds the 512 KB per-replay limit after decompression.';
        file.terminate();
        return;
      }
      chunks.push(chunk); complete = final;
    };
    file.start();
  });
  archive.register(UnzipInflate);
  // Small compressed chunks bound transient output even when a hostile header
  // understates the size. Stop as soon as actual decompressed bytes hit the cap.
  try {
    for (let offset = 0; offset < bytes.length && !failure; offset += 128) {
      archive.push(bytes.subarray(offset, offset + 128), offset + 128 >= bytes.length);
    }
  } catch { failure ||= 'Auto-deploy archive could not be decompressed.'; }
  if (failure) throw new Error(failure);
  if (!complete) throw new Error('Auto-deploy archive ended before the replay was complete.');
  const payload = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { payload.set(chunk, offset); offset += chunk.length; }
  return validateReplay(strFromU8(payload),stageId);
}
export async function replayHash(payload: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload))), b=>b.toString(16).padStart(2,'0')).join('');
}
export function validateFingerprint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 150) return false;
  try { const v: unknown = JSON.parse(value); return Array.isArray(v) && v.length===5 && v.every(x=>x===null || typeof x==='number' && Number.isSafeInteger(x) && x>=0); } catch { return false; }
}
