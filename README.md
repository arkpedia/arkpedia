# Arkpedia

Arknights reference pages, operator, skin and pull planners, a Global account import, recruitment, music, and guessing games. Built with Next.js (Pages Router), React and TypeScript.

| Site | Branch | Deployed by |
| --- | --- | --- |
| [www.arkpedia.net](https://www.arkpedia.net) | `main` | `.github/workflows/deploy.yml`, after a green Check |
| [arkpedia-dev.vercel.app](https://arkpedia-dev.vercel.app) | preserved legacy `dev` | the same workflow, after a green Check; not the default for new work |

Both are listed in `config/production.json`. Vercel's own Git deployments are switched off (`vercel.json`): every deployment is built in CI from a commit that passed Check.

## Start here

- [Repository map](docs/repository-map.md): where each feature lives and which public repository owns its data and media.
- [Development guide](docs/development/setup.md): setup, validation and deployment.
- [Design system](docs/development/design-system.md): the visual language and page patterns every UI change follows.
- [Runtime content](docs/development/runtime-content.md): how game data reaches the site without a redeploy.
- [Data pipelines](docs/development/data-pipelines.md) and [automation](docs/development/automation.md): the nightly refresh, asset syncs and CI.
- [Data catalogue](data/README.md), [tooling guide](scripts/README.md), [documentation index](docs/README.md).

## How a change ships

1. **Branch from `main` and work locally.** Use focused checks during iteration. Open a short-lived feature PR into `main`; draft feedback does not build or establish browser proof.
2. **Mark ready and verify Check.** The current impact policy selects relevant browser journeys and falls back to broader coverage for unknown/shared changes. A selected run is not full-suite proof. Follow the design/UX guidance for affected desktop/mobile and dark/light journeys.
3. **Request one explicit Cloudflare preview when ready.** The trusted-main preview controller accepts a successful exact-source Check, builds the isolated configuration and publishes its verified artifact. Verify the actual deployed journey. See [Cloudflare staging](docs/development/cloudflare-staging.md).
4. **Merge the accepted PR into `main`.** A successful main Check releases public Vercel production and the existing Cloudflare pilot through its checked-main owner. Native pilot Git builds are disabled. See [the checked-main pilot release](docs/development/cloudflare-pilot-release.md) for fixed resources, scoped credentials, ownership and recovery. Public-domain cutover remains separate.

The agreed target is one application codebase, not permanent `dev` and `cloudflare`
mirrors. Those branches currently preserve unreleased features and historical pilot
source. Review their net changes individually; do not merge
them wholesale or delete them before the [simplification plan](docs/development/system-simplification-plan.md)
gates pass. Keep Vercel serving www until Cloudflare parity, costs, soak and rollback
are accepted, then handle public-domain cutover separately.

Legacy synchronization workflows are still configured during preservation. Their
conflicts fail closed and leave the branch unchanged; do not force a sync over
unreleased work merely to remove a behind count. [Branch synchronization](docs/development/branch-sync.md)
documents that legacy recovery path, not the default feature release workflow.
Never use a permanent integration branch as a disposable PR head.

Branch protection is not available on this plan, so the rule is a convention: merge only after Check passes. A change to nothing but `docs/**` or Markdown skips Check and deploys nothing (`config/docs-only-paths.json`).

## Game data and media: no redeploy

The site's game records are not part of the deployment. The nightly **Prepare content release** workflow (`.github/workflows/prepare-content.yml`) does the following:
- refreshes the records from the game's tables and the public mirrors;
- compiles every content page against them;
- pushes the result to [arkpedia-data](https://github.com/arkpedia/arkpedia-data).

That repository validates the push and moves its `live` pointer. Deployed pages pick up the new release on their next revalidation. Images and voices are served straight from the public asset repositories, pinned to the commits each release names (`data/assets/revisions.json`).

A new operator, event, banner, outfit or stage therefore needs no deployment. A new page, a changed calculation, or a changed content schema does. See [runtime content](docs/development/runtime-content.md).

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

Game images and voices load from the public Arkpedia asset repositories, so no media download is needed. No database is required; the retired survey's published results are static records.

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

CI, the self-hosted runner, asset refreshes, deployment pins and free-tier limits: [Automation](docs/development/automation.md).
