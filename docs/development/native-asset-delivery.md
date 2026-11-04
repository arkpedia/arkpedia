# Native R2 delivery for public assets

Status, 2026-11-04: **isolated sample canary active; production unchanged**. The user
approved inventory and an isolated canary. `assets-native.arkpedia.net` serves 26
verified files (4.7 MB) from the new R2 bucket; no revision readiness is advertised.
Production still uses `arkpedia-assets`. No production routing, subscription,
application deployment or continuous native publisher has been changed. Full backfill
and production cutover are now authorized, conditional on passing checks.

The [normal-DNS HTTP check](native-assets-canary-evidence-normal-dns-2026-11-04.json)
passed for all 26 samples: exact bytes/MIME, warm/query HITs, HEAD, strong ETag/304,
byte ranges, CORS preflights and an uncached no-store 404. The
[browser diagnostic](native-assets-browser-evidence-2026-11-04.json) decoded the
image, played and sought within muted voice audio, and rendered chibi/artwork
skeletons with the checked-source Spine runtime and no WebGL errors. It is a diagnostic media
check, not the complete production application journey. The Mac's negative DNS
cache initially blocked the browser; checks passed after the user's DNS refresh.
The [infrastructure snapshot](native-assets-canary-infrastructure-2026-11-04.json)
confirms native media bypasses Workers, the source bucket remains private, all
pre-existing routes remain unchanged, and the zone still uses the Free Website plan.

## Why a domain switch alone cannot work

Public URLs name `/arkpedia/<repository>/<commit>/<path>`. The existing bucket holds
deduplicated Git blobs under `github-v1/objects/<sha>`; the Worker verifies a receipt
and directory index to translate between them. A native R2 domain cannot execute
that lookup. Do not attach the existing private bucket directly to the public host.

The new view uses the dedicated `arkpedia-public-assets-direct` Standard bucket.
Each approved public media file has its existing URL path as its R2 key, with its actual
MIME type and a year-long immutable Cache-Control. Relative animation references
stay in the same directories. No application/data URL changes are required. The
deduplicated source remains private and available to the retained rollback Worker.
Generated `arkpedia-data` JSON and its readiness requests stay on that Worker through
two specific routes. A [live route check](native-assets-data-route-check-2026-11-04.json)
confirmed identical generated manifest bytes and readiness on both hosts. JSON
manifests belonging to media repositories remain native.
This avoids copying thousands of unchanged records on every content release.

This trades additional storage for fewer Worker requests and fewer origin reads.
Files repeated across commits occupy repeated bytes in the native view. **Do not
activate until the full inventory is affordable**, including historical revisions.
Every 100 GB in the new view is about $1.50/month before shared allowances. This is
not a savings forecast: publication operations, recurring validation reads and
future snapshot growth also matter. No old revision is deleted to hide that cost.

A [read-only public receipt sample](native-assets-active-estimate-2026-11-04.json)
at 14:12 UTC on 2026-11-04 covered 22 selected live/bundled/animation revisions:
270,504 URL-shaped files totaling 30,709,991,641 bytes (30.7 decimal GB), about
$0.47/month in Standard storage before allowances and excluding operations. This
is a lower bound for the full historical view, not the source bucket's physical
storage or a net savings forecast. The sample needed no provider credentials;
the all-history inventory was still required at that point.

The [complete receipt inventory](native-assets-full-inventory-2026-11-04.json)
subsequently found 89 completed revisions, 973,696 paths and 60.5 GB. Of those,
49 `arkpedia-data` snapshots account for 439,591 paths/12.9 GB. Keeping generated
JSON deduplicated leaves **all 40 retained media revisions: 534,105 paths and
47,588,950,664 bytes**, approximately **$0.72/month** for the additional native view
before allowances/operations. This is a full receipt inventory, not a full checksum
replay of every stored blob/index. Initial media publication uses roughly 535,000
PUTs plus source reads/listing and lease operations; shared allowances and rounding
determine the actual bill. Subsequent growth still needs the storage budgets.

Cloudflare's [native R2 CDN](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/)
serves cache hits without reaching R2. Its newer
[Workers Cache](https://developers.cloudflare.com/workers/cache/#pricing) still bills
Worker requests on hits, so it does not remove that request charge.

## Inventory and additive publication

`Inventory or backfill native R2 assets` is a manual, main-only workflow. Its
default is a read-only forecast using the existing source credentials. It forecasts a completely empty native bucket, so it
can run before a new resource or broader credential exists. Its report contains
counts, byte totals, revision identities and representative files for every
repository/extension. It does not fetch media bodies, upload or change settings.

```sh
node scripts/content/native-assets.mjs --empty-destination --report=/private/tmp/native-plan.json
```

For an existing native bucket, omit `--empty-destination` to calculate the actual
delta. S3 source credentials read the private mirror; separate native credentials
read/write **only** the native target.
The existing source identity is unchanged and its adapter refuses writes. A separate
`ARKPEDIA_NATIVE_R2_ACCESS_KEY_ID` / `ARKPEDIA_NATIVE_R2_SECRET_ACCESS_KEY` identity
can access only the native bucket. Neither identity may access account databases
or the ISR cache. The command
validates receipts, index digests, source blob lengths and destination conflicts.
Independent index reads overlap eight at a time, and verified bodies shared by
historical revisions reuse a bounded 64 MB cache to reduce publication reads/time.
All completed media revisions are included, preserving old tabs and rollbacks.
Generated data is deliberately excluded from native keys and publication.

After reviewing the inventory, provision the dedicated target and use integer byte
budgets derived from that report. The following limits are examples, not approvals:

```sh
node scripts/content/native-assets.mjs --report=/private/tmp/native-delta.json
node scripts/content/native-assets.mjs --apply --max-new-bytes=25000000000 --max-total-bytes=50000000000 --report=/private/tmp/native-published.json
```

Both budgets are checked before asset uploads. Apply mode first acquires a 256-byte
coordination lease in the native bucket; its size is included in the inventory.
Uploads verify the original Git blob,
Content-MD5 and the returned ETag. Conditional PUTs never overwrite a path. Lost or
racing writes must match bytes, HTTP metadata and SHA-256. Reads are bounded and
normal media concurrency is four. The explicitly dispatched backfill uses sixteen
upload workers (CLI bounds 1–32), a six-hour deadline, immutable resume and progress
counters. Apply requires explicit per-run and total byte limits; it never changes
routing. If it times out, redispatch with the same budgets after the lease expires. A failed revision receives no new native receipt.
Retry resumes immutable files already uploaded. Completed receipts attest the HTTP
metadata was set by this publisher; later inventories still compare every file's
length/MD5 against the source, but avoid a billable HEAD for every completed file.
Do not mutate/delete native objects outside this publisher.

An atomic R2 lease serializes native publishers across the application and data
repositories, which GitHub concurrency groups alone cannot do. It renews every
minute, expires after 30 minutes, and refuses writes if renewal is lost or delayed.
Inventory and budgeting happen under that lease. The only additional public control
object contains a random owner ID and expiry, never credentials; it uses no-store.
An interrupted process may require waiting for lease expiry. Budgets bound this
view's stored bytes, not the whole Cloudflare bill; no other writer may bypass the
lease or mutate the target bucket.

## Isolated infrastructure canary

Request an explicit checked-source isolated Cloudflare preview after the PR checks
pass, following `AGENTS.md` (approval received in this chat on 2026-11-04).
Attach **only** `assets-native.arkpedia.net` to the new
bucket. Keep `r2.dev` disabled. Before public access, verify the target inventory
contains only approved public file keys, public receipts and the publisher lease;
the source bucket
must remain private. A native object can be addressed during an incomplete upload;
the receipt is a publication/adoption gate, not an access-control mechanism.

Render the scoped CORS, query normalization, cache and response-header settings:

```sh
node scripts/deploy/native-assets-rules.mjs assets-native.arkpedia.net > /private/tmp/native-canary-rules.json
node scripts/deploy/verify-native-assets.mjs /private/tmp/native-published.json https://assets-native.arkpedia.net /private/tmp/native-canary-evidence.json
```

Snapshot the existing provider settings and append these rules to the indicated
phases; **never replace a zone ruleset**. Confirm feature availability under the
existing plan. The query rewrite avoids requiring a paid custom-cache-key feature.
Preserve the CORS/security headers, cache JSON/atlas/skel as well as images/audio,
and forbid caching all 3xx–5xx responses. Bucket CORS handles browser OPTIONS.
Enable Smart Tiered Cache if available under the existing plan. Do not enable
Cache Reserve, another paid plan or Workers Cache as part of this operation.

The read-only verifier checks source/native Git-blob parity, MIME, security/CORS,
warm and query-cache HITs, HEAD, strong ETag/304, byte ranges, preflights, historical
receipts and uncached 404s. A HIT or marker header alone does **not** prove bypass:
also inspect the live R2 domain inventory and ensure no Worker domain/route handles
the native media paths. The two generated-data routes intentionally retain the
existing reader. Verify image display, voice playback/seeking, animated skins and chibis
in a browser; HTTP fixtures cannot prove the renderer works.

## Continuous publication and production cutover

After the canary passes, configure `public-assets` secrets
`ARKPEDIA_NATIVE_R2_ACCESS_KEY_ID` and `ARKPEDIA_NATIVE_R2_SECRET_ACCESS_KEY` for the
native-bucket-only identity. Existing source secrets remain unchanged. Set repository variables:

- `ARKPEDIA_NATIVE_ASSETS_MIRROR=true`
- `ARKPEDIA_NATIVE_ASSETS_MAX_NEW_BYTES=<reviewed per-run increase>`
- `ARKPEDIA_NATIVE_ASSETS_MAX_TOTAL_BYTES=<reviewed total stored-byte ceiling>`

The existing six-hour mirror then updates the native view after its source mirror,
including manual image-pin preparation. Keep `ARKPEDIA_ASSETS_DELIVERY` unset during
prefill/canary: the existing Worker still owns production. Verify a newly mirrored
revision in the native view before cutover, and verify native receipts for all live,
bundled and independently pinned animation references. Review the live content
publisher's adoption ordering too. The matching `arkpedia-data` change adds its
native-view step to the existing required mirror job before the live pointer can
move. Its current workflow preserves publisher tooling before selecting an old
content rollback, so releases predating native tooling remain publishable.
Enable the same variables in **both** repositories. Updating only this
application's six-hour mirror is insufficient. Missing native receipts must block
new adoption.

For production, install the two specific generated-data routes before removing the
old Worker custom domain. Keep those routes in both canary and production; do not
claim a total retirement of the asset Worker.

Pause asset/content publication during the hostname move, take a final inventory,
and record the current Worker version/domain, DNS, routes, bucket-domain settings
and rule IDs. Move only `assets.arkpedia.net` from the Worker custom domain to the
new bucket; apply the same scoped rules for that host. Do not touch `www`, apex,
Preview, account storage or the application release owner. Repeat the canary checks
on production, inspect browser journeys, and run `npm run release:status` before
declaring it live. Expect TLS/DNS/domain-ownership propagation: preflight provider
support for the move and roll back if the canonical host becomes unhealthy.

Once verified, set `ARKPEDIA_ASSETS_DELIVERY=native` to stop scheduled deployment of
the retained rollback Worker. Keep native mirroring enabled. Continue to retain
the source mirror, Worker code/version and every published native revision.
Compare asset Worker invocations, R2 Class B reads, storage growth and total charges
over comparable traffic windows. Do not quote the former unverified 67% estimate.

Recovery restores the recorded Worker custom domain/DNS/routes and the original
hostname-scoped rules, then unsets `ARKPEDIA_ASSETS_DELIVERY`. Keep the native view
and source data intact. Do not purge the whole zone or restore any account data.

References: [R2 conditional writes](https://developers.cloudflare.com/r2/api/s3/api/),
[bucket CORS](https://developers.cloudflare.com/r2/buckets/cors/),
[status-specific caching](https://developers.cloudflare.com/cache/how-to/cache-rules/examples/cache-ttl-by-status-code/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/).
