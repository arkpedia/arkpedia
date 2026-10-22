import { audioLinkExpiry } from './monsterSirenAudio';

/*
 * The Cloudflare Worker's copy of each song's signed audio address (pages/api/music-audio). On
 * Vercel the edge keeps the route's redirect (its s-maxage); nothing keeps it in front of the
 * Worker, so every press there asked Monster Siren's API again: 0.8-3.1 s a song from the EU,
 * against 0.09 s for Vercel's kept copy (2026-10-22). Cloudflare's Cache API does nothing on a
 * *.workers.dev address, the Worker's only one, so the copy is kept twice: in the isolate's memory,
 * and in the R2 bucket the Worker already has for its page cache (wrangler.jsonc), under its own
 * prefix, which every isolate reads.
 */

/** An address is handed out only while it has this long left: a held address plays for up to an
 *  hour before the player asks again (playbackEngine.ts ADDRESS_MAX_AGE_MS), with room to spare. */
const MIN_LIFE_MS = 90 * 60 * 1000;
/** And kept at most this long: as long as Vercel's edge keeps the redirect. */
const MAX_KEEP_MS = 30 * 60 * 1000;
const MEMORY_SIZE = 256;
const PREFIX = 'music-audio/';

/** How long an address may be kept and handed out again: at most half an hour, and never into the
 *  last MIN_LIFE_MS before it expires; 0 for an address whose expiry cannot be read. */
export function audioLinkKeepMs(href: string, now: number): number {
  const expires = audioLinkExpiry(href, now);
  return expires === null ? 0 : Math.max(0, Math.min(MAX_KEEP_MS, expires - now - MIN_LIFE_MS));
}

/** The part of an R2 bucket the memo uses. */
export interface LinkBucket {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  put(key: string, value: string): Promise<unknown>;
}
interface Kept { href: string; until: number }

/** The Worker's request context, which OpenNext sets for each request (its worker's init.js, under
 *  this symbol), or null where nothing set it: on Vercel. Read directly rather than through
 *  @opennextjs/cloudflare, a dev dependency whose development path loads wrangler, so none of it
 *  reaches the Vercel build. */
export function workerContext(): { bucket: LinkBucket | null; waitUntil: (work: Promise<unknown>) => void } | null {
  const context = (globalThis as Record<symbol, unknown>)[Symbol.for('__cloudflare-context__')] as
    { env?: Record<string, unknown>; ctx?: { waitUntil?: (work: Promise<unknown>) => void } } | undefined;
  if (!context?.env) return null;
  const bucket = context.env.NEXT_INC_CACHE_R2_BUCKET as LinkBucket | undefined;
  return {
    bucket: bucket && typeof bucket.get === 'function' && typeof bucket.put === 'function' ? bucket : null,
    waitUntil: work => { if (context.ctx?.waitUntil) context.ctx.waitUntil(work); else void work.catch(() => {}); },
  };
}

export function createAudioLinkMemo(now: () => number = Date.now) {
  const memory = new Map<string, Kept>();
  const usable = (kept: Kept | null | undefined): kept is Kept => Boolean(kept && now() < kept.until
    && audioLinkExpiry(kept.href, now()) !== null);
  return {
    /** The kept address of song `id`, or null: from memory, else from the bucket. */
    async get(id: string, bucket: LinkBucket | null): Promise<string | null> {
      const held = memory.get(id);
      if (usable(held)) return held.href;
      memory.delete(id);
      if (!bucket) return null;
      try {
        const stored = await bucket.get(PREFIX + id);
        const kept = stored ? JSON.parse(await stored.text()) as Kept : null;
        if (!usable(kept)) return null;
        memory.set(id, { href: kept.href, until: kept.until });
        return kept.href;
      } catch {
        // A bucket that fails is a miss: the address is asked for, as before.
        return null;
      }
    },
    /** Keeps song `id`'s new address, when it can be kept (audioLinkKeepMs). The returned work is
     *  the bucket's write, for the Worker to finish after the answer (waitUntil). */
    put(id: string, href: string, bucket: LinkBucket | null): Promise<unknown> {
      const keep = audioLinkKeepMs(href, now());
      if (!keep) return Promise.resolve();
      const kept = { href, until: now() + keep };
      memory.delete(id);
      memory.set(id, kept);
      const oldest = memory.size > MEMORY_SIZE ? memory.keys().next().value : undefined;
      if (oldest !== undefined) memory.delete(oldest);
      return bucket ? bucket.put(PREFIX + id, JSON.stringify(kept)).catch(() => {}) : Promise.resolve();
    },
  };
}
