# Community statistics and skin ratings

Production rankings share anonymous aggregates through the existing private page-cache R2 bucket. Conditional leases coalesce cold reads across isolates and regions. Aggregate results refresh after 30 seconds; replay upload batches do not invalidate every request. Every read still checks current community account revisions, so sharing withdrawals bypass both fresh and stale cached totals immediately. During temporary D1 overload, only a consent-matched result built within two minutes may be used. Shared keys are bounded to the four region cohorts; single-stage reads stay local. The cache stores no account identities or replay contents. Lease and result writes are conditional on the same object's ETag, with bounded backoff for [R2's per-key write limit](https://developers.cloudflare.com/r2/platform/limits/).

These features are approved for production publication as of 2026-11-05. `/community/statistics`, `/polls` and
`/polls/favourite-skins` are public. Drip Awards retains its subtitle:
“A very serious poll, for serious poll testing”. Power Scale remains a closed results
page; this revision does not reopen or redesign its voting.

## Community statistics

The existing **Contribute to community stats** choice covers roster and replay
aggregates. Private saving alone does not enable statistics. Withdrawal is checked on
every aggregate read. Each roster/replay cohort needs ten contributing game accounts.

Roster imports supply upgrade counts. Ownership ranks only six-star operators.
Levelling and Elite 2 rankings use regular Amiya; Guard and Medic forms are excluded
rather than added to her ownership or promotion count. Skill and operator-usage
rankings retain those forms because they have different skills and battle behaviour.
Individual skill rankings show their actual skill icons on cards, podiums and rows.

Skill mastery ranks each existing skill's M3 count for operators of four stars and
higher. M9 requires three skills at M3. E2 level 90 applies only to six stars. E0 level
1 excludes unknown builds from its percentage denominator. Absolute and Relative
show totals and documented percentages; Ascending and Descending order both cards and
dialogs. Class and rarity filter operators without rebasing the comparison sample.
Equal values share a rank. Filters, search, the open ranking and mode are URL-backed.

Replay summaries use one archived run per game-account namespace/stage: latest summary
update, then a deterministic user-ID tie break. Identities stay private. Migration
0015 creates the summary table and installs insert/update triggers. Existing
archives are backfilled separately with `scripts/community/backfill-replay-summaries.py`
in resumable batches of at most 250; the original all-row backfill exceeded production
D1 CPU limits. This extraction leaves the already-applied Preview schema unchanged. Action codes 0, 1 and 2 mean deploy, retreat and manual skill activation.
Summaries hold at most 64 known character IDs. Automatic/passive skill triggers are
not inferred. Archive deletion cascades to its summary. Migration 0017 adds covering indexes for
cohort and counter reads. Queries deduplicate compact keys before reading units and
union deployments per public stage before resolving operator names, avoiding an
expensive per-unit catalogue join at production volume. Production coalesces identical
reads for up to 30 seconds within an isolate. Every request first checks anonymous
account revision/deletion and replay change counters, so withdrawals invalidate
results immediately. Failed reads are not retained.

Operator Usage includes uploaded auto-deploy data only. Clears from stages that
cannot save auto-deploys are excluded. Stage clears sum `completeTimes` counters
from those auto-deploy records, taking the largest nonnegative
integer for duplicate game-account/stage uploads. Missing counters are omitted.
Stage coverage counts distinct known stages with a recorded operator deployment in
a successful saved run. A stage counts once across contributors. Historical squads
cannot be inferred from lifetime counters, so current teams are never multiplied by
those counters. Bench presence counts squad appearances without a deployment.

The staging role may serve the explicitly approved anonymous production snapshot in
`config/preview-community-statistics.json`. Its capture time is shown in help.
Production ignores it; Preview has no production database binding. The SELECT-only
exporter returns public operator/stage identities and closed aggregate counts, never
user IDs, namespaces, rosters or replay payloads. It parses archives in small disjoint
stage batches to stay within D1 resource limits.

## Persistent 1–10 skin ratings

Users can rate any number of catalogue outfits from 1 to 10, revisit them later,
change scores or clear individual ratings. A successful response saves each change
to that Arkpedia account independently. The gallery has search, Rated/Unrated
filters and saved progress. The detail dialog has the outfit artwork, rating scale,
Previous/Next navigation and clear/retry controls. Failed choices remain visibly
unsaved until recovered. Reload restores acknowledged server saves.

The poll builders read generated, bundled public catalogues rather than source-file
loaders, so an older content release can safely fall back without runtime `data/` files.

The current API is `/api/cloud-account/polls/favourite-skins?mode=ratings`. GET exposes
only aggregate totals and, for the authenticated session, its own ratings/revisions.
Public results never include individual ratings or account identities. Rating and
clearing require an Arkpedia session, completed profile, matching owner, same-origin
JSON, a known catalogue skin and an integer score in range. Existing account and
ingress limits remain active.

Migration `0016_skin_ratings.sql` adds `skin_poll_rating`, keyed by poll/account/skin.
Each row has its own optimistic revision, so editing one skin does not block another.
A cleared score remains a null tombstone to stop stale devices resurrecting it.
Conflicts retain the attempted score and offer an explicit reload of the saved value.
Account deletion cascades to ratings. The old top-five test table and version-one API
remain intact for compatibility; ranked ballots are not converted into invented
1–10 ratings. The new rating test starts fresh.

Results rank mean scores and show rating counts. Operator results pool all ratings
on their outfits. Exact equal averages share rank; rating count and name settle
presentation order. These are account ratings, not verified unique humans. Reads
refresh every 30 seconds while visible and on return/focus. Refreshes preserve pending
and failed edits. A session change remounts its private state.

The overview shows current skin-rating leaders and recorded Power Scale leaders in
second/first/third order, with first in the centre. Empty live results show an empty
state rather than substituting featured outfits. Live leaders refresh with the public
rating data. Both cards retain direct rating/ranking actions. Shared panel, heading,
control, artwork and podium primitives provide both themes and reduced-motion support.

## Publication and verification

Apply additive migrations only to the matching isolated database. Preview account
sessions, private saves and ratings stay in `arkpedia-preview-accounts`; production
uses `arkpedia-prod-accounts`. Production reads current opted-in database aggregates;
the fixed snapshot and its capture-time help remain staging-only. The user's
2026-11-05 production release request authorizes additive migrations 0015–0017, followed
by a complete bounded backfill and the checked-main production release owner. Capture the database recovery bookmark
privately before applying the additive migrations. Code recovery must preserve newer
database writes. The base optimizer remains Preview-only.

SQLite regressions cover authentication, validation, averages, independent saves,
per-skin revisions, clearing, stale writes, account isolation/deletion and preservation
of earlier test ballots. Display regressions cover skill eligibility/icons, Amiya
forms, six-star ownership, percentage denominators and sort ties. Browser journeys
cover saving more than five outfits, reload/resume, editing, clearing, failed writes,
conflicts, account switching, public results, artwork, navigation and both themes at
desktop/mobile sizes. Fixture votes are not real account writes.

The production Worker reads public operator, stage, poll and account catalogues from
its ASSETS binding through `readShippedTable`. Build generation precedes static-table
shipping. Production compiles out the Preview snapshot; its size is not loaded by
every cold isolate. The Worker size budget remains unchanged.

Rating-popup artwork opens the shared full-screen still/animated viewer. Closing it
returns to the same skin and score, with focus restored to the artwork trigger. Back
controls return to the skin list, ranking list or poll overview as appropriate.
Unselected stage filters are omitted from statistics URLs; the empty `stage=` form
failed on the deployed browser path even though the canonical request succeeded.
