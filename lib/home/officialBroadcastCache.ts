/** Public provider metadata only, in the existing page-cache bucket. Never account data. */
export interface BroadcastCacheBucket {
  get(key: string): Promise<{ etag: string; text(): Promise<string> } | null>;
  put(key: string, value: string, options?: { onlyIf: { etagMatches?: string; etagDoesNotMatch?: string } }): Promise<{ etag: string } | null>;
}
interface Envelope<T> { kept?: { value: T; builtAt: number; refreshAt: number; failed?: boolean }; lease?: { until: number; nonce: string }; retryAt?: number }
export function memoryBroadcastBucket(): BroadcastCacheBucket {
  const values = new Map<string, { etag: string; value: string }>(); let revision = 0;
  return {
    async get(key) { const object = values.get(key); return object ? { etag: object.etag, text: async () => object.value } : null; },
    async put(key, value, options) {
      const current = values.get(key), condition = options?.onlyIf;
      if (condition?.etagMatches && current?.etag !== condition.etagMatches || condition?.etagDoesNotMatch === '*' && current) return null;
      const etag = String(++revision); values.set(key, { etag, value }); return { etag };
    },
  };
}

/** One global refresh lease prevents cold isolates from multiplying YouTube search quota. */
export async function cachedBroadcastData<T>(bucket: BroadcastCacheBucket, key: string, load: (previous?: T) => Promise<T>, {
  ttl, maxAge, valid, now = Date.now, wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)), retryDelay = 60000,
}: { ttl: (value: T) => number; maxAge: number; valid: (value: unknown) => value is T; now?: () => number; wait?: (ms: number) => Promise<void>; retryDelay?: number }): Promise<{ value: T; stale: boolean }> {
  const objectKey = `official-broadcasts/v1/${key}`, deadline = now() + 10000;
  const write = async (body: Envelope<T>, condition: { etagMatches?: string; etagDoesNotMatch?: string }) => {
    for (let attempt = 0; ; attempt++) try { return await bucket.put(objectKey, JSON.stringify(body), { onlyIf: condition }); }
    catch (error) {
      if (/\b(412|10031)\b|PreconditionFailed/i.test(String(error))) return null;
      if (attempt >= 3 || !/\b(429|10058)\b|TooManyRequests/i.test(String(error))) throw error;
      await wait(1100); // R2 permits one write to a key per second; never repeat the provider call.
    }
  };
  while (now() < deadline) {
    const object = await bucket.get(objectKey); let envelope: Envelope<T> = {};
    try { if (object) envelope = JSON.parse(await object.text()) ?? {}; } catch { /* Replace an invalid cache through its ETag. */ }
    const candidate = envelope.kept;
    const kept = candidate && valid(candidate.value) && Number.isFinite(candidate.builtAt) && now() - candidate.builtAt <= maxAge ? candidate : undefined;
    if (kept && kept.refreshAt > now()) return { value: kept.value, stale: !!kept.failed };
    if (envelope.retryAt && envelope.retryAt > now()) { if (kept) return { value: kept.value, stale: true }; throw Error('Official broadcast refresh is temporarily unavailable'); }
    if (envelope.lease && envelope.lease.until > now()) { if (kept) return { value: kept.value, stale: !!kept.failed }; await wait(100); continue; }
    const lease = await write({ kept, lease: { until: now() + 60000, nonce: crypto.randomUUID() } }, object ? { etagMatches: object.etag } : { etagDoesNotMatch: '*' });
    if (!lease) { await wait(50); continue; }
    try {
      const value = await load(kept?.value);
      await write({ kept: { value, builtAt: now(), refreshAt: now() + ttl(value) } }, { etagMatches: lease.etag });
      return { value, stale: false };
    } catch (error) {
      const delay = /quota/i.test(error instanceof Error ? error.message : '') ? 6 * 3600000 : retryDelay;
      await write({ kept: kept ? { ...kept, failed: true } : undefined, retryAt: now() + delay }, { etagMatches: lease.etag });
      if (kept) return { value: kept.value, stale: true };
      throw error;
    }
  }
  throw Error('Official broadcast refresh is busy');
}
