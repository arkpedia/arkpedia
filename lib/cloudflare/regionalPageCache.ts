import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";

/** OpenNext's page cache interface, named through the package this repo depends on. */
type IncrementalCache = Parameters<typeof withRegionalCache>[0];

/*
 * The Worker's pages, kept close to the reader (docs/development/cloudflare-workers.md).
 *
 * Every page the Worker serves sits in the R2 bucket, which lives in western North America:
 * from Europe a cache hit still crossed the Atlantic for the whole page, 0.3-1.7 s to the
 * first byte against www's 0.06-0.25 s (measured 2026-10-23). OpenNext's regional cache keeps
 * a copy in Cloudflare's cache in the data centre the reader reached, so only the first
 * reader there pays for R2.
 *
 * Stock, a copy lasts as long as its page's revalidate time, 60 or 300 s here
 * (lib/content/revalidation.ts), so a reader back after a few minutes paid for R2 again.
 * Here it lasts at least REGIONAL_COPY_SECONDS. That serves nothing staler than ISR already
 * does: a copy past its revalidate time is served stale and re-rendered in the background
 * (the queue in open-next.config.ts), and every hit re-reads R2 in the background and
 * refreshes the copy, so a reader sees at most one visit's worth of age, as on Vercel.
 * Only a custom domain has the cache; on workers.dev it is a no-op and R2 answers as before.
 */
export const REGIONAL_COPY_SECONDS = 24 * 60 * 60;

/** A Cache whose `put` keeps each response for at least `seconds`, whatever max-age it set. */
export function keepAtLeast(cache: Cache, seconds: number): Cache {
  return new Proxy(cache, {
    get(target, property) {
      if (property === "put") {
        return (request: RequestInfo | URL, response: Response) => {
          const headers = new Headers(response.headers);
          const age = Number(/max-age=(\d+)/.exec(headers.get("cache-control") ?? "")?.[1] ?? 0);
          headers.set("cache-control", `max-age=${Math.max(age, seconds)}`);
          return target.put(request, new Response(response.body, { status: response.status, statusText: response.statusText, headers }));
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

type CacheOwner = { getCacheInstance?: () => Promise<Cache> };

/**
 * OpenNext's long-lived regional cache over `store`, whose copies last at least `seconds`.
 * The lifetime is set where the regional cache opens its Cache (getCacheInstance), which is
 * not public API: test-regional-page-cache.ts holds an OpenNext upgrade to it, and if the
 * method is gone the cache still works, with OpenNext's own lifetimes.
 */
export function regionalPageCache(store: IncrementalCache, seconds = REGIONAL_COPY_SECONDS): IncrementalCache {
  // Refresh the copy from R2 on every hit: that is what keeps a day-long copy current.
  const regional = withRegionalCache(store, { mode: "long-lived", shouldLazilyUpdateOnCacheHit: true });
  const owner = regional as unknown as CacheOwner;
  if (typeof owner.getCacheInstance === "function") {
    const open = owner.getCacheInstance.bind(regional);
    let kept: Promise<Cache> | undefined;
    owner.getCacheInstance = () => (kept ??= open().then((cache) => keepAtLeast(cache, seconds)));
  }
  return regional;
}
