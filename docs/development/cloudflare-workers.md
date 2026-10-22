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

## Known limits of this first build

- **Incremental Static Regeneration has no shared cache yet.** `open-next.config.ts` uses the
  defaults, so a page regenerated in one isolate is not shared with the next. For a real
  deploy, configure an R2 incremental cache (and a queue for revalidation) as the OpenNext docs
  describe.
- **Images** go through Next's default loader; Cloudflare Images is not set up.
- The site's content release, the asset repositories and the relay are on GitHub and the VPS
  as before; the Worker reads them the way the Vercel functions do.
