# Development and deployment

## Run locally

Run commands from the repository root. Check uses Node.js 22; the NAS deployment build and hosted functions use Node.js 24:

```sh
npm ci
npm run dev
```

Next starts at http://localhost:3000 by default; use `npm run dev -- -p 3180` for another port. The predev step generates enemy, stage, and stage-guesser JSON. Images and audio use the public Arkpedia asset repositories, so normal development does not need media downloads.

The survey submission backend is retired. Reference pages and closed poll results need no database. `.env.example` lists optional development and runtime-content settings; never commit local secrets or raw survey responses.

Python import/review tools require Python 3 with Pillow, certifi and lz4==4.4.5. Upstream refresh tools use Git and network access. See [tooling](../../scripts/README.md) and [data pipelines](data-pipelines.md).

## Validation

```sh
python3 -m pip install -r scripts/requirements.txt
npm run check:local
```

`check:local` runs typechecking, every application/Python test, lint, both style audits and unused-code analysis. It performs no Next build or browser run. Use the CI workflow for both build modes and complete browser/content-runtime checks.

The lint warning ceiling preserves existing warnings. Do not raise it to accommodate new warnings. `npm run audit:styles` is a CI gate: a ratchet over style drift (rarity literals, the pre-token teal, pill radii, h1 overrides, unloaded font weights, native selects and hand-built listboxes) against `scripts/audits/style-audit-baseline.json`. It fails on anything new and on a fixed entry left in the baseline; it is not a substitute for the rendered-class check. UI work follows [UI primitives and tokens](ui-primitives.md), which also documents the page-bounds ratchet in the browser tests.

## Deploy

Changes go to `dev` first and reach `main` through a throwaway `release/*` branch (see [How a change ships](../../README.md#how-a-change-ships)); never open a pull request from `dev` itself, which the repository would delete on merge.

Deploys come from CI. `main` is www.arkpedia.net and `dev` is arkpedia-dev.vercel.app (`config/production.json`). After a green Check of a push to either branch, `.github/workflows/deploy.yml` builds that commit on the runner and uploads the prebuilt output to every live deployment following it, one after another, each with its own project's settings and the token its `tokenSecret` names. Actions → Deploy → Run workflow on a branch redeploys it without a commit. The content release gate asks only `main`'s deployments, since the release job compiles with `main`; the dev site runs whatever `dev` holds. A deployment listed with `"live": false` gets nothing automatically; a manual run with **preview** ticked uploads a preview to it, which moves none of its domains. `vercel.json` turns Vercel's own Git deployments off (`git.deploymentEnabled: false`): they build without the Check and cannot say which commit they are, so the `ignoreCommand` below no longer runs anywhere.

Vercel Git builds are disconnected and disabled. CI runs `vercel build` on the NAS with the selected project's settings, validates the prebuilt output, and uploads it. [`ci-runner.md`](ci-runner.md) describes runner routing and the checks that precede publication.

A build reads the checked-in game records and emits JSON under `public/`. Media stays in the public asset repositories and is delivered through the redirects in `next.config.js`.

For a manual production deployment, use:

```sh
npm run deploy:vercel
```

The script dispatches the NAS Deploy workflow for the current `main` or `dev` branch; it performs no local build. Set `DEPLOY_BRANCH=dev` to select dev explicitly. Follow the run in Actions and verify the deployed build identity and served result. A manual dispatch trusts the operator, so run the appropriate checks first.
