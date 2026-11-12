# The site's front Worker

A small front Worker on `www.arkpedia.net`, with `SITE` bound to the production application `arkpedia`.
It also redirects the apex and forwards `preview.arkpedia.net` to the isolated native Preview.
The canonical `/_next/static/*` route goes directly to the application's native asset handler;
it does not invoke this front Worker. See [static routing](../../docs/development/static-asset-routing.md).
It answers pages from Cloudflare's cache in the data centre the reader reached. The site Worker
runs only on a miss, or in the background to refresh a stale copy.

**Why:** the site Worker's script is about 20 MB, and a new isolate loads all of it before it
answers. At this site's traffic most machines in a data centre have no warm copy, so 30–40% of
loads met a start-up of 0.4–0.9 s, at random (measured 2026-10-23, see
docs/development/cloudflare-workers.md). Cloudflare starts a Worker this small during the TLS
handshake, so a cached page costs no start-up at all.

## What it does

For a GET or HEAD of a page, or of a page's data (`/_next/data/<build>/….json`):

1. **Fresh copy:** answered. A copy is fresh for the `s-maxage` the site Worker sent with it, or
   `max-age` when there is none. OpenNext sends the time left before the page's revalidate, and
   `s-maxage=1` for a page it is already re-rendering.
2. **Stale copy:** answered, and refreshed in the background through the binding. A copy is kept
   while the site's `stale-while-revalidate` allows, for a day at most. Readers of a stale page
   in one isolate share one refresh. Readers on other machines in the data centre start their
   own, so at this traffic most stale views still cost the site Worker one background call.
3. **No copy:** the site Worker answers, and its response is kept if it may be.
4. **A copy from a build no longer deployed:** treated as missing. Its HTML names script and style
   files the new deploy doesn't have. The front Worker asks the site Worker's static files for
   `/_next/static/<build>/_buildManifest.js`, and trusts the answer for 10 s per isolate.
   - For the live build, the assets answer without starting the site Worker.
   - For a gone build, the request falls through to the site Worker's 404 page (about 0.25 s of
     CPU there), once per isolate. So right after a deploy, each page's first reader in an isolate
     pays for that check and for the miss.

It never keeps a response that is not a 200, sets a cookie, or is marked `private`, `no-store` or
`no-cache`. It also never keeps a page whose build it can't tell.

**Straight through, never cached:** every other method; `/api/*` (the account routes among
them); `/account`; `/_next/image`; `/_next/static/*`; `/cdn-cgi/*`; any file (a path ending in an
extension); and requests with `Authorization`, `Range`, `Upgrade` or Next's preview-mode cookies.

**HEAD** reads the GET's copy and gets the headers alone. A HEAD that misses goes to the site
Worker and fills nothing.

**Conditional requests:** a miss or refresh asks the site Worker without the reader's
`If-None-Match`/`If-Modified-Since`, so the cache gets a whole 200. The reader's condition is
answered here: a 304 when the copy's `ETag` (page data has one, HTML doesn't) or `Last-Modified`
still matches.

**What the reader gets** is the site Worker's response as it sent it. Its headers come back
unchanged: `Cache-Control`, `Vary`, `X-Robots-Tag` and the security headers. On top come an `Age`
and `x-arkpedia-edge`: `HIT`, `STALE`, `MISS` (kept) or `PASS` (not kept). What the cache keeps
differs in two ways:
- `Vary` is left out. The Cache API can't ignore it, and the pages router never varies on the RSC
  headers Next lists.
- `Cache-Control` becomes the time to keep the copy. The Cache API honours neither
  `stale-while-revalidate` nor `s-maxage`'s meaning here.

The site Worker's own requests from here carry `x-arkpedia-edge: miss` or `refresh`, so
`wrangler tail arkpedia` tells them apart.

## Files

| File | What it does |
|---|---|
| `edge.mjs` | Every decision above, with no Cloudflare imports, so the site's tests run it in Node (`scripts/tests/test-edge-worker.ts`). |
| `worker.mjs` | The Worker: hands `edge.mjs` `caches.default` and the `SITE` binding. |
| `wrangler.jsonc` | The Worker `arkpedia-edge`: canonical, apex and Preview catch-all routes, and the production `SITE` binding. The more-specific static route is managed separately. It has no workers.dev address. |

## Deployment ownership and routing

The application is owned by the checked-main release workflow. The edge Worker and the
more-specific static route are explicit infrastructure operations, not application releases.
Do not add a second build owner or change the production source branch.

The production static route is `www.arkpedia.net/_next/static/*` → `arkpedia`.
Matching files use native asset-first serving. Missing files fall through to the application,
so missing-file responses can still invoke it. Other paths keep the catch-all `arkpedia-edge`
route. Preview retains its isolated upstream and must not receive this production route.

Keep the static route out of this edge Worker's Wrangler routes: those entries all point to
`arkpedia-edge`. It is managed with `scripts/deploy/static-asset-routes.mjs`; see the linked
runbook for preflight, verification and rollback. Application Wrangler has no routes field;
normal application deploys preserve this separately managed route. If that changes, review
routing ownership before deployment.

Do **not** install a no-script exclusion: the live inventory on 2026-11-03 showed no application
Custom Domain beneath the front router. Do not remove the canonical catch-all as a rollback.
Rollback of this optimization removes only the recorded static route, restoring the previous
front-router → SITE path without changing application versions, DNS or stored data.

**Cost evidence:** native matching assets avoid the front Worker invocation; caching inside
that Worker still invokes it. This does not establish a percentage reduction in the total
bill. Compare Worker requests and charges over comparable traffic windows. R2 custom-domain
delivery remains a separate migration.

**Emptying the cache:** nothing needs to. A deploy turns the old build's pages into misses. A
content release reaches a data centre's copy once it is stale (after the page's revalidate time,
60 or 300 s) and the next reader has started its refresh. `cache.delete` can only empty one data
centre anyway.
