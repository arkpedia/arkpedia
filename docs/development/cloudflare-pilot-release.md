# Checked-main releases to the migration pilot

This workflow is prepared but disabled. It targets only the existing `arkpedia`
Worker at `https://arkpedia-cf.mocchibird.com`. It does not move `arkpedia.net`,
change DNS, create resources, apply D1 migrations, write secrets or publish data.
Vercel remains the public production host during the migration.

## Release owner and authorization

`cloudflare-pilot-release.yml` runs after a successful main push Check, or an
explicit retry naming that Check. `ARKPEDIA_PILOT_RELEASES_ENABLED` must be exactly
`true`; it is not enabled by this change. No provider credential is configured by
this change. The existing native Cloudflare Git build must be disabled before
enabling this workflow. Keep one production build/deploy owner for this Worker.

The read-only gate independently fetches the canonical Check workflow, exact run,
complete job inventory and current main tip. It rejects forks, pull-request runs,
failed/incomplete runs, stale sources and green setup without actual application
validation or the existing exact-tree reuse step. This does not assume paid GitHub
branch-protection features exist. The gate runs before installation and again
immediately before publication, inside a non-cancelling production concurrency lock.

The workflow installs pinned dependencies and builds once on the existing NAS build
runner. The build has no provider token. Only the release step receives the future
`ARKPEDIA_PILOT_API_TOKEN`, scoped to editing this existing Worker. Reuse the scoped
staging credential pattern, with a bounded expiry and the pilot as the sole Worker.
Creating persistent access requires the user's explicit credential approval. Do not
reuse the staging token, grant account-wide Worker access, or grant D1/R2 writes.
If deployment needs additional permissions, stop and review the exact denied call.

## Resource and content contract

The strict root configuration validator and live provider checks preserve:

- Existing account D1 `f7daff77-8e8f-4ec2-998b-97fb6e4b948f`; no SQL is executed.
- Exact pilot auth origin, five existing secret bindings, and provider callbacks.
  `BETTER_AUTH_SECRET` must keep its value because existing provider rows use it.
- Existing `arkpedia-opennext-cache`, queue namespace/class/migration tag and self
  service reference. No staging, edge or relay resource is a release target.
- Schema2 and production role. The exact old version066ea33d/source de829d1e uses
  `dev-live`; reviewed main builds use `live`. Only that recorded legacy version
  receives the compatibility exception. Old-tab/data and account archive retention
  must be accepted across this transition before the pilot is considered ready.

The release must have a clean build identity matching its checked source and code
fingerprint. Live version metadata must retain the expected bindings. New releases
carry canonical source/fingerprint/Check/previous-version ownership annotations.
Health verifies public identity, five noindex pages and configured account APIs.
Better Auth's session response uses `no-store`; Arkpedia's saved-data APIs also
require `private`. Unbound staging tests do not prove real OAuth/D1 acceptance.

## First controlled release

1. Finish the main-based hosting PR's exact CI and isolated preview acceptance.
   Preserve the original pilot version/build identity and the accounts owner's
   applied migrations001–003 and archive/CAS/nonce/ownership contracts.
2. Finish this workflow's own reviewed Check and isolated preview. Confirm the
   current public Vercel release remains healthy. Keep main stable during the first
   pilot release and configured-account acceptance.
3. Before merging, with explicit approval, create the Worker-scoped expiring credential and GitHub
   secret. Verify the old native production build owner is disabled; record that
   provider observation, let any in-flight native builds finish, then recheck the
   actual version. Leave relay and staging settings unchanged.
4. Enable `ARKPEDIA_PILOT_RELEASES_ENABLED` and merge the reviewed workflow. Its
   successful current-main push Check starts the controlled pilot release. If the
   automatic handoff does not start, inspect it before explicitly retrying on main
   with that Check ID. This is not public-domain cutover. Retain the receipt and
   actual deployed proof. Retrying an already healthy exact release reuses it.
5. Verify real signed-in state, auto-sync, provider linking and old/new-tab archive
   union/revisions with the accounts owner. Verify actual analytics hostname and
   ingestion, content/old-tab compatibility and the affected browser journeys.
   Basic automatic health alone does not satisfy these gates.
6. After acceptance, normal checked main releases may flow automatically. Keep
   Vercel, DNS, branch retirement, cost/traffic soak and final public-domain rollback
   behind the simplification plan's separate gates.

For an explicit retry:

```sh
gh workflow run cloudflare-pilot-release.yml --ref main -f check_run=CHECK_RUN_ID
```

It still requires the exact current main source and a complete successful push Check; an old green run is not approval
for newer code. If main advanced, validate the new current source before retrying.

## Failures and rollback

The adapter rechecks live ownership just before upload. It verifies the deployed
provider version and public build before success. If upload response or health
fails, it rereads the provider and restores the previous version only when the
current canonical annotation proves this release owns it. An unchanged upload
requires no rollback. A foreign/manual change requires reconciliation; it is never
blindly overwritten. A recovered failure still fails the Actions run.

Automatic recovery restores code/configuration only. D1/R2 state is neither reset
nor deleted, and recovery is not an account-data migration rollback. Cloudflare has
no atomic cross-client compare-and-swap here: the workflow lock plus disabled native
owner prevents routine competing releases, while actual owner checks guard known
manual changes. Avoid manual deployments during a release.

`config/production.json` registers the pilot as an additional main content reader,
not a Vercel upload target. Publication waits for both Vercel and this reader to
serve the generator's exact fingerprint/channel/schema. Consequently, merging
this change holds new main data publication until the first pilot release succeeds;
prepare the approved credential and disable/drain the old build owner before that
merge. Readers continue serving the previously published data while it is held.
The separate API-only completion job resumes a held release only after all readers
match and main remains unchanged. If Vercel finishes later, its existing held-release
retry remains responsible; the content workflow always rechecks before publication.

The pilot currently has no release-refresh credential. Its reader explicitly has
`refresh: false`, so the publisher never sends the Vercel refresh secret to it.
The pilot uses its normal ISR intervals for data freshness. Evaluate authenticated
refresh and actual propagation latency before final production migration; this
change does not silently create or share another credential.

The small success/failure receipt is retained for seven days. It contains public
build/version provenance and recovery outcome, not secret values or account data.
Do not retry a failed provider upload blindly: inspect the receipt and actual
version first. Disable the workflow flag before changing its deployment ownership.
