# Native delivery for compiled site assets

The route `www.arkpedia.net/_next/static/*` targets the existing application `arkpedia`
directly. Cloudflare checks its native assets before invoking application code. This skips
the billable `arkpedia-edge` invocation for matching JavaScript, CSS and bundled fonts.
It does not introduce a second asset release: the files stay attached to the checked-main
application version and change with its normal release/rollback.

Only this prefix on the canonical hostname is covered. HTML, Next page data, image processing,
account APIs and the apex redirect retain their existing routing. Preview keeps its isolated
upstream; routing Preview to the production application would serve the wrong build.
`assets.arkpedia.net` and its R2 delivery are outside this change.

## Verify and apply

Use a credential with Workers script read and zone Workers Routes write permissions via
`CLOUDFLARE_API_TOKEN`. Do not store credentials in snapshots or the repository.

```sh
node scripts/deploy/static-asset-routes.mjs plan
# Optional canary: pass one CURRENT /_next/static/...css or .js path as argument 3.
node scripts/deploy/static-asset-routes.mjs apply /private/tmp/static-route-canary.json /_next/static/css/CURRENT.css
node scripts/deploy/static-asset-routes.mjs rollback /private/tmp/static-route-canary.json
node scripts/deploy/static-asset-routes.mjs apply /private/tmp/static-route-release.json
```

The command refuses application versions without native asset-first delivery, conflicting
route ownership and unexpected more-specific static routes. It compares current homepage
assets before/after with GET, query strings, HEAD and byte ranges, including body hashes and
relevant response headers. A mismatch removes the newly created route. A timestamped local
snapshot records the application version, prior routes and probes. Keep it for recovery.

After propagation, inspect the provider's route inventory and check the actual browser:
home → operator page, account/login/import dialogs, desktop and mobile. Check anonymous account
API responses still use `private, no-store`, missing assets return 404, apex redirects remain
canonical, and Preview's build identity is unchanged. Run `npm run release:status`.
HTTP 200 or a missing `x-arkpedia-edge` header alone is not proof of bypass: the front Worker
also omits that header for pass-through files. Verify the more-specific route and deployed
`resources.script_runtime.assets` (`serve_directly: true`, `raw_run_worker_first: false`).

## Recovery and ownership

```sh
node scripts/deploy/static-asset-routes.mjs rollback /private/tmp/static-route-release.json
```

Recovery deletes only the recorded route if its ID, pattern and destination still match.
The canonical catch-all remains in place and resumes handling those files. No application
rollback, DNS change, cache purge, credential change or database restore is needed.
For interrupted creation with a lost response, inspect the exact route and snapshot before
removing anything; never delete routes by a broad pattern.

Keep this route separate from `workers/edge/wrangler.jsonc`, whose routes all belong to the
front Worker. Application `wrangler.jsonc` intentionally has no `routes` field. Wrangler's
normal deploy preserves externally managed routes when no routes are specified; changing
that convention requires including this route and reviewing deployment credential scopes.

## Evidence, 2026-11-03

- Production application: `f53b3c4b-b8cc-49ec-a094-0257b6f23376`, source `874f8b8dcbac81c9f1d1a481cb5f67355b9bf456`.
- Native runtime: `serve_directly: true`, `raw_run_worker_first: false`.
- One-file canary passed four probes and was removed before widening.
- Full-prefix route ID: `0b7497cd693149198bafc388496d16e5`.
- 14 current homepage assets passed 56 GET/query/HEAD/range comparisons.
- Account/login/import browser checks passed on desktop/mobile in light/dark themes.
- Anonymous session: 200; cloud-account: 401; both private/no-store. Missing static file: 404;
  apex: 308; Preview build endpoint: 200. Release status remained healthy.

Matching native asset requests are free under [Cloudflare's static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).
Missing files can still invoke application code. This evidence establishes the routing
change, not a measured reduction in the total bill. The previously quoted 67% is unverified.
Collect comparable before/after request totals and traffic before claiming a savings figure.
