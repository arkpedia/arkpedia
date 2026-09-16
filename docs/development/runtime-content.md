# Runtime game content

The website reads reviewed game records from the public [arkpedia-data repository](https://github.com/arkpedia/arkpedia-data). Its `live/current.json` pointer selects an immutable, validated commit. Operators, stages, banners, schedules, skins, recruitment and the supported game catalogues can update without a website deployment.

## Update flow

1. `Prepare content release` checks daily at 16:57 UTC (5h 57m after Global reset), or runs manually. Public artwork, image and voice syncs are staggered from 16:07 to 16:31 UTC first. The daily job compares upstream revisions and reuses a successful preparation when nothing changed, avoiding dependency installation and compilation on unchanged days. Manual runs always run. Changed inputs load public source records, refresh supported importers, then compile page JSON without running a Next.js build.
2. A deploy key scoped only to arkpedia-data pushes `refresh/content`. That public repository validates the files and opens a review PR.
3. Merging the PR publishes its immutable commit through the `live` pointer. Existing website pages adopt it during background revalidation; newly added operator, event and stage-content URLs generate on demand.

Daily checks are retained because patches, mirror uploads and corrections do not always arrive together. This is a post-reset check, not a hard-coded assumption that every patch opens four hours after reset. Late upstream uploads are picked up by the next check; GitHub may delay scheduled jobs. A release still needs its review PR merged.

The content refresh also imports English voice transcripts and replaces Chinese profile/archive fallbacks when the English game tables actually contain them. It preserves editorial reviews, existing English prose and ambiguous alternate-form archives. It never invents translations.

The pointer is cached for 60 seconds and most pages revalidate after 60 seconds. GitHub caching and request-driven regeneration can add delay. The homepage retains its 25-minute community refresh interval. An already-open page retains its release so interactions do not mix versions or shift the UI.

## Stable page records

Asset commit pins are stored once in the release manifest. Voice page data keeps
stable templates; playback resolves them against the page's release (or bundled
pins when remote content is unavailable). Older payloads with embedded pins remain
supported. Presentation clocks are omitted from exported records and supplied by
the server when rendering, with the existing browser clocks continuing to tick.
Timed stage candidates are selected in the browser, not by the export date.

An asset-only refresh should change `source/data/assets/revisions.json` and
`release/manifest.json`, without rewriting every operator page. The public PR
summary identifies asset-only updates and reports the actual file counts.

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

Timing source priority: use the official Arknights regional website or verified
regional social-account announcement first. Match the precise section: stage
availability, headhunting, and reward-shop windows can end on different dates.
An official notice stored in `timingSource` is retained when the mirrored client
tables disagree; the sync logs the discrepancy for review rather than overwriting
it. Review later official maintenance/correction notices when a schedule changes.
Use mirrored game tables only where no official timing has been recorded, and
keep date-only fallbacks documented as estimates. The mirrors are third-party
hosts, not official announcements.

Confirmed Global operator debuts belong in `data/operator-release-overrides.json`
with a timezone-qualified `startAt` and official `timingSource`. They override
stale scraped calendar dates, including event reward operators that are absent
from banners. Exported operator records carry the resolved `releaseAt`; badges
use that instant across timezones. Without a confirmed hour, the roster says
“Releases today” through the Global server's calendar day instead of declaring
availability at the reader's midnight.

## Recruitment accuracy

The calculator, pop-out and guesser use one reviewed Global roster in
`data/recruitment-global.json`. Its source records include immutable English game
table URLs and SHA-256 hashes. `node scripts/sync/sync-recruitment.mjs` prepares an
update during the existing daily refresh; a content PR still needs review before
publication. A mirrored game table can contain preloaded changes, so reviewers
must confirm that any new recruitment batch is active on Global before merging.

The importer rejects incomplete rarity groups, ambiguous names, unknown tags,
missing local operators and disagreements with local recruitment fields. It writes
only after validation succeeds. A failed update keeps the previous reviewed
snapshot; it never falls back to CN eligibility or estimated release dates.
Tables are third-party mirrors of game records, not official announcement sites.
This check covers recruitment; other datasets require their own source validation.

## Readable generated filenames

Prepared page data follows its route: `/recruitment` uses
`release/pages/recruitment.json`, and `/operators/Thorns%20the%20Lodestar` uses
`release/pages/operators/Thorns the Lodestar.json`. The homepage uses `index.json`.
Only reserved filename characters are escaped. Stage Guesser uses `catalogue.json`
and `layouts/<stage-slug>.json`; identical layouts share one stage-named file.
Hashes remain in manifests and internal comparison keys, not generated filenames.

This is content schema 2. Schema 1 hash-named releases are deliberately unsupported;
rollback targets must also use schema 2 and readable paths. Deploy the schema 2
loader before publishing its first data release. Subsequent data releases still
require no website rebuild.
