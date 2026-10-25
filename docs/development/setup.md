# Development and deployment

## Run locally

Run commands from the repository root. Check uses Node.js 22; the NAS deployment build and hosted functions use Node.js 24:

```sh
npm ci
npm run dev
```

Next starts at http://localhost:3000 by default; use `npm run dev -- -p 3180` for another port. The predev step generates enemy/stage details, stage-guesser, operator-search, music and selector payloads using finite-process loader caches. Next itself still starts in development mode. Images and audio use the public Arkpedia asset repositories, so normal development does not need media downloads.

The survey submission backend is retired. Reference pages and closed poll results need no database. `.env.example` lists optional development and runtime-content settings; never commit local secrets or raw survey responses.

`/dev` provides read-only base-skill extraction and links to the local optimizers and UI catalogue. Edit game records in `arkpedia-data/source/` and publish artwork through its asset repository; the application no longer has copied-data editors or uploads. Optimizer runs save under `.cache/optimizers/`, with a backup of the previous result. A first read imports a legacy local result from `data/` without altering that original. These tools and APIs return 404 outside development. An optional `DEV_CONSOLE_PASSCODE` protects optimizer writes; reading local results needs no write passcode.

Python import/review tools require Python 3 with Pillow, certifi and lz4==4.4.5. Upstream refresh tools use Git and network access. See [tooling](../../scripts/README.md) and [data pipelines](data-pipelines.md).

Server clock, daily reset and regional account behavior follow the [shared timekeeping policy](timekeeping.md).

## Validation

```sh
python3 -m pip install -r scripts/requirements.txt
npm run check:local
```

`check:local` runs typechecking, every application/Python test, application and pipeline-script lint, both style audits and unused-code analysis. It performs no Next build or browser run. Use the CI workflow for both build modes and complete browser/content-runtime checks.

The lint warning ceiling preserves existing warnings. Do not raise it to accommodate new warnings. `npm run audit:styles` is a CI gate: a ratchet over style drift (rarity literals, the pre-token teal, pill radii, h1 overrides, unloaded font weights, native selects and hand-built listboxes) against `scripts/audits/style-audit-baseline.json`. It fails on anything new and on a fixed entry left in the baseline; it is not a substitute for the rendered-class check. UI work follows [UI primitives and tokens](ui-primitives.md), which also documents the page-bounds ratchet in the browser tests.

## Deploy

New changes branch from `main`, develop locally and use short-lived PRs into `main`.
Run focused local checks while iterating, then the ready PR's selected/full Check
and an explicit checked-source Cloudflare preview. Verify the deployed journey
before merging; see [How a change ships](../../README.md#how-a-change-ships).
Do not use `main`, `dev` or another permanent branch as a disposable PR head.

Vercel deploys come from CI. `main` is www.arkpedia.net; the preserved legacy `dev`
deployment is arkpedia-dev.vercel.app (`config/production.json`). The existing
`.github/workflows/deploy.yml` builds checked source and uploads the prebuilt
output with each project's settings and named secret. Legacy deployment/sync
controls remain available for recovery while their retirement gates are open;
they are not the normal destination for new feature work.

Content publication waits for the configured main readers. The checked-main
Cloudflare release owner registers the pilot in that gate; it must
not receive newer data while serving older code merely because both use schema2.
The checked-main owner is active after PR775's first controlled release and account
continuity acceptance. Native pilot builds are disabled; its scoped token targets
only the existing Worker. Follow [pilot release and recovery](cloudflare-pilot-release.md).
Old-client navigation currently upgrades/reloads the document; seamless continuity
and public cutover remain separate gates.
The isolated feature preview controller is already active and is a separate path.

For the legacy Vercel workflow, a target with `"live": false` is not updated
automatically; a manual preview upload moves none of its production domains.
`vercel.json` disables Vercel's own Git deployments. Keep public production there
until the plan's Cloudflare parity, cost/soak and public-domain rollback gates pass.

Vercel Git builds are disconnected and disabled. CI runs `vercel build` on the NAS with the selected project's settings, validates the prebuilt output, and uploads it. [`ci-runner.md`](ci-runner.md) describes runner routing and the checks that precede publication.

A build reads the checked-in game records and emits JSON under `public/`. Media stays in the public asset repositories and is delivered through the redirects in `next.config.js`.

For a manual production deployment, use:

```sh
npm run deploy:vercel
```

The script dispatches the NAS Deploy workflow for the current `main` or `dev` branch; it performs no local build. Set `DEPLOY_BRANCH=dev` to select dev explicitly. Follow the run in Actions and verify the deployed build identity and served result. A manual dispatch trusts the operator, so run the appropriate checks first.
