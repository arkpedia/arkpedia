# Isolated Cloudflare staging proof

## Preview controller implementation status

The root-owned `codex/preview-controller` branch implements a controller candidate;
its workflow is not yet released or enabled. The pure lifecycle policy in
`scripts/deploy/preview-lifecycle.mjs` has no provider I/O. The separate controller
and fixed-target provider adapter can publish or retire only `arkpedia-staging`.
Tests cover stale requests, foreign/expired build inputs, exact public identity,
ownership changes, interrupted upload recovery and old-PR retirement races.
The existing #765 artifact/remote proof remains tied to c49600f5; it is not proof
that this newer controller source has been built or deployed.

One shared staging slot is the initial target. Publication and retirement must use
the same non-cancelling workflow concurrency group. A persisted ownership record
must identify the PR, full source/tree, build run/artifact/checksum, public identity,
actual provider version and original baseline version. Preserve that original
baseline when another PR replaces the slot; retirement must never resurrect a
previous PR. Read the current PR and provider version again inside the lock before
any mutation. A close event for a different owner does nothing. Manual provider
changes require reconciliation rather than blind rollback.

The policy validates provenance observations, not their authenticity. Before any
deployment, the trusted main controller still has to fetch those observations
itself, use the existing exact-tree full/selected Check verifier and baseline
revalidation, verify/extract the archive with the separately reviewed configuration,
and test the actual Worker-scoped credential. A successful build/receipt alone does
not approve application code. Never execute a feature checkout's deployment helper
with the provider token. Persist ownership only after exact deployed identity and
health verification; handle failures by checking version ownership before rollback.
Retirement rolls back only the matching owned version. It never deletes R2 objects,
the shared Worker or its Durable Object namespace.

The candidate includes the GitHub/provider adapter, non-cancelling workflow lock
and failure recovery. Real end-to-end publish/update/retire and Worker-scoped CI
credential proof remain open, so the plan's workflow checkbox remains unchecked.

`scripts/deploy/preview-check.mjs` connects that policy to the existing full-browser
and selected-proof validators. It requires a successful Check for the exact source
and PR, an exact-tree artifact, actual successful job steps, and complete API
inventories. Selected/no-impact proof additionally hashes the source policy blobs,
validates its execution ledger and revalidates its recorded full baseline/ancestry.
It performs no deployment and takes an API reader and bounded JSON artifact reader
from the trusted adapter. Failed, draft-only, stale-policy and orphaned
baseline evidence is refused. It does not replace the standard CI impact planner.

A read-only GitHub adapter is available from the trusted controller checkout:

```sh
node scripts/deploy/preview-github.mjs PR_NUMBER FULL_SOURCE_SHA CHECK_RUN_ID
```

This needs GitHub CLI authentication, Node and Python; no Cloudflare token. It reads
the current ready main-targeted PR before and after verification, so a concurrent
push is refused. Policy artifacts are downloaded directly into bounded memory and
parsed as a single `browser-evidence.json` ZIP member without extracting files.
Links, additional/duplicate files, unsafe names and oversized compressed/expanded
payloads are rejected. Actual CF artifact 12583703976 was read successfully with
248 selected/1,471 omitted cases; that proves the reader, not main authorization.
An actual preflight of unfinished main run 40157028703 correctly refused approval.
When that same run finished, preflight accepted actual full artifact 12584763953
and tree f33eb8642bfcf5e7786cdcf04fbbcf580de9faed; #767 then merged as f9a7bcb3.

### Publication, ownership and retirement

From the trusted checkout, the controller accepts these explicit operations:

```sh
node scripts/deploy/preview-controller.mjs publish PR_NUMBER FULL_SOURCE_SHA CHECK_RUN_ID BUILD_RUN_ID ARTIFACT_ID
node scripts/deploy/preview-controller.mjs retire PR_NUMBER
```

The `closed` operation is reserved for automatic closed-PR handling and requires
the actual current PR to be closed. An explicitly requested `retire` may remove an
open PR's preview. Both operations leave another PR's preview alone. Local OAuth
proof requires the explicit `--local-oauth` argument; CI requires the staging token.

Cloudflare's existing version annotations store publication intent, including the
original baseline and Check/build/artifact identities. No additional database,
GitHub deployment ledger or R2 state object is needed. Metadata must fit within
the provider's 1,000-byte message limit; silent truncation is refused on read.
[Version annotations](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/create/).
Intent is not a persisted health assertion: the controller independently verifies
the current public build and core-route health before accepting an owned preview.
It also validates the exact six staging bindings and original queue namespace.
An unknown/manual version, split rollout or changed resources requires reconciliation.

The reviewed original baseline is version `591c4728-48b9-4058-b035-9b95cea0e9c4`,
source 19b51e89. Changing it requires a reviewed controller change. Publication uses
trusted Wrangler directly with `OPEN_NEXT_DEPLOY=true`, without executing the
artifact's OpenNext configuration or populating its prerender cache. The extractor
verifies the complete original archive/receipt/config before omitting only
`.open-next/cache` from the fresh extraction. Path/link/size checks still apply to
omitted members. Assets and Worker files are retained. Cold rendering/revalidation
and rollback were independently proved with the earlier c496 staging artifact.

The workflow checks out its own trusted workflow SHA, installs only that checkout's
locked dependencies before exposing the token, and never checks out a feature head.
It downloads and verifies the existing explicit build; it does not rebuild the app.
All automation shares `arkpedia-staging-slot` with cancellation disabled. Provider
version checks surround mutations and health verification; they are not an atomic
compare-and-swap against concurrent manual provider writes. Once enabled, use this
controller for staging updates and retirements.

Setup after acceptance: configure repository secret `ARKPEDIA_STAGING_API_TOKEN`
with Editor access only to the existing staging Worker, then prove its deploy/read/
rollback permissions. Do not grant production Worker or R2 object-write privileges
to fix a failed permission test. Enable repository variable
`ARKPEDIA_PREVIEWS_ENABLED=true` only after the real end-to-end proof. Until then,
automatic closed-PR handling is skipped; manual dispatch requires main and a token.
No enablement or token creation is performed by this branch.

## Existing explicit staging helper

Migration work uses `wrangler.staging.jsonc` and the explicit helper
`node scripts/deploy/cloudflare-staging.mjs check|build|deploy`.

The staging Worker is `arkpedia-staging`, with cache bucket
`arkpedia-staging-cache` and a self-reference to itself. It has its own Durable
Object namespace and no custom-domain routes or database binding. It reads the
existing `live` content pointer without publishing to it. This main-based candidate is a staging
environment deployed from a feature branch, not another permanent Git branch.

The helper rejects production resources and unknown config fields. Build and deploy
both set the content channel explicitly; environment-specific values must not be
inferred from the local branch name. `ARKPEDIA_DEPLOYMENT_ROLE=staging` emits noindex
independently of the data channel and disables production analytics. Vercel's normal
production build keeps its existing output and analytics. Build metadata records
the role; deploy refuses dirty output, a different commit, or a missing/wrong role/channel.
The dedicated staging host does not exercise the production front edge Worker.

The first Cloudflare-branch proof used `dev-live`. This candidate tests main code
against its compatible `live` data without promoting unreleased dev routes or features.
It adds no production Worker config, database or OAuth bindings.

Build on the existing Linux NAS, since the Windows OpenNext build
failed the deployment-trace audit. Keep that audit; do not bypass it. The temporary
`Build Cloudflare staging` workflow creates a one-day private artifact and deploys
nothing. It needs no provider credentials. Review the build commit and config before
using local Wrangler OAuth to deploy the downloaded `.open-next` output. Do not run
plain `wrangler deploy`; use the explicit helper and review its expected target.

Each new build artifact includes `arkpedia-staging-receipt.json`: the exact source
commit/run, clean Worker/public build identity, schema/channel/role, archive SHA256,
reviewed staging-config hash and expanded size. The receipt is generated only after
the real Linux build. It records provenance and integrity; it is not a signature,
proof of browser acceptance or permission to execute an unreviewed artifact.

Download both files from the same successful `Build Cloudflare staging` run in
`arkpedia/arkpedia`. Independently confirm that run's source commit and the feature's
required Check/review. Use the verifier from the trusted checkout and its separately
reviewed `wrangler.staging.jsonc`, with the exact expected commit/run (never infer
the expected identity from the downloaded receipt):

```sh
python scripts/deploy/staging-artifact.py verify \
  --archive /path/to/arkpedia-staging.tgz \
  --receipt /path/to/arkpedia-staging-receipt.json \
  --commit FULL_REVIEWED_COMMIT_SHA --run REVIEWED_GITHUB_RUN_ID \
  --trusted-config wrangler.staging.jsonc
```

The `extract` action accepts the same arguments plus `--destination /new/directory`.
It validates the complete archive before writing and refuses an existing destination,
links/special files, duplicate/unexpected paths, path escapes and oversized entries.
It never executes the uploaded code or changes a current checkout/build. Use Linux
to extract and deploy real OpenNext output: some cache filenames contain colons and
cannot be represented faithfully as Windows files. Verification itself is portable.
The script normalizes only CRLF/LF for comparing the reviewed configuration.

Retain a separately reviewed staging config when adopting extracted output. OpenNext's
deploy command imports compiled configuration from `.open-next/.build` and can run
it with the deploy process's credentials. Review the source/config/dependency changes
before that step; archive verification is not a sandbox. Do not grant a feature build
production credentials or broaden the staging bindings. The current workflow still
builds only: serialized deployment, preview ownership/retirement and cleanup remain
separate migration work, and no remote deployment is triggered by this receipt step.

```sh
npm run cf:staging:check
npm run cf:staging:build
npm run cf:staging:deploy
```

The main-based helper also checks the existing Worker bundle budget after building.
OpenNext/Wrangler versions match the verified Cloudflare adapter; scoped dependency
overrides patch glob 10.5.0 and Miniflare's undici 7.30.1. The explicit prerelease
Miniflare selector is necessary for npm's override to match its pinned beta version.
The candidate's dependency audit reports zero known vulnerabilities. Keep the adapter
and local Worker proof when removing these overrides after upstream fixes.

Account import needs its exact staging origin added to the relay's reviewed origin
list. A functioning page or public server-list API does not prove authenticated
imports work. Do not broaden relay origins to arbitrary workers.dev hosts.
The main-based browser now selects the existing Cloudflare relay only on the two
reviewed hosts in `config/relay.json`: the pilot custom domain and this staging
Worker. www/dev/unknown hosts keep the VPS path; only those explicit hosts honor
the `?relay=cloudflare`/`?relay=vps` diagnostic choice. The existing relay already
allows the staging origin; no relay deployment or new container is required.

Proof acceptance: static assets, representative rendered pages, noindex, expected
build identity/channel, ISR and revalidation confined to staging, content-only updates,
and the affected browser journeys. The staging environment does not yet include
unreleased cloud-account/D1 work being developed separately.

This is the first migration proof. After it passes, decide whether native Worker
Previews can replace this explicit staging Worker without losing self-call/resource
isolation. The current production branch/deployment chain remains unchanged until
that decision and the code-consolidation milestones are implemented.
