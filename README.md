# Arkpedia

Arknights reference pages, operator, skin and pull planners, a Global account import, recruitment, music, and guessing games. Built with Next.js (Pages Router), React and TypeScript.

| Site | Branch | Deployed by |
| --- | --- | --- |
| [www.arkpedia.net](https://www.arkpedia.net) | `main` | checked-main Cloudflare application release |
| [Arkpedia Preview](https://preview.arkpedia.net) | explicit reviewed feature source | isolated native Worker Preview |

Cloudflare serves www; the apex redirects to www. Vercel hosting and its rollback role are retired; recovery uses retained Cloudflare Worker versions. See [retirement and recovery](docs/development/vercel-retirement.md). Production readers are listed in `config/production.json`; native Preview has its own isolated publication workflow. Vercel's own Git deployments are switched off (`vercel.json`): every deployment is built in CI from a commit that passed Check.

Google/Discord accounts and cloud saves are available on the live site. Local
imports and planner data also work without signing in. Preview uses separate
accounts and storage.

## Start here

- [Repository map](docs/repository-map.md): where each feature lives and which public repository owns its data and media.
- [Development guide](docs/development/setup.md): setup, validation and deployment.
- [Design system](docs/development/design-system.md): the visual language and page patterns every UI change follows.
- [Runtime content](docs/development/runtime-content.md): how game data reaches the site without a redeploy.
- [Data pipelines](docs/development/data-pipelines.md) and [automation](docs/development/automation.md): the nightly refresh, asset syncs and CI.
- [Data catalogue](https://github.com/arkpedia/arkpedia-data/blob/main/docs/catalogue.md), [tooling guide](scripts/README.md), [documentation index](docs/README.md).

## How a change ships

1. **Branch from `main` and work locally.** Use focused checks during iteration. Open a short-lived feature PR into `main`; draft feedback does not build or establish browser proof.
2. **Mark ready and verify Check.** The current impact policy selects relevant browser journeys and falls back to broader coverage for unknown/shared changes. A selected run is not full-suite proof. Follow the design/UX guidance for affected desktop/mobile and dark/light journeys.
3. **Publish an explicit native Cloudflare Preview when ready.** The Preview workflow builds an immutable redesign source and publishes only the isolated native Preview. Verify the actual deployed journey. See [Native Preview](docs/development/native-preview.md).
4. **Merge the accepted PR into `main`.** A successful main Check releases the public Cloudflare application through its checked-main owner without publishing to Vercel. Native pilot Git builds are disabled. See [the checked-main pilot release](docs/development/production-release.md) for fixed resources, scoped credentials, ownership and recovery. See [the cutover record](docs/development/cloudflare-cutover.md) for routing and acceptance.

The dev branch, Vercel dev deployment and dev content publisher are retired. All
unreleased work, including the base simulator/optimizer, remains in the pushed
`archive/legacy-dev-2026-10-26` tag. Extract those features individually into
main-based PRs; native Worker Previews replace the old dev site. See
[the retirement record](docs/development/branch-sync.md) for preserved refs.

The cloudflare branch still preserves historical unreleased work; do not merge or
retire it wholesale. Use retained Cloudflare versions for production recovery.
Never use a permanent branch as a disposable PR head.

Merge only after the required checks pass and the change has been reviewed. A change to nothing but `docs/**` or Markdown skips Check and deploys nothing (`config/docs-only-paths.json`).

## Game data and media: no redeploy

The site's game records are not part of the deployment. [arkpedia-data](https://github.com/arkpedia/arkpedia-data) refreshes them from the game's tables and the public mirrors in its own nightly **Import game records** workflow (its `importer/`, `docs/importer.md`) and leaves them on its `imports` branch. The nightly **Prepare content release** workflow here (`.github/workflows/prepare-content.yml`) then does the following:
- runs the few refresh steps that stay in this repository (the EN tables, the story chapters and covers, the pull sources and first clears);
- compiles every content page against the imported records;
- pushes the result to arkpedia-data.

That repository validates the push and moves its `live` pointer. Deployed pages pick up the new release on their next revalidation. Images and voices are served straight from the public asset repositories, pinned to the commits each release names (`data/assets/revisions.json`).

A new operator, event, banner, outfit or stage therefore needs no deployment. A new page, a changed calculation, or a changed content schema does. See [runtime content](docs/development/runtime-content.md).

**This repository keeps code only.** `data/` and the `public/*.json` records are not committed: Check, every build and local dev pull them from the live release (`npm run data:pull`, `scripts/content/pull-data.mjs`). A feature that needs a new or changed record lands it in arkpedia-data first (its `editorial` branch, or a pull request there), and the code that reads it second.

## Account import

The Account page signs a reader in to their Arknights (Global) account and reads it entirely in their browser. The browser speaks TLS to Yostar's servers itself, through the [arkpedia-relay](https://github.com/arkpedia/arkpedia-relay) WebSocket relay, which only forwards encrypted bytes. Its address is `config/relay.json`.

The imported account is kept only in the reader's browser storage. It feeds:
- the profile card;
- the owned filters;
- the Operator, Skin and Pull planners;
- the base planner.

## Local development

Use Node.js 22.12 or newer; deployment builds and hosted functions use Node.js 24. From the repository root:

```sh
npm ci
npm run dev
```

`npm run dev`, `npm run build` and `npm test` pull the game records from arkpedia-data's live release the first time (about 20 s). `npm run data:pull` refreshes them, and `npm run data:pull -- --ref <branch or commit>` reads other data, such as an `editorial` change before it is published. Game images and voices load from the public Arkpedia asset repositories, so no media download is needed. No database is required; the closed power-scale poll's results are a published record (`data/polls/`).

## Verify a change

```sh
npm run typecheck
npm test
npm run lint -- --max-warnings 15
npm run check:styles        # every rendered class is styled
npm run audit:styles        # no new style drift against the baseline
npm run check:assets
npm run build
```

- **New or changed content page:** also run `npm run content:export && npm run content:validate`. That is the export the nightly release runs.
- **New art:** after publishing it to an asset repository, run `npm run assets:update`. A new top-level folder also needs `config/asset-folders.json`.

`predev` and `prebuild` generate the JSON delivery files under `public/`. Do not commit generated media, build output, credentials or upstream caches.

See [Contributing](CONTRIBUTING.md), [Security](SECURITY.md) and [Code and content rights](RIGHTS.md).
