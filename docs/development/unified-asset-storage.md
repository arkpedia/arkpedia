# Unified public asset storage

The approved target is one production bucket, `arkpedia-public-assets-direct`.
Media uses immutable URL-shaped objects and native CDN delivery. Generated
`arkpedia-data` JSON retains its deduplicated format **inside the same new bucket**
and uses the small `arkpedia-data-assets` reader. Future publishers read immutable
GitHub sources and write only this bucket. Neither publishing nor delivery may
depend on `arkpedia-public-assets` after cutover.

This supersedes the initial two-bucket steady-state proposal. The initial media
backfill still reads the old mirror; the historical JSON migration is also
read-only against that source. They are migration tools, not the future publisher.

## Storage and publication

`unified-assets.mjs` discovers approved media references from generated JSON,
publishes every new media dependency first, then writes JSON blobs, indexes and
completion receipts. Repeated JSON across paths/releases shares its Git blob.
Media is written directly at its public URL path without a second media CAS copy.
Existing complete pins need neither a Git fetch nor the old bucket. Immutable
receipts are trusted only with matching inventory length/MD5; external writers
must not mutate or delete objects behind the publisher.

Both repositories share the existing atomic native-bucket lease. Full native
inventory supplies an explicit total storage ceiling; new bodies, indexes and
receipts are budgeted before asset writes. All uploaded bodies are checked against
their Git identity and Content-MD5. Interrupted revisions remain unready and resume
through create-only writes. Historical backfill uses up to 64 upload tasks while
limiting buffered file bodies to 256 MB; resumed metadata checks overlap sixteen
reads. This avoids serial per-file HTTP overhead and unbounded large-file buffering. The content repository preserves the current tooling
before selecting historical releases and gates live-pointer movement on publication.

`migrate-dedup-data.mjs` inventories **all** completed generated-data revisions,
verifies index SHA-256 and blob length/MD5/Git identity, and copies only their unique
JSON blobs plus indexes and receipts. It does not copy the old media CAS archive.
Every referenced media revision must already have native readiness. Bodies and
indexes finish before any migrated data revision advertises readiness. Its report
measures actual deduplicated JSON bytes, rather than copying 12.9 GB of repeated
path-addressed snapshots.

## Migration gates

1. Complete the authorized all-history media backfill, retain its report and pass
   source/native HTTP checks for every representative family and all media receipts.
2. Install a canary `github-v1/*` rejection route before adding internal JSON keys.
   Inventory and migrate generated JSON with explicit new/total byte limits.
   `Inventory or backfill native R2 assets` supports `operation=data`, default
   read-only; `apply=true` is an explicit additive migration.
3. Merge checked application and data publisher changes. Deploy the isolated
   new-bucket reader after bootstrapping its first version from checked main with
   `wrangler deploy --config workers/assets/wrangler.data.jsonc` (this config has
   no production routes). Subsequent deployments use `Deploy isolated unified data
   reader` and the version APIs. This uses the existing production deployment
   credential; the legacy asset credential only grants access to `arkpedia-assets`.
   It does not require a new credential or broader token permissions.
   Cloudflare requires an initial `deploy` before
   `versions upload` can be used for a new Worker. Verify historical/current JSON bytes and readiness, MIME, CORS, cache,
   conditional reads, missing files and rejection of media/internal CAS requests.
   Inspect the provider binding as well as marker headers.
4. Run `operation=unified, apply=true` against current live/bundled/reference pins.
   Exercise a new immutable data revision absent from the JSON migration to prove
   publication from GitHub with only the native-bucket credential. The new data
   reader must serve that revision before production adopts it.
5. Pause both scheduled asset and content publication during the hostname move.
   Take final source/native inventories, retain the old Worker/domain/DNS/routes,
   and migrate any final data revisions. Switch canary data routes to
   `arkpedia-data-assets` and verify both delivery paths again.
6. Install production generated-data/readiness routes to the new reader, plus a
   `github-v1/*` rejection route. Move `assets.arkpedia.net` from the old Worker
   custom domain to the native bucket and apply the scoped Free-plan cache, query
   normalization, CORS/security and error rules. A temporary catchall route to the
   old Worker can protect propagation; remove it only when the R2 domain is active.
   The dedicated JSON routes must remain more specific than this fallback.
7. Verify canonical images, voices/seeking, chibis, animated artwork and historical
   JSON in the actual application. Run `npm run release:status`, inspect actual
   bucket/domain/routes and new reader binding, and record the UTC cutover time.
8. Set `ARKPEDIA_UNIFIED_ASSETS=true` and reviewed native new/total byte budgets in
   **both** repositories. Set `ARKPEDIA_ASSETS_DELIVERY=native` to suppress old-reader
   redeployment. The unified steps receive only native credentials; all old mirror
   and intermediate source-to-native steps are skipped. Resume publication and
   verify a changing content run and an app mirror run against the new bucket.

Until these gates pass, the old bucket is retained and production routing remains
unchanged. After cutover it is a rollback artifact, not an active dependency.
Retire its credentials, Worker and stored data only after the requested confirmation
of the new system and a final inventory proving no accounts/private storage or
unmigrated public revisions are included. Bucket deletion is separate from routing
and must not precede successful publication/delivery checks.

Recovery restores the recorded old asset Worker custom domain/routes and old-reader
version, switches both repositories back to legacy publication, and resumes only
after checking the selected content snapshot exists in that mirror. New unified
releases need re-mirroring into the old layout before rollback can serve them;
do not claim a stale retained bucket is automatically current. Never restore any
account database or remove newly published native files during recovery.

Compare Worker requests/CPU and R2 reads over the first complete UTC day after
cutover and comparable traffic windows. Migration-day uploads/listing/source reads
are one-time operations and can mask early total-cost savings. Keep duplicate
storage across retained URL-shaped media revisions in the ongoing cost estimate.
