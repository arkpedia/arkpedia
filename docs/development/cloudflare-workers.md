# Trying Arkpedia on Cloudflare Workers

The site builds for Cloudflare Workers through [OpenNext](https://opennext.js.org/cloudflare)
(`@opennextjs/cloudflare`), next to the Vercel deploy that serves www and arkpedia-dev today.
Nothing here changes those deploys: Vercel still gets its prebuilt output from `deploy.yml`.

## What the Worker build needs

- Next 16 and React 19 (this repo's versions), built with webpack: `npm run build` is
  `next build --webpack`, because the ClientDataGuard plugin in `next.config.js` is a webpack
  plugin and Next 16 builds with Turbopack by default.
- `output: 'standalone'` in `next.config.js`, which OpenNext reads.
- No code generated from strings at runtime: a Workers isolate refuses `new Function`/`eval`
  (lib/assets/githubRetry.mjs once compiled its retry rule that way;
  scripts/tests/test-asset-retry.ts now proves the written-out rule instead).
- `wrangler.jsonc`: the Worker `arkpedia`, `nodejs_compat`, and the static assets from
  `.open-next/assets`.

## Locally, no Cloudflare account needed

```bash
npm ci
npm run cf:preview
```

`cf:preview` builds the app (`npm run build`, which runs `prebuild` first), wraps it for Workers and serves it with `wrangler dev` (it prints
the local address, usually http://localhost:8787). Check a few routes: `/`, `/operators/Closure`,
`/schedule`, `/voice-actors`, `/api/gacha-operator/Closure`.

## A real Worker on your Cloudflare account

```bash
npx wrangler login
npm run cf:deploy
```

It deploys to `arkpedia.<your-subdomain>.workers.dev`. Nothing points arkpedia.net at it.

To give it the same settings as the Vercel deploy (content channel, API keys), set them as
Worker variables or secrets, for example `npx wrangler secret put YOUTUBE_API_KEY`. Without
them the pages still render; live feeds that need a key show their empty states.

## The page cache

Pages are cached in R2, as Vercel's ISR cache holds them for the Vercel deploys
(`open-next.config.ts`, `wrangler.jsonc`):

- **Incremental cache:** the R2 bucket `arkpedia-opennext-cache`, bound as
  `NEXT_INC_CACHE_R2_BUCKET`. Each deploy fills it with the build's prerendered pages.
  Create the bucket once, before the first deploy:
  `npx wrangler r2 bucket create arkpedia-opennext-cache`, or R2 > Create bucket in the dashboard.
- **Revalidation queue:** the Durable Object `DOQueueHandler`, bound as `NEXT_CACHE_DO_QUEUE`. A
  page past its revalidate time is re-rendered once, in the background.
- **Cache interception:** a cached page is answered before the Next server loads.
- **Release refresh:** `res.revalidate` (`pages/api/release-refresh.ts`) re-renders through the
  `WORKER_SELF_REFERENCE` service binding.

Workers Free allows 10 ms of CPU per request, and a page render takes far more (Error 1102,
2026-10-22). The Worker needs Workers Paid, where the default is 30 s.

## Branches (while the Cloudflare path is set up)

- `dev`: general features. They go to www through main as before, and to the Worker through
  `cloudflare`.
- `cloudflare`: `dev` plus the Cloudflare-only work (accounts, D1, Worker settings). The Worker's
  production branch in Workers Builds is `cloudflare`, and its Check runs like dev's. Vercel
  deploys nothing from it. Pull requests for Cloudflare-only work target `cloudflare`.
- `.github/workflows/sync-cloudflare.yml` merges every push to `dev` into `cloudflare`. A conflict
  fails that run and leaves `cloudflare` alone: merge `dev` in by hand and push. Never open a
  pull request from `dev`: merging it deletes `dev`.

## Which content it reads

A Worker built from `dev` reads `dev-live`, the release arkpedia-dev reads, and one built from
`main` reads `live`, www's; one built from `cloudflare` reads `dev-live` too.
`scripts/content/content-channel.cjs` takes the branch from
`WORKERS_CI_BRANCH`, which Workers Builds sets. `ARKPEDIA_CONTENT_CHANNEL` as a build variable
overrides it. Until 2026-10-22 the Worker built from dev read www's release.

## The account-import relay

The Worker's account import tunnels through a relay of its own on Cloudflare: the Worker
`arkpedia-relay`, a doorman in front of a container that runs the same Wisp relay as the VPS. Its
code, settings and deploy setup are in arkpedia/arkpedia-relay (`cloudflare/`), next to the VPS
relay's. A plain Worker can't be the relay: its `connect()` sockets may not open connections to
Cloudflare addresses, and the game's Global and JP servers are behind Cloudflare.

`config/relay.json` `cloudflare` decides which relay the Worker's pages use: its workers.dev page
and the domains in `hosts` (which the relay's `cloudflare.siteOrigins` must list too). `use: true`
makes it the Cloudflare relay at `url`. On those pages, `/account?relay=vps` (or
`?relay=cloudflare`) picks one for an import started from that page. www and arkpedia-dev always
use the VPS relay.

## Analytics

The Worker counts visits with Cloudflare Web Analytics (`components/layout/SiteAnalytics.tsx`): visits, page views, pages, referrers, countries and devices, with no cookie and no visitor id. It is free, so nothing is sampled. The beacon loads only in the Worker's own build of `cloudflare` (`WORKERS_CI_BRANCH`), and only once `config/web-analytics.json` holds the site's token from the dashboard (Analytics & Logs > Web Analytics). The numbers are in the same place. Vercel's analytics is gone from this branch; www keeps it until it moves.

## Known limits

- **Images** go through Next's default loader; Cloudflare Images is not set up.
- The site's content release, the asset repositories and the relay are on GitHub and the VPS
  as before; the Worker reads them the way the Vercel functions do.
