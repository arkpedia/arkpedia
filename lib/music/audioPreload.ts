import { audioLinkExpiry } from './monsterSirenAudio';

/** Preload one upcoming file and retain up to three recently used complete files in this tab. The playing element stays
 * the same (including on iOS); handing it a Blob URL avoids another network round trip.
 *
 * Before that, and without it (a file not finished, or too large), the upcoming song's signed
 * address: a HEAD of its address (pages/api/music-audio) follows the redirect to Monster Siren's
 * CDN, which answers with headers only, and the response's url is the signed address. Played from
 * there, the song starts without asking the route, so without waiting on Monster Siren's API
 * (0.8-3 s on the Cloudflare Worker, 2026-10-22); the HEAD also has the CDN fetch the file's start
 * from its origin. No audio is downloaded for it, and the element is never touched: the press sets
 * the address and plays, as before (iOS). */
const MAX_BYTES = 80 * 1024 * 1024;
const RECENT_BYTES = 96 * 1024 * 1024;
const RECENT_TRACKS = 3;
const MAX_AGE_MS = 15 * 60 * 1000;
const LOAD_MS = 90000;
const LINK_MS = 20000;
/** A signed address is handed to playback only while it has this long left: playback keeps an
 *  address for up to an hour before asking again (playbackEngine.ts ADDRESS_MAX_AGE_MS). */
const LINK_MIN_LIFE_MS = 70 * 60 * 1000;
interface Target { cid: string; address: string }
interface Prepared extends Target { url: string; at: number; reusable?: Blob }
interface Link extends Target { href: string; expires: number }
interface PreloadOptions {
  fetch?: typeof fetch;
  createURL?: (blob: Blob) => string;
  revokeURL?: (url: string) => void;
  now?: () => number;
}

/** Never hand playback a truncated file: even a server ignoring limits is bounded. */
async function completeAudio(response: Response): Promise<Blob> {
  const type = response.headers.get('content-type') ?? '';
  const declared = Number(response.headers.get('content-length'));
  if (response.status !== 200 || !/^audio\//i.test(type) || !response.body || declared > MAX_BYTES) {
    await response.body?.cancel();
    throw new Error('Audio cannot be preloaded');
  }
  const reader = response.body.getReader();
  let size = 0;
  // Response.blob owns the bytes, without decoding another song into PCM memory.
  const bounded = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) { controller.close(); return; }
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); controller.error(new Error('Audio too large')); return; }
        controller.enqueue(value);
      } catch (error) { controller.error(error); }
    },
    cancel: () => reader.cancel(),
  });
  const blob = await new Response(bounded, { headers: { 'content-type': type } }).blob();
  if (!size || (declared > 0 && declared !== size)) throw new Error('Incomplete audio');
  return blob;
}

export function createAudioPreloader({ fetch: request = fetch, createURL = blob => URL.createObjectURL(blob),
  revokeURL = url => URL.revokeObjectURL(url), now = Date.now }: PreloadOptions = {}) {
  let target: Target | null = null;
  let prepared: Prepared | null = null;
  let pending: { controller: AbortController; timer: ReturnType<typeof setTimeout> } | null = null;
  let failed = false;
  let link: Link | null = null;
  let linking: { controller: AbortController; timer: ReturnType<typeof setTimeout> } | null = null;
  let linkFailed = false;
  const cids = new Map<string, string>();
  const matches = (a: Target | null, b: Target | null) => a?.cid === b?.cid && a?.address === b?.address;
  // Keep only files already downloaded for playback. Each deck gets its own
  // object URL, so eviction or releasing one deck cannot interrupt the other.
  const recent = new Map<string, { blob: Blob; at: number; cid: string }>();
  function pruneRecent() {
    let bytes = 0;
    for (const [address, file] of recent) {
      if (now() - file.at > MAX_AGE_MS) recent.delete(address);
      else bytes += file.blob.size;
    }
    for (const [address, file] of recent) {
      if (recent.size <= RECENT_TRACKS && bytes <= RECENT_BYTES) break;
      recent.delete(address);
      bytes -= file.blob.size;
    }
  }
  const revoke = (url: string) => { cids.delete(url); revokeURL(url); };
  const cancel = () => { if (pending) { clearTimeout(pending.timer); pending.controller.abort(); pending = null; } };
  const cancelLink = () => { if (linking) { clearTimeout(linking.timer); linking.controller.abort(); linking = null; } };
  const lasts = (held: Link | null): held is Link => Boolean(held && held.expires - now() >= LINK_MIN_LIFE_MS);
  /** The upcoming song's signed address, asked for once per song (see the top of this file). */
  function resolveLink(next: Target) {
    if (link && !lasts(link)) link = null;
    if (link || linking || linkFailed) return;
    const controller = new AbortController();
    const task = { controller, timer: setTimeout(() => controller.abort(), LINK_MS) };
    linking = task;
    void request(next.address, { method: 'HEAD', signal: controller.signal, credentials: 'omit', priority: 'low' }).then(response => {
      if (linking !== task || !matches(target, next)) return;
      const expires = response.ok ? audioLinkExpiry(response.url, now()) : null;
      const held = expires === null ? null : { ...next, href: response.url, expires };
      if (lasts(held)) link = held; else linkFailed = true;
    }).catch(() => {
      if (linking === task) linkFailed = true;
    }).finally(() => {
      clearTimeout(task.timer);
      if (linking === task) linking = null;
    });
  }
  function select(next: Target | null, load: boolean) {
    if (!matches(target, next)) {
      cancel();
      cancelLink();
      if (prepared) revoke(prepared.url);
      prepared = null;
      failed = false;
      link = null;
      linkFailed = false;
      target = next;
    }
    if (prepared && now() - prepared.at > MAX_AGE_MS) { revoke(prepared.url); prepared = null; }
    // The address is asked for even while this song is paused or still loading: it is headers only.
    pruneRecent();
    if (next && recent.get(next.address)?.cid === next.cid) return;
    if (next) resolveLink(next);
    if (!next || !load) { cancel(); return; }
    if (prepared || pending || failed) return;
    const controller = new AbortController();
    const task = { controller, timer: setTimeout(() => controller.abort(), LOAD_MS) };
    pending = task;
    void request(next.address, { signal: controller.signal, credentials: 'omit', priority: 'low' }).then(async response => {
      const reusable = !/\bno-store\b/i.test(response.headers.get('cache-control') ?? '');
      return { blob: await completeAudio(response), reusable };
    }).then(({ blob, reusable }) => {
      if (pending !== task || controller.signal.aborted || !matches(target, next)) return;
      const url = createURL(blob);
      prepared = { ...next, url, at: now(), reusable: reusable ? blob : undefined };
      cids.set(url, next.cid);
    }).catch(() => {
      // Optional loading never changes the current song or playback errors.
      if (pending === task) failed = true;
    }).finally(() => {
      clearTimeout(task.timer);
      if (pending === task) pending = null;
    });
  }
  return {
    select,
    take(cid: string, address: string): { url: string; release: () => void } | null {
      pruneRecent();
      const cached = recent.get(address);
      if (cached && cached.cid === cid) {
        recent.delete(address);
        recent.set(address, cached);
        const url = createURL(cached.blob);
        cids.set(url, cid);
        return { url, release: () => revoke(url) };
      }
      if (!matches(target, { cid, address })) return null;
      cancel();
      cancelLink();
      const ready = prepared;
      const held = link;
      prepared = null;
      link = null;
      target = null;
      failed = false;
      linkFailed = false;
      if (ready && now() - ready.at <= MAX_AGE_MS) {
        if (ready.reusable) {
          recent.set(address, { blob: ready.reusable, cid, at: ready.at });
          pruneRecent();
        }
        return { url: ready.url, release: () => revoke(ready.url) };
      }
      if (ready) revoke(ready.url);
      // No complete file: the signed address, if it still lasts, so the route is not asked again.
      if (!lasts(held)) return null;
      cids.set(held.href, cid);
      return { url: held.href, release: () => { cids.delete(held.href); } };
    },
    cid: (url: string) => cids.get(url.split('#')[0]) ?? null,
  };
}
export const musicAudioPreloader = createAudioPreloader();
