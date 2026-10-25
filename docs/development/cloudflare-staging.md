# Isolated Cloudflare staging proof

## Preview controller implementation status

The root-owned `codex/preview-controller` branch adds an inactive lifecycle policy
in `scripts/deploy/preview-lifecycle.mjs`. It does not deploy, read credentials or
create provider resources. Its tests cover stale requests, foreign/expired build
inputs, exact public identity, ownership changes and old-PR retirement races.
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

The GitHub/provider adapter, shared workflow lock, durable ownership storage,
failure recovery and end-to-end publish/update/retire proof remain to implement.
The plan's preview-workflow acceptance checkbox remains open.

`scripts/deploy/preview-check.mjs` connects that policy to the existing full-browser
and selected-proof validators. It requires a successful Check for the exact source
and PR, an exact-tree artifact, actual successful job steps, and complete API
inventories. Selected/no-impact proof additionally hashes the source policy blobs,
validates its execution ledger and revalidates its recorded full baseline/ancestry.
It performs no deployment and takes an API reader and bounded JSON artifact reader
from the future trusted adapter. Failed, draft-only, stale-policy and orphaned
baseline evidence is refused. It does not replace the standard CI impact planner.

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
