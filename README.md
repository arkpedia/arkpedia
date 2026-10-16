# Arkpedia

Arknights reference pages, operator, skin and pull planners, a Global account import, recruitment, music, and guessing games. Built with Next.js (Pages Router), React and TypeScript.

| Site | Branch | Deployed by |
| --- | --- | --- |
| [www.arkpedia.net](https://www.arkpedia.net) | `main` | `.github/workflows/deploy.yml`, after a green Check |
| [arkpedia-dev.vercel.app](https://arkpedia-dev.vercel.app) | `dev` | the same workflow, after a green Check |

Both are listed in `config/production.json`. Vercel's own Git deployments are switched off (`vercel.json`): every deployment is built in CI from a commit that passed Check.

## Start here

- [Repository map](docs/repository-map.md): where each feature lives and which public repository owns its data and media.
- [Development guide](docs/development/setup.md): setup, validation and deployment.
- [Runtime content](docs/development/runtime-content.md): how game data reaches the site without a redeploy.
- [Data pipelines](docs/development/data-pipelines.md) and [automation](docs/development/automation.md): the nightly refresh, asset syncs and CI.
- [Data catalogue](data/README.md), [tooling guide](scripts/README.md), [documentation index](docs/README.md).

## How a change ships

1. **Branch from `dev`** and open a pull request into `dev`. Check (`.github/workflows/check.yml`) runs the tests, the style and asset audits, a production build and the browser tests.
2. **Merge into `dev`** once Check is green. The dev site deploys that commit.
3. **Release to `main`** from a throwaway `release/*` branch cut from `dev`, in a pull request into `main`. Never open a pull request from `dev` itself: the repository deletes merged head branches, and that would delete `dev`. A green Check on `main` deploys www.arkpedia.net.

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

Game images and voices load from the public Arkpedia asset repositories, so no media download is needed. A database is only needed for survey submission; see the [development guide](docs/development/setup.md).

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
