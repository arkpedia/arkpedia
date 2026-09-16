# Runtime game content

The website reads reviewed game records from the public [arkpedia-data repository](https://github.com/arkpedia/arkpedia-data). Its `live/current.json` pointer selects an immutable, validated commit. Operators, stages, banners, schedules, skins, recruitment and the supported game catalogues can update without a website deployment.

## Update flow

1. `Prepare content release` runs daily at 15:47 UTC, or manually. It loads public source records, optionally refreshes supported upstream importers, then compiles page JSON without running a Next.js build.
2. A deploy key scoped only to arkpedia-data pushes `refresh/content`. That public repository validates the files and opens a review PR.
3. Merging the PR publishes its immutable commit through the `live` pointer. Existing website pages adopt it during background revalidation; newly added operator, event and stage-content URLs generate on demand.

The pointer is cached for 60 seconds and most pages revalidate after 60 seconds. GitHub caching and request-driven regeneration can add delay. The homepage retains its 25-minute community refresh interval. An already-open page retains its release so interactions do not mix versions or shift the UI.

## Corrections and rollback

Edit `source/` in a public data branch, then run the private preparation workflow with that branch as `data_ref` and `refresh_upstream=false`. Generated `release/` files must match the source checksums. The public release workflow can publish an earlier approved main-branch commit to roll back. It never approves or merges a PR.

Existing upstream scripts do not supply every new operator editorial entry automatically. Complete new operator records still need a supported importer or a reviewed source addition. New mechanics, layouts, calculations, or incompatible content schemas require a website deployment.

## Local verification

- `npm run content:export` prepares `.cache/content-export` (ignored).
- `npm run content:validate` verifies source/output inventories and checksums.
- `ARKPEDIA_CONTENT_DISABLED=1 NODE_ENV=production npm run build` builds the bundled fallback.
- `npm run test:content-runtime` verifies changed and new records, desktop/mobile bounds, rollback and unavailable-release fallback against that same build.

`ARKPEDIA_CONTENT_URL` overrides the public repository root. `ARKPEDIA_CONTENT_DISABLED=1` explicitly uses bundled records. Local HTTP test servers require `ARKPEDIA_CONTENT_TEST=1`; never set that on a deployment. Only page JSON and game records are published: compiled application code remains private.

## Free-tier operation

Public validation uses standard GitHub-hosted Linux runners. Private preparation uses the existing included Actions allowance with a 20-minute timeout and no website build. Keep the organization spending caps at zero. Changes to application code still need a deployment; publishing a data release does not invoke Vercel.

## Event and banner times

Store confirmed opening and closing instants as timezone-qualified ISO strings:
`startAt` and `endAt` on an event's `global`/`cn` block, or a banner's
`global_window`/`cn_window`. `endAt` is exclusive; `timingSource` records the
announcement or game table URL. Keep the existing date ranges for calendar labels.
`npm run events:sync` preserves exact client times even if the dates did not change.
Date-only legacy entries use server-time estimates; confirmed hours always override
those estimates. The homepage countdown changes state in the browser at each boundary.
