# Development and deployment

## Run locally

Use Node.js 20 or newer and run commands from the repository root:

```sh
npm ci
npm run dev
```

Next starts at http://localhost:3000 by default; use `npm run dev -- -p 3180` for another port. The predev step generates enemy, stage, and stage-guesser JSON. Images and audio use the public Arkpedia asset repositories, so normal development does not need media downloads.

Survey submission requires Postgres: copy `.env.example` to `.env.local`, set `DATABASE_URL`, and apply `database/schema.sql`. Reference pages and static poll results do not need the database. Never commit `.env.local` or publish raw survey data.

Python import/review tools require Python 3 with Pillow and certifi. Upstream refresh tools use Git and network access. See [tooling](../../scripts/README.md) and [data pipelines](data-pipelines.md).

## Validation

```sh
npm run typecheck
npm test
npm run lint -- --max-warnings 15
npm run check:styles
npm run check:assets
npm run build
```

The lint warning ceiling preserves existing warnings. Do not raise it to accommodate new warnings. `npm run audit:styles` is a separate historical style-ratchet report; it is not a substitute for the rendered-class check.

## Deploy

Vercel builds with `npm run build`. Configure `DATABASE_URL` only if the submission API is needed. `vercel.json` uses `scripts/deploy/vercel-ignore-build.sh`: production builds run; branch previews need `[preview]` in the commit message, or an explicit manual deployment.

A build reads the checked-in game records and emits JSON under `public/`. Media stays in the public asset repositories and is delivered through the redirects in `next.config.js`.
