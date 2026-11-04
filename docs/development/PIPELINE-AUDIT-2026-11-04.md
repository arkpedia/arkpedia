# Native public-asset delivery audit, 2026-11-04

Follow-up scope: the user approved full backfill/cutover and requested moving the
deduplicated JSON reader and publishers into the new bucket too. The selected
steady state is [unified storage](unified-asset-storage.md); the original two-bucket
findings below retain their observation boundaries.

The existing media URLs cannot be served by a native R2 domain without changing
storage layout. This change prepares a path-addressed public media view and both
publisher hooks. An approved isolated 26-file canary is active; production savings
remain unmeasured and production routing is unchanged.

Scope: `arkpedia/arkpedia` main `b7def9eb07ba6e4e3af4c80a4f74c8acb4c2e208` and
`arkpedia/arkpedia-data` main `020625b51222ec102895fa49b5bcfca780a64011`.
Current remote data workflow was read directly; the older local data checkout was
not used as proof of its current publishing behavior. After canary approval, the
existing Cloudflare OAuth login supplied a complete source-receipt listing, bucket
and route inventory. The signed-in dashboard supplied the Free-plan rule settings.
Only a new native bucket, its canary domain, four canary-scoped rules, two canary
generated-data routes and 26 public file copies were added. No production Worker,
domain, account database, subscription or content pointer was changed.

A subsequent read-only public receipt sample at 14:12 UTC covered 22 selected
live/bundled/animation revisions, 270,504 files and 30.7 GB of path-addressed bytes.
That corresponds to about $0.47/month before allowances and operations, excluding
other historical revisions. The exact observations are in
[the receipt report](native-assets-active-estimate-2026-11-04.json). This does not
measure the source bucket's deduplicated storage or prove net savings.

The subsequent full receipt inventory found 89 revisions/60.5 GB. Excluding the
49 generated JSON snapshots leaves 40 media revisions/534,105 paths/47.6 GB, about
$0.72/month in additional native storage before allowances/operations. Generated
data and its readiness stay on two specific Worker routes to avoid recurring path
copies. Exact counts and evidence boundaries are in the
[full receipt inventory](native-assets-full-inventory-2026-11-04.json).

| Producer/source | Trigger and output | Consumer/refresh | Evidence/state |
|---|---|---|---|
| Approved GitHub asset repositories | Six-hour app mirror and manual image-pin preparation; immutable blobs, indexes and receipts | Current `arkpedia-assets` Worker translates public URL paths | Source verified; production behavior not remeasured |
| `arkpedia-data` source/content commits | Required mirror job publishes data/media before moving the live pointer | Runtime content and page asset URLs | Current remote workflow verified |
| Both source mirrors → native public media view | Disabled native steps, create-only URL-shaped objects and completion receipts under a cross-repository lease | Future native R2 production custom domain | Implemented; full publisher still unexercised remotely |
| Native sample view → public CDN | Isolated custom-domain, CORS, query rewrite, cache and response-header operations | Canary media URLs | 26-file live HTTP parity/cache/CORS/range check passed; browser image/audio/animation diagnostic passed after DNS refresh |

| Requirement | Verdict |
|---|---|
| Preserve current and historical URLs/relative animation paths | Implemented; fixture verified |
| Prevent corrupted/partial publication from advertising readiness | Implemented; interrupted/corrupt fixture cases verified |
| Bound storage growth and concurrent publishers | Implemented; byte-budget and atomic lease fixtures verified |
| Publish new content only after native copying succeeds | Matching data workflow hook implemented; remote run unverified |
| Remove media Worker request charges | Canary media routes bypass Worker; production unchanged |
| Reduce R2 reads through CDN and tiering | Canary cache HITs verified; Smart Tiered Cache and production effects remain unverified |
| Net cost reduction after duplicate storage/operations | Full receipt storage estimate available; traffic savings and future growth unmeasured |
| Preserve real audio, animated skins/chibi rendering | Browser diagnostic passed for image decoding, muted audio seek and chibi/artwork skeletons; full production app journey still required |

The earliest incompatible handoff is URL → object key: public URLs contain a
repository, commit and path, while R2 holds deduplicated Git-blob keys. Merely moving
the domain would make public files unavailable. The repair materializes a separate
view without exposing the source bucket. This intentionally consumes repeated
storage across revisions; the complete receipt report bounds the initial storage,
while source integrity and operational budgets still need full publication checks. Do not discard historical snapshots
to force a favorable estimate.

A second handoff is content pointer → public bytes. The data repository already
gates live-pointer movement on its source mirror, but native copies require an
additional step in that same required job. Updating only the application's periodic
mirror would leave a window where new content names unavailable native objects.
The companion data change closes that dependency, disabled until reviewed activation.

No additional upstream ingestion, regional translation or artwork-retention policy
changes are needed here. Original Git repositories and the existing deduplicated
mirror remain the source/rollback artifacts. This narrow audit does not prove every
upstream ingestion mechanism or unrelated data family.

Validation: application publisher/reader/probe fixtures pass, including malformed
indexes, missing blobs, conflicting immutable paths, Unicode animation paths,
storage caps, lease expiry/takeover, conditional requests, range and CORS failures.
The matching data publisher tests and existing editorial tests pass; current
compiled-release validation passes. Separately, the 26-file Cloudflare canary passed
normal-DNS HTTP parity and browser diagnostics. The generated-data route check
confirmed identical manifest bytes and readiness on both hosts. Full publication,
the complete application journey and lower production charges remain unverified. See [the runbook](native-asset-delivery.md) for the
dependency-ordered inventory, isolated canary, publication and recovery gates.
