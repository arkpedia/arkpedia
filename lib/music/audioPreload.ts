/** One upcoming complete audio file, held only for this tab. The playing element stays
 * the same (including on iOS); handing it a Blob URL avoids another network round trip. */
const MAX_BYTES = 80 * 1024 * 1024;
const MAX_AGE_MS = 15 * 60 * 1000;
const LOAD_MS = 90000;
interface Target { cid: string; address: string }
interface Prepared extends Target { url: string; at: number }
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
  const cids = new Map<string, string>();
  const matches = (a: Target | null, b: Target | null) => a?.cid === b?.cid && a?.address === b?.address;
  const revoke = (url: string) => { cids.delete(url); revokeURL(url); };
  const cancel = () => { if (pending) { clearTimeout(pending.timer); pending.controller.abort(); pending = null; } };
  function select(next: Target | null, load: boolean) {
    if (!matches(target, next)) {
      cancel();
      if (prepared) revoke(prepared.url);
      prepared = null;
      failed = false;
      target = next;
    }
    if (prepared && now() - prepared.at > MAX_AGE_MS) { revoke(prepared.url); prepared = null; }
    if (!next || !load) { cancel(); return; }
    if (prepared || pending || failed) return;
    const controller = new AbortController();
    const task = { controller, timer: setTimeout(() => controller.abort(), LOAD_MS) };
    pending = task;
    void request(next.address, { signal: controller.signal, credentials: 'omit', priority: 'low' }).then(completeAudio).then(blob => {
      if (pending !== task || controller.signal.aborted || !matches(target, next)) return;
      const url = createURL(blob);
      prepared = { ...next, url, at: now() };
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
      if (!matches(target, { cid, address })) return null;
      cancel();
      const ready = prepared;
      prepared = null;
      target = null;
      failed = false;
      if (!ready) return null;
      if (now() - ready.at > MAX_AGE_MS) { revoke(ready.url); return null; }
      return { url: ready.url, release: () => revoke(ready.url) };
    },
    cid: (url: string) => cids.get(url.split('#')[0]) ?? null,
  };
}
export const musicAudioPreloader = createAudioPreloader();
