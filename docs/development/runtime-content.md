# Runtime game content

The website reads reviewed game records from the public [arkpedia-data repository](https://github.com/arkpedia/arkpedia-data). Its `live/current.json` pointer selects an immutable, validated commit. Operators, stages, banners, schedules, skins, recruitment and the supported game catalogues can update without a website deployment.

## Update flow

1. `Prepare content release` checks daily at 19:57 UTC (8h 57m after the 11:00 UTC Global reset), or runs manually. The public image, skin and voice syncs are scheduled earlier (16:07-16:31 UTC), but GitHub starts scheduled runs 2-4 hours late, so a scheduled release first waits, up to 30 minutes, until each sync has finished its run of the day (`scripts/content/asset-syncs.mjs`); a manual run does not wait. The daily job compares upstream revisions and reuses a successful preparation when nothing changed, avoiding dependency installation and compilation on unchanged days. Manual runs always run. Changed inputs load public source records, refresh supported importers, then compile page JSON without running a Next.js build.
2. A deploy key scoped only to arkpedia-data pushes the validated release straight to its `main` as a fast-forward. No pull request is opened and nobody reviews the release first, so the checks in this job are the only gate.
3. The push runs that repository's `Content release` workflow, which validates the commit again and publishes it through the `live` pointer. Existing website pages adopt it during background revalidation; newly added operator, event and stage-content URLs generate on demand. The job then polls the `live` branch for about five minutes and opens a `Content release not live` issue if the pointer did not move to what it pushed (`scripts/content/await-live.mjs`).

## Production must run the release's code first

A release is compiled by the app commit the job checks out (main, normally), and that code decides what each page's props look like. Production may still run older code that reads a different shape: on 2026-09-25 main dropped `countdowns`, `pullBannerLinks` and `isOngoing` while the deployed `/farming` and `/schedule` still dereferenced them, and both said `CONTENT_SCHEMA` 2. So the job publishes a release only while production runs the same code (`scripts/content/deploy-gate.mjs`):

- Every build writes `public/build-info.json` first thing in `prebuild` (`scripts/build/write-build-info.mjs`): its commit, its *code fingerprint* and whether the tree had uncommitted changes. Production serves it at `/build-info.json`, never cached.
- The code fingerprint (`scripts/content/code-fingerprint.mjs`) hashes every tracked file at a commit except the docs-only paths in `config/docs-only-paths.json`, which are exactly what Check skips (so a docs-only push, which never deploys, holds nothing). `export.mjs` writes the generator's into the release manifest.
- The job asks each deployment in `config/production.json` with one GET before it starts and again right before it pushes. Any answer but a clean build with the release's fingerprint and schema holds the release: another commit, a dirty build, no build-info, an unreachable site. The run fails and opens the `Content release held` issue with the reason; the next good run closes it.

A held release goes out once production runs the code: let Check and Deploy finish on main (a red Check or a failed Deploy each opens its own issue), then dispatch `Prepare content release`, or wait for the next scheduled run. After this gate first merges, production serves no `build-info.json` until that commit deploys, so every run is held until then.

## Alerts

Each alert is one issue, found by a hidden marker (`scripts/content/alert-issue.mjs`), commented on at most once a day and closed when the condition clears.

| Issue | Opened by | Means |
|---|---|---|
| Content release failing | Prepare content release | the run failed or timed out |
| Content release held | Prepare content release | production does not run the code the release was compiled with |
| Content release not live | Prepare content release | arkpedia-data's `Content release` did not move `live` to the pushed commit |
| Content quarantined | Prepare content release | records held back or stages that did not run to the end |
| Asset sync failing | Prepare content release | an asset repository's latest sync failed or is over three days old |
| Check failing on main | Check | main is red, so nothing deploys |
| Deploy failing | Deploy | production keeps its previous build, or runs the new one with asset links that lag the release |
| No content release for over a day | Release heartbeat, in arkpedia-data | neither `live` nor the `heartbeat` branch moved for 26 hours |
| Data main is not live | Release heartbeat, in arkpedia-data | `live` does not serve data `main` an hour after it was committed |

The last two run on arkpedia-data's free public runners, so they report even when no private job can start (an offline runner, a disabled workflow, a refused budget). Every successful release run commits a heartbeat to arkpedia-data's `heartbeat` branch, so a day with nothing new to publish is not taken for an outage.

Daily checks are retained because patches, mirror uploads and corrections do not always arrive together. This is a post-reset check, not a hard-coded assumption that every patch opens four hours after reset. Late upstream uploads are picked up by the next check; GitHub may delay scheduled jobs.

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

The deployment has asset pins of its own, `data/assets/revisions.json`: every
root-relative `/<folder>/...` path is a redirect to the commit it names
(`next.config.js`), and pages without a release fall back to it. The second step of
`prebuild` (`scripts/build/adopt-release-asset-pins.mjs`, after `write-build-info.mjs`)
rewrites it with the live release's pins wherever they are newer than the committed
ones, never older, so a deploy never redirects art the release already has to a
commit without it. It keeps the committed pins, with a warning, when it cannot order
them, and a build with `ARKPEDIA_CONTENT_DISABLED=1` (Check's) keeps them always. The
rewrite does not make the build dirty (`BUILD_REWRITES` in `code-fingerprint.mjs`).
After every deploy, `scripts/deploy/check-asset-redirects.mjs` asks production for a
file only the live release's commit has and fails Deploy, opening `Deploy failing`,
when the redirect does not reach it.

## What stops a release

One bad input costs one record, not the day's release. A refresh stage that fails has its changes put back and the stages that need it skipped; one that finishes the stage build's own files in place takes the build back with it, so a half-made dataset never goes out. A record that is incomplete (art or a lineup not published yet, a CN operator not imported, an icon a Global rename moved) is published without the missing piece or held back, as an entry in `source/data/quarantine.json`. The `Content quarantined` issue lists every entry and every stage that did not run to the end, with how long each has been there; one older than three days is marked overdue.

Only invariants stop the release: a record malformed by hand, a missing or duplicate outfit identity, `validate-release` and the code tests, and a collection that shrank by more than 2% since the data the run loaded. The collections are listed in `COLLECTIONS` in `scripts/content/check-completeness.mjs`: the operator, outfit, event, banner, enemy and stage records, the stage list and enemy grid rows, stage contents and maps, voice-line operators, songs, the recruitable pool, the pull planner's banners and the deployable operators.

When a collection is meant to shrink (records removed on purpose, a mode newly excluded), run `Prepare content release` by hand with `allow_shrink` naming it, for example `allow_shrink=stageRows`. That run publishes the smaller collection and says so as a warning in its log and summary; the next run compares against it, so nothing stays allowed. Removing the records in a correction branch and dispatching it with `data_ref` works too, since the run then loads the smaller collection.

## What makes a new release

A day on which no record changed publishes nothing. The manifest carries two fingerprints (`scripts/content/release-input.mjs`). The release id covers the app commit and every published source file, as arkpedia-data's own validator recomputes it. The content id is what the release says: every source file but the two that describe the run itself, `data/upstream.lock.json` (the mirror commits it read) and `data/catalogue-sync.json` (the catalogue's report of the day), and every page and public data file by path and hash, but not the app commit. The publish step compares content ids, so a day that changes only those two files publishes nothing, and neither does a run after an app merge that compiled the same pages; data `main` holds the run records as of the last release whose content changed. State the next run reads back stays in the content id although it changes no page: `data/quarantine.json` (when each held record was first seen, which the overdue mark counts from), `data/wiki-cache/` (a wiki page's last good rows and any hold on it), and `data/assets/revisions.json` (the asset commits every art URL is pinned to). For the same reason nothing a record keeps changes with the mirrors alone: a window keeps the `timingSource` that confirmed it while its times are unchanged, the CN inventory keeps its `source` while what it lists is unchanged, a quarantine entry keeps the permalink it was first reported with, and no quarantine reason names a date or a count that grows by itself.

## Corrections and rollback

To correct a record by hand:

1. Branch arkpedia-data from its current `main` and edit `source/` only. Leave `release/` alone: the job regenerates it. Until then the data validator rejects the branch with "Source records changed without regenerating the release", which is expected.
2. Run `Prepare content release` with the branch as `data_ref` and `refresh_upstream=false`.
3. The job compiles the release from the branch, then pushes the branch's commits and one commit with the regenerated `source/` and `release/` to data `main` as a fast-forward. That push publishes it like any other release. Delete the branch afterwards.

The branch must contain the current data `main`, and be at most 100 commits ahead of it. If `main` has moved on since the branch was cut, the job fails as soon as it loads the branch, before it installs or compiles anything; if `main` moves while the job runs, it fails when it comes to publish. Either way it pushes nothing and never overwrites a newer `main`. Merge `main` into the branch and run it again. A branch that changes nothing the release is built from (only a README or a script, say) is not published: the job warns and stops, and such a branch is merged like any other change.

To roll back, run the public `Content release` workflow with an earlier `main` commit as `revision`. It validates that commit and points `live` at it without changing `main`, so the next push to `main` moves the pointer forward again. Neither workflow opens, approves or merges a pull request.

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

Confirmed Global operator debuts are derived from the canonical event `startAt`:
featured operators join through the banner's `linked_event`, while welfare
operators join through their unlock event. This keeps countdowns and operator
availability on the same official timestamp instead of maintaining a second
override file. The recorded operator date is only a proximity guard against
mistaking a later rate-up for a debut. Exported operator records carry the
resolved `releaseAt`; badges use that instant across timezones. Without a
confirmed hour, the roster says “Releases today” through the Global server's
calendar day instead of declaring availability at the reader's midnight.

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
