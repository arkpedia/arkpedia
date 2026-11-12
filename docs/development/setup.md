# Development and deployment

## Run locally

Run commands from the repository root. Use Node.js 22.12 or newer for local development; deployment builds use Node.js 24:

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

## Submit a change

Branch from `main` and open a focused pull request. Include the problem, resulting
behavior and validation. For UI work, check desktop/mobile and dark/light themes.
See [Contributing](../../CONTRIBUTING.md).

Production and Preview are separate Cloudflare deployments. Game records and media
are maintained in their own repositories; changes to those records should land
there before application code depends on them. Deployment remains a maintainer
action.
