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
npm run audit:styles
npm run check:assets
npm run build
```

The lint warning ceiling preserves existing warnings. Do not raise it to accommodate new warnings. `npm run audit:styles` is a CI gate: a ratchet over style drift (rarity literals, the pre-token teal, pill radii, h1 overrides, unloaded font weights, native selects and hand-built listboxes) against `scripts/audits/style-audit-baseline.json`. It fails on anything new and on a fixed entry left in the baseline; it is not a substitute for the rendered-class check. UI work follows [UI primitives and tokens](ui-primitives.md), which also documents the page-bounds ratchet in the browser tests.

## Deploy

Changes go to `dev` first and reach `main` through a throwaway `release/*` branch (see [How a change ships](../../README.md#how-a-change-ships)); never open a pull request from `dev` itself, which the repository would delete on merge.

Deploys come from CI. `main` is www.arkpedia.net and `dev` is arkpedia-dev.vercel.app (`config/production.json`). After a green Check of a push to either branch, `.github/workflows/deploy.yml` builds that commit on the runner and uploads the prebuilt output to every live deployment following it, one after another, each with its own project's settings and the token its `tokenSecret` names. Actions → Deploy → Run workflow on a branch redeploys it without a commit. The content release gate asks only `main`'s deployments, since the release job compiles with `main`; the dev site runs whatever `dev` holds. A deployment listed with `"live": false` gets nothing automatically; a manual run with **preview** ticked uploads a preview to it, which moves none of its domains. `vercel.json` turns Vercel's own Git deployments off (`git.deploymentEnabled: false`): they build without the Check and cannot say which commit they are, so the `ignoreCommand` below no longer runs anywhere.

Vercel builds with `npm run build`. Configure `DATABASE_URL` only if the submission API is needed. `vercel.json` uses `scripts/deploy/vercel-ignore-build.sh`: production builds run; branch previews need `[preview]` in the commit message, or an explicit manual deployment.

A build reads the checked-in game records and emits JSON under `public/`. Media stays in the public asset repositories and is delivered through the redirects in `next.config.js`.

For a manual production deployment, use:

```sh
npm run deploy:vercel
```

The script builds a production Build Output bundle and uploads it as a compressed archive. The generated site contains thousands of prerendered pages and symlinked ISR entries; a regular prebuilt upload expands those entries before transfer and can exceed Vercel's 15,000-file direct-upload limit. The archive is Vercel's supported upload path for this output shape. Before uploading, the script removes invalid server-function mappings to ignored development files and generated public files that already live in Vercel's static output. It does not delete the static files themselves.
