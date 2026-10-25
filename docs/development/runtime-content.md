# Runtime game content

The website reads reviewed game records from the public [arkpedia-data repository](https://github.com/arkpedia/arkpedia-data). Its `live/current.json` pointer selects an immutable, validated commit. Operators, stages, banners, schedules, skins, recruitment and the supported game catalogues can update without a website deployment.

## Bundled record access

Content and bundled-page builders use compiled-in imports so they also work in deployments without a loose `data/` directory. Material catalogue reads go through `loadMaterialCatalogue` in `lib/farming/materialCatalogueServer.ts`; animated-art index reads go through `loadDynamicArtIndex` in `lib/skins/dynamicArtFallback.ts`. Both validate the same records as before. Keep these loaders server-only and leave the pure validators/types client-safe. Filesystem reads remain appropriate for export/build-time per-file inventories and writers. Preserve route-specific projections and optional `tables` overrides; use `DATA_DIALOG_TABLES` for the shared import-dialog loaders instead of creating another catalogue check. A common loader does not justify combining unrelated page projections or replacing other compiled-in imports with filesystem reads.

## Update flow

1. `Prepare content release` checks daily at 19:57 UTC (8h 57m after the 11:00 UTC Global reset), or runs manually. The public image, skin and voice syncs are scheduled earlier (16:07-16:31 UTC), but GitHub starts scheduled runs 2-4 hours late, so a scheduled release first waits, up to 30 minutes, until each sync has finished its run of the day (`scripts/content/asset-syncs.mjs`); a manual run does not wait. The daily job compares upstream revisions and reuses a successful preparation when nothing changed, avoiding dependency installation and compilation on unchanged days. Manual runs always run. Changed inputs load public source records, refresh supported importers, then compile page JSON without running a Next.js build.
2. A deploy key scoped only to arkpedia-data pushes the validated release straight to its `main` as a fast-forward. No pull request is opened and nobody reviews the release first, so the checks in this job are the only gate.
3. The push runs that repository's `Content release` workflow, which validates the commit again and publishes it through the `live` pointer. Existing website pages adopt it during background revalidation; newly added operator, event and stage-content URLs generate on demand. The job then polls the `live` branch for about five minutes and opens a `Content release not live` issue if the pointer did not move to what it pushed (`scripts/content/await-live.mjs`).

## A channel's deployments must run the release's code first

Each branch the job runs on has a content channel (`scripts/content/channel.mjs`, `config/content-channels.json`). Main's release goes to data `main` and the `live` pointer, which production (www.arkpedia.net) reads. Dev's run compiles data main's records with dev's code into data `dev` and its own pointer, `dev-live`, which arkpedia-dev reads, so a pipeline change merged to dev shows there before it reaches main; data `main` and `live` are never written by it. Deploy starts dev's run after each dev deploy, and the scheduled run starts it once more every night. Any other branch has no channel, and the run fails at the step that chooses one.

A release is compiled by the app commit the job checks out (main's, or dev's for the dev channel), and that code decides what each page's props look like. The deployments of that branch may still run older code that reads a different shape: on 2026-09-25 main dropped `countdowns`, `pullBannerLinks` and `isOngoing` while the deployed `/farming` and `/schedule` still dereferenced them, and both said `CONTENT_SCHEMA` 2. So the job publishes a release only while the deployments of its branch run the same code (`scripts/content/deploy-gate.mjs`): production for main's release, arkpedia-dev for dev's.

- Every build writes `public/build-info.json` first thing in `prebuild` (`scripts/build/write-build-info.mjs`): its commit, its *code fingerprint*, whether the tree had uncommitted changes, and the pointer it reads. Each deployment serves it at `/build-info.json`, never cached.
- The code fingerprint (`scripts/content/code-fingerprint.mjs`) hashes every tracked file at a commit except the docs-only paths in `config/docs-only-paths.json`, which are exactly what Check skips (so a docs-only push, which never deploys, holds nothing). `export.mjs` writes the generator's into the release manifest.
- The job asks each live deployment of its branch in `config/production.json` with one GET before it starts and again right before it pushes; a deployment of another branch reads another channel's release and is not asked. Any answer but a clean build with the release's fingerprint and schema, reading the channel's pointer, holds the release: another commit, a dirty build, another channel's pointer, no build-info, an unreachable site. The run fails and opens the `Content release held` issue with the reason (`Content release held (dev)` for the dev channel); the next good run of the same channel closes it.

A held release goes out once its branch's deployments run the code: let Check and Deploy finish on that branch (a red Check or a failed Deploy each opens its own issue). On main, then dispatch `Prepare content release`, or wait for the next scheduled run; Deploy also starts it again after main's last deployment while the issue is open. On dev, the next successful Deploy of dev starts dev's run again by itself. After this gate first merges, production serves no `build-info.json` until that commit deploys, so every run is held until then.

## Alerts

Each alert is one issue, found by a hidden marker (`scripts/content/alert-issue.mjs`), commented on at most once a day and closed when the condition clears.

| Issue | Opened by | Means |
|---|---|---|
| Content release failing | Prepare content release | the run failed or timed out |
| Content release held | Prepare content release | the deployments of the run's branch (production for main) do not run the code the release was compiled with |
| Content release not live | Prepare content release | arkpedia-data's `Content release` did not move `live` to the pushed commit |
| Content quarantined | Prepare content release | records held back or stages that did not run to the end |
| Asset sync failing | Prepare content release | an asset repository's latest sync failed or is over three days old |
| Check failing on main | Check | main is red, so nothing deploys |
| Deploy failing | Deploy | production keeps its previous build, or runs the new one with asset links that lag the release |
| No content release for over a day | Release heartbeat, in arkpedia-data | neither `live` nor the `heartbeat` branch moved for 26 hours |
| Data main is not live | Release heartbeat, in arkpedia-data | `live` does not serve data `main` an hour after it was committed |

The dev channel's run reports under issues of its own, titled with ` (dev)` and found by their own markers, so a broken dev run never comments on or closes production's. A cancelled dev run is not reported: dev's queue cancels a run whenever a newer one starts. A run on a branch with no channel stops at the step that chooses one and reports nothing, since no later run would close its issue.

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
`release/manifest.json`, without rewriting every operator page. (A change pushed to
arkpedia-data's `refresh/content` branch instead of `main` still opens a reviewed pull
request there, whose summary identifies asset-only updates and reports the file counts;
the nightly release pushes to `main`.)

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
update during the existing daily refresh, and the release publishes it with no review,
so the importer's own checks are the gate. A mirrored game table can contain preloaded
changes: if a new recruitment batch is not active on Global yet, correct the roster in
arkpedia-data's `source/` and release that correction.

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

## Automatic shared editorial updates

Kukki edits `source/` on `arkpedia-data/editorial` and pushes there. Do not edit generated `dev`, `dev-live`, `live`, or `release/` output. The app's **Editorial content** workflow checks every ten minutes (GitHub can delay scheduled runs), compares the editorial branch with shared data main, and dispatches **Prepare content release** on app main with the immutable source commit as `data_ref`, `refresh_upstream=false` and `merge_main=true`. No cross-repository credential is stored: the watcher uses the app repository's own Actions token to dispatch its own workflow. `ARKPEDIA_EDITORIAL_BRANCH`, an app repository variable, can select another source branch. The matching data repository variable controls source-branch fast-forwards.

The standard compiler, tests, source ancestry checks, and deployment compatibility gate still apply. Its successful manual main preparation triggers a dev preparation from the resulting shared data main, with upstream refresh off, so the same edits reach both channels without promoting dev app features to main. Failed compilation retains the old release and uses the existing failure reports; pending main preparations suppress duplicate dispatches. Scheduled main refreshes retain their existing nightly dev handoff.

Palette edits: a recipe in `color-palette-features.json` or a review in `color-palette-reviews.json` changes the palette it applies to, which only the refresh's palettes stage used to rebuild, so an editorial compile (no refresh) failed the palette test and held every later edit with it (2026-10-13). Such a run now rebuilds exactly the palettes made from another recipe or review (`build-color-palettes.py --if-stale`, which downloads nothing when none is stale).

Failures stay visible until the edit is published. "Content release failing" records each failing source commit and closes only when a successful run compiled all of them, never on an unrelated run of data main. The watcher opens **Editorial edits unpublished** when editorial has source commits data main has not taken for over two hours, and closes it once they are in. GitHub runs the ten-minute schedule irregularly (twice on 2026-10-13), so every successful main preparation also asks the watcher to look again at once; a failed one does not, so a failing commit is not recompiled in a loop.

After public main publication, the data workflow fast-forwards editorial to current main only if its commits have already been incorporated. Concurrent unpublished edits are kept, and no force push is used. Pull editorial before each new editing session. If data main advanced while editorial holds unpublished work (every daily refresh does), the preparation merges current data main into it for that run (`merge_main`) and publishes the merge, so nobody has to merge by hand; only a conflict fails, and then you merge main into editorial yourself, resolve it, and push again. A manually dispatched correction branch still has to contain main unless you set `merge_main`. No-op or documentation-only pushes start no compilation.

## R2 delivery pilot (not activated)

`scripts/content/r2-snapshot.mjs` prototypes delivery of already validated schema 2
releases. It does not replace source records, change application readers, bind a
production bucket or publish `live`. Pass the original manifest bytes, a pinned
40-character data revision and a reader for each manifest path to `stageSnapshot`.
Run the existing release validator before using this transport; the transport checks
paths, pins, lengths and digests, not the editorial or game-data semantics.

The pilot writes only below `pilot-v1/`: generated payloads and the byte-identical
original manifest are immutable SHA-256 objects. That existing manifest is the
snapshot index; its logical paths, payload digests and media pins need no second
format. The small staging pointer records its digest/length, original revision/release
and publication generation. Identical objects are verified and reused;
damaged existing objects cause an error instead of an overwrite. A failed upload can
leave unreferenced objects, but cannot change the current snapshot. No garbage
collection exists yet; retain all objects until deployment reachability is tracked.

Read `readStagingPointer(bucket)` before publication and pass that exact result as
`expected` to `promoteStagingSnapshot`. Already stale callers fail before scanning
the snapshot. Promotion rechecks every referenced object
and conditionally writes only `pilot-v1/channels/staging.json`. A losing concurrent
publisher still fails the final conditional write if it races after preflight.
Rollback uses the same operation with a retained candidate; its
generation increases, so a writer from before the rollback cannot overwrite it.
The caller must use a dedicated pilot bucket with write access restricted to its
publisher. Preview readers will need read-only access and a snapshot pinned per visit.

Nine Node cases cover publication, rollback, concurrent writers past preflight,
missing/corrupt payloads and manifests, invalid source paths/metadata, deduplication,
immutable conflicts, original manifest preservation and bounded pointer bodies:

```sh
node --test scripts/tests/test-r2-snapshot.mjs
```

The manifest-only implementation passed a complete two-release mirror against
Miniflare 5.20261019.1-beta's workerd R2 binding on 2026-10-24. Source revisions
`7706f71936930d419774754ee7333dc40ebc29c5` and
`4f7906318e4545586ec165d619efd1784dd2b929` each contain 8,963 delivery paths
(about 259 MB each). Every original payload was checked against its source digest;
the previous manifest was also checked against its pinned Git tree.

- Current snapshot: 8,850 writes, including its original manifest, before publication.
- Repeating that exact snapshot: zero writes.
- Adding the other real snapshot: 207 writes (206 different payloads and its manifest).
- Publish, switch and rollback: one pointer write each; final generation 3.
- Both snapshots together: 9,058 stored objects, including two manifests and the pointer.
- An already stale publisher: one pointer read and zero writes; no payload scan.
- Missing/corrupt-object injection: promotion fails and the pointer stays unchanged.
  The injected object was restored and verified after the local failure checks.

These are observed local R2 API calls, not remote latency or billed-operation figures.
The obsolete index-based proposal needed a separate 2,028,717-byte index per snapshot;
the original manifest now serves that role. No remote bucket or deployment changed.
Remote staging, app/public-file delivery, cache refresh, retained old deployments,
latency and costs still need proof before activation.

R2 conditional `put` returns `null` when its precondition fails; successful writes
are strongly consistent. See the [Workers R2 API reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).

### S3 publisher transport (inactive)

`scripts/content/r2-s3.mjs` implements the same small bucket interface through the
official AWS S3 client. It requires explicit R2 credentials, accepts only pilot
object keys and the fixed staging pointer, bounds uploaded and streamed bytes,
and permits no unconditional overwrite. Immutable objects are create-only;
pointer replacement sends a quoted `If-Match`. HTTP 412 becomes the native
precondition-failed result; a missing bucket or an authorization failure is an
error rather than an absent object. Requests have a deadline and one attempt so
an uncertain conditional-write response is not silently replayed.

Seventeen snapshot/adapter cases pass. A loopback HTTP fixture using the actual SDK
verifies the wire headers, initial publication, subsequent pointer updates and
stale-write rejection. This is not a remote S3/R2 proof. The pinned SDK adds no
changes to previously locked package versions, and its lockfile audit reports zero
known vulnerabilities. Bulk staging uses four tasks per call (configurable from one
to eight), verifies every source path and coalesces identical destination hashes.
Errors drain in-flight work before returning; promotion verifies unique payloads
before its final conditional pointer write. The app reader and remote delivery
proof remain to be implemented before asking for bucket-scoped S3 credentials. No bucket,
remote object, app binding or production pointer has changed.

See [Cloudflare's AWS SDK v3 example](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/)
and [conditional S3 extensions](https://developers.cloudflare.com/r2/api/s3/extensions/).

The complete local workerd proof was repeated for bounded implementation `29620404`
using the same two real releases. Initial staging still writes 8,850 objects; an
unchanged repeat writes none; the other snapshot adds 207. Publish/switch/rollback
each write one pointer, ending at generation 3 with exactly 9,058 stored objects.
Stale publication after rollback is rejected after its pointer preflight; missing
and corrupt payloads leave the pointer unchanged and the injected object is restored.
Unique-payload verification removes 114 redundant reads from each complete scan:
8,851 GET calls for promotion including its manifest and pointer. Initial staging
took 152.08 seconds locally, with 17,702 observed GET calls including two harness
pointer checks. These remain local API observations, not remote latency or billing.

### Explicit pilot command (inactive)

`node scripts/content/r2-pilot.mjs --help` describes three separate operations:
`inspect` reads the staging pointer, `stage` uploads immutable objects without
moving it, and `promote` publishes or rolls back with a saved explicit precondition.
The CLI cannot create/list/delete buckets or use production object keys. It has no
default bucket, source revision or implicit AWS identity. Credentials are read only
from `ARKPEDIA_R2_ACCOUNT_ID`, `ARKPEDIA_R2_ACCESS_KEY_ID` and
`ARKPEDIA_R2_SECRET_ACCESS_KEY`; use a separate private pilot bucket with a
bucket-scoped Object Read & Write key when the remote gate is ready.

Source acquisition fetches the original manifest from public `arkpedia-data` at the
given full commit. It does not trust a cached manifest or accept a moving branch.
Payloads use a local hash cache and are checked for length and SHA-256 on every
read. `--source DIRECTORY` can seed misses from an existing compiled `release/`
directory, verified against that pinned manifest. This lets the data publication
job hand off its existing output without thousands of individual payload requests.
Missing payloads fail by default; `--fetch-missing` explicitly permits acquiring
them from that same pinned revision. Duplicate in-flight hashes share a download,
and cache files are published atomically without overwriting existing files.
Corrupt cache entries fail rather than being silently repaired. The CLI performs no
source editing or publication back to GitHub.

For example, with scoped credentials supplied by the caller, the following is Bash
syntax (Git Bash on Windows). Replace `PILOT_BUCKET` with the isolated bucket name.
Use unique output filenames and preserve each successful result:

```sh
node scripts/content/r2-pilot.mjs inspect --bucket PILOT_BUCKET > .cache/pointer-before.json
node scripts/content/r2-pilot.mjs stage --bucket PILOT_BUCKET \
  --revision 7706f71936930d419774754ee7333dc40ebc29c5 \
  --cache .cache/r2-objects --source /path/to/data-checkout/release > .cache/candidate.json
# Review staging evidence before this separate promotion:
node scripts/content/r2-pilot.mjs promote --bucket PILOT_BUCKET \
  --candidate .cache/candidate.json --expected .cache/pointer-before.json > .cache/promotion.json
```

Run commands individually and require exit code zero before continuing; failed
commands may leave empty output files. An uncertain write/timeout requires another
`inspect` and comparison, rather than a blind retry. Another publisher invalidates
the saved precondition. Rollback uses a preserved earlier candidate and a fresh,
reviewed pointer precondition; it creates a new generation, never restores an old
generation number. No automatic schedule or workflow invokes these commands.

Twenty-five focused source/CLI/snapshot/S3 cases pass, including real SDK wire
conditions, corrupt inputs, missing downloads and stale promotion. The actual new
source loader also fetched both pinned public manifests and reverified all 8,963
cached paths per snapshot (258,553,041 and 258,462,721 bytes); original manifest
bytes match. This involved no remote storage operation. An initial empty-cache
acquisition with `--fetch-missing` still uses individual public-file requests. Prefer
the existing compiled output through `--source` for bulk CI handoff. Application
integration and remote delivery proof remain open; no remote pilot is active.

### Immutable delivery adapter (inactive)

`lib/content/r2Delivery.mjs` is a portable handler intended for the existing front
Worker, with no Node compatibility requirement. No route, binding, service or app
environment setting enables it yet. It returns `null` outside `/__content/pilot/`,
so an eventual caller can leave the front Worker's existing behavior intact.
Publisher and reader share `deliveryManifest.mjs`; the original manifest remains
the only index. This does not add a second snapshot format or browser-side index.

`deliveryBaseUrl(origin, reference)` encodes the full manifest hash and Git revision
in each snapshot's base URL. Pages and generated public files remain under their
original `pages/` and `public/` paths. Reads never consult a channel pointer, so
an old page continues to request its original snapshot through publication or rollback.
The handler verifies manifest and payload lengths/digests before serving bytes.
Missing/invalid objects return uncached errors; unknown paths cannot become a proxy.
The only methods are GET and HEAD. Successful immutable responses carry SHA ETags,
public CORS and nosniff; pilot data is noindex. Browser file requests receive that
file alone, while the manifest is resolved/cached on the server.

An optional Cache API adapter stores verified immutable successes. Warm hits need
no R2 reads; errors are not cached, and cache failures fall back to verified origin
delivery. Conditional GET and HEAD work on both paths. Cache keys omit query strings
and reader credentials. Two manifest entries and two active origin reads are the
defaults; a bounded sixteen-request queue accommodates normal bursts and removes
disconnected waiters. Production limits, memory and latency still need measurement.

GitHub fallback is off by default, keeping an R2-only proof honest. An explicit
fallback may read only the same public repository/revision/path, with redirects
rejected and credentials omitted. The fallback is hash-checked and identified in
`x-arkpedia-content`; another or current snapshot cannot substitute for the pin.
Do not activate application delivery until server props and all generated browser
file paths use the same immutable reference and that fallback policy is verified.

Thirty-six focused publisher/source/reader/S3 cases pass. A local native workerd
proof bundled the adapter to 12,161 bytes with no Node compatibility flag, loaded
both real manifests, and verified homepage, schedule, story, operator-search and
site-search payloads from each snapshot (ten HTTP checks). A Cache API hit made no
R2 read. Headless Chromium retained an old snapshot through pointer changes and
rollback, verified the selected current snapshot, and completed twelve-request
bursts at each step with no page errors. HEAD and conditional responses passed too.
This is a local transport harness, not the integrated Arkpedia website, a remote
latency/billing measurement or an application old-tab cutover proof.

### App reader integration (local, opt-in only)

The app reader can now opt into the isolated pointer with the server-only
`ARKPEDIA_CONTENT_PILOT_ORIGIN=https://<pilot-data-origin>` setting and
`ARKPEDIA_DEPLOYMENT_ROLE=staging`. The origin must be bare HTTPS, with no userinfo,
path, query or fragment. The existing local test flag allows HTTP only for localhost
or 127.0.0.1. The production role refuses this setting before making a request.
No deployment currently sets it; www and the Cloudflare migration pilot retain
their existing GitHub delivery. This data pilot is distinct from the migration
site at arkpedia-cf.mocchibird.com and the temporary feature-preview site.

The delivery adapter exposes `/__content/pilot/current.json` only when its caller
explicitly enables `serveStagingPointer`. It validates the stored pointer and its
hashed manifest before returning the existing schema-2 app pointer shape. The
response is no-store and noindex; publisher generation/ETag and storage keys are
not returned. Both pointer and uncached payload work share bounded reader admission.
This adds no write endpoint or production pointer fallback.

`loadRelease` resolves that pointer into the manifest-hash/revision URL. The page's
existing `__contentRelease` then carries the same immutable base into `contentUrl`
and real lazy file consumers. New pages may adopt a newly published snapshot;
already-open pages keep their original URLs. A bad pointer retains the last
verified release through the existing loader behavior. Default GitHub delivery,
schema checks and page digest checks remain in place.

Local acceptance on current-main code includes 37 publisher/transport cases plus
the real app-loader publication/held-file/rollback/production-refusal regression,
existing GitHub release/channel checks and declaration consistency. Typecheck,
explicit changed-file lint and Knip pass. Two unchanged channel tests initially
failed because the Windows checkout gave Linux shell/YAML fixtures CRLF; normalizing
those fixtures to their Git LF bytes made all 12 channel cases pass without changing
their logic or assertions.

An integrated Next development server was tested against native local workerd/R2,
using two complete real 8,963-path snapshots and conditional publisher promotion.
Twenty homepage/schedule/story/operator/base cases passed across both themes and
desktop/mobile widths. Real nav search on a held page fetched its original
immutable URL after publication; a fresh page fetched the new snapshot URL, and
rollback restored the original release. Both responses matched the original
manifest digests. These particular real snapshots deduplicate all public-file
bytes; the focused app-loader regression separately covers differing file bodies.
All final browser cases had zero page errors and no root overflow. Initial browser
evidence is retained: the test's theme initializer first tried localStorage on
about:blank; restricting that initializer to the app origin fixed the harness,
while keeping every snapshot/error assertion and adding hydrated story readiness.

This is local website integration proof, not remote storage, a production adapter
build, a latency/cost comparison or whole-site migration acceptance. A separately
reviewed reader binding/route, scoped remote publication, default/fallback failure
proof and retention/reachability policy are still required before activation.
