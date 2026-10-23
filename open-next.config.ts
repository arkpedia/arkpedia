import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import { regionalPageCache } from "./lib/cloudflare/regionalPageCache";

// The Worker's page cache, as Vercel's ISR cache is for the Vercel deploys
// (docs/development/cloudflare-workers.md):
// - incrementalCache: rendered pages and their data in the R2 bucket bound as
//   NEXT_INC_CACHE_R2_BUCKET (wrangler.jsonc), shared by every isolate. Deploy fills it with
//   the build's prerendered pages. The bucket is in western North America, so each data
//   centre keeps its own copy of a page for a day (lib/cloudflare/regionalPageCache.ts) and
//   only its first reader waits for R2.
// - queue: a page past its revalidate time is re-rendered once, in the background, by the
//   Durable Object bound as NEXT_CACHE_DO_QUEUE; visitors get the cached copy meanwhile.
// - enableCacheInterception: a cached page is answered before the Next server loads, so a
//   cache hit costs a few milliseconds of CPU, not a render.
// No tag cache: the pages router's res.revalidate (pages/api/release-refresh.ts) re-renders a
// path through WORKER_SELF_REFERENCE and writes the result to the cache; tags are for the app router.
export default defineCloudflareConfig({
  incrementalCache: regionalPageCache(r2IncrementalCache),
  queue: doQueue,
  enableCacheInterception: true,
});
