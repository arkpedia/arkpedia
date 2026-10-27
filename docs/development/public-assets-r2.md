# Public GitHub assets on R2

Source remains upstream game repositories → reviewed Arkpedia GitHub repositories.
Delivery is GitHub commit → verified R2 objects and indexes → `assets.arkpedia.net`.
GitHub remains the release authority and rollback source, not the normal media origin.
The application cutover is separate from introducing this infrastructure.

## Storage and serving

`arkpedia-public-assets` is a dedicated Standard R2 bucket. It contains no accounts,
secrets or page-cache state and has no public bucket listing or lifecycle deletion.
The small `arkpedia-assets` Worker exposes only approved public files at
`/arkpedia/<repository>/<40-character-commit>/<encoded-path>`.
It never fetches from GitHub on a reader request, forwards credentials, executes
repository files or accepts uploads. Images, skin originals/responsive variants,
current and archived voice audio, palette data, animated skin/chibi files and compiled
release JSON are supported. Separately pinned animation references are discovered in
compiled JSON, recorded in receipts, and mirrored even when resuming a partial run.

Files are addressed internally by their Git blob identity and deduplicated across
paths, revisions and repositories. The publisher verifies the Git object identity
and length, supplies Content-MD5 (validated by R2), verifies the returned single-PUT
ETag and stores SHA-256 metadata. All writes are create-only; racing writes must
match length, ETag and SHA-256. Nothing is overwritten or deleted.

Directory indexes carry the original paths and lengths. A readiness receipt records
their SHA-256 digests and is written **last**, after every file and index succeeds.
Partial uploads never advertise readiness. The reader verifies index digests, limits
metadata bodies and retains at most 8 MB of metadata in memory; media bodies stream.
It supports CORS, byte ranges for audio, HEAD, ETags and one-year immutable caching.
Cloudflare's edge cache holds successful complete responses. Errors are never cached.
`Timing-Allow-Origin` permits browser resource timing for the new origin.

## Publication

`Mirror public GitHub assets to R2` is dispatched manually for bootstrap and runs
every six hours thereafter. It covers the verified live manifest and the deployment's
bundled pins. Existing ready revisions cost one receipt read and need no Git fetch,
object listing or writes. New revisions reuse a bounded Git cache and upload only
new blobs, with eight concurrent operations and a 64 MB per-file limit.

Before client cutover, the data repository's Content release workflow must invoke
the same audited publisher after validation and **before** updating `live/current.json`.
The public data repository keeps a self-contained copy in `tools/asset-publisher`,
with its own pinned dependency lock and source provenance. It needs no access to the
private application repository. Keep the two publisher/contract copies synchronized.
It mirrors that release's media pins and compiled JSON revision; a mirror failure
keeps the existing live pointer. Rollbacks use the same check and retained bytes.
Application deployments run `scripts/deploy/check-public-assets-ready.mjs` after the
build has adopted its pins. It checks bundled/live sources and referenced animation
commits against the public reader before either www or Preview is published.

The `public-assets` GitHub environment permits main only. Its R2 S3 credentials are
restricted to object read/write in this bucket. The separate deploy credential edits
only `arkpedia-assets`. Secrets are supplied only to publishing/deployment steps,
never PR tests or dependency installation. Data-repository publication needs the
same bucket-scoped object credentials in its own main-only environment.

## Retention, costs and acceptance

Keep all published blobs, indexes and readiness receipts. There is deliberately no
garbage collector: a held tab or rollback can still reference an old commit. Changed
bytes consume additional storage; unchanged revisions and duplicate files do not.
Revisit retention only with deployment reachability evidence and a reviewed policy.

The 2026-10-27 bundled snapshot inventories roughly 10.3 GB of images, skin originals,
variants and voices before JSON and animation repositories (roughly another 1–2 GB);
live and bundled pins may add changed bytes. R2
Standard storage is USD 0.015/GB-month, Class A operations USD 4.50/million and Class B
USD 0.36/million, with account-wide monthly allowances of 10 GB, 1 million A and
10 million B operations. Egress is free. Existing page-cache usage shares those
allowances. These are estimates, not a spend cap or a guarantee of zero cost.
See [Cloudflare pricing](https://developers.cloudflare.com/r2/pricing/).

Before switching www and Preview, require remote receipts for every active pin,
byte-identical image/original/variant/audio/JSON samples, range/ETag/cache/error tests,
real browser requests on both sites and a reversible origin-only application change.
Record the GitHub source commits, reader version and receipts with release evidence.
The broader Preview redesign and isolated account storage remain separate.
