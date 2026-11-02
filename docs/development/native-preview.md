# Native redesign Preview

Current retirement decision: [Vercel retirement and Cloudflare recovery](vercel-retirement.md)
supersedes the historical Vercel-retention instructions below.

The native Cloudflare Preview reviews UI changes before checked-main production
releases. Google/Discord sign-in, Arkpedia profiles and cloud saves remain exclusive
to Preview; production keeps local profile pictures, game imports and browser data.
Its Worker Preview is named `arkpedia` under the existing `arkpedia` Worker. Publish
with the manual Build and publish Cloudflare Preview workflow using an immutable
full source SHA. This does not change production traffic.

`wrangler.preview.jsonc` is exclusively for `wrangler preview`; never deploy it
with `wrangler deploy`. It binds `arkpedia-preview-cache`, an automatically
isolated Durable Object namespace, and the separately approved
`arkpedia-preview-accounts` database (`7d9cdfb2-2203-4708-bad5-f357d2c105b2`).
Dedicated Preview rate-limit bindings protect account ingress before database work.
There is no production database or service binding. The database is configured
only under `previews.d1_databases`. The publication workflow verifies a recovery
bookmark before applying pending additive account migrations to this exact database.
The wrapper in `scripts/deploy/preview-worker.mjs` injects `ctx.exports.PreviewSelf`
for both normal requests and queued revalidation. A normal service binding would
call the live deployment from a native Preview.

The existing internal `staging` build role means noindex and analytics disabled;
it is retained for build compatibility. The user-facing environment is Preview.
Twitch/YouTube credentials are Preview secrets, maintained separately from live.
Account credentials are configured separately for Preview.

Google/Discord accounts, profiles and cloud saves have separate Preview and production storage.
The isolated database, new session secret and Google/Discord client IDs are
configured on Preview. The required provider callbacks are
`https://preview.arkpedia.net/api/auth/callback/google` and
`https://preview.arkpedia.net/api/auth/callback/discord` callbacks. On 2026-10-31, read-only inspection confirmed both provider secrets
are present and the isolated account tables already exist. The Preview configuration
restores the missing D1 binding and auth origin alongside the base optimizer.
Secret presence does not establish completed provider sign-in acceptance. Do not
paste secret values into issues or copy live account data. Do not proxy Preview account APIs
into the live Worker/database. The edge forwards account cookies only to the
fixed isolated native Preview upstream and marks responses private/no-store.

The workflow builds on Linux without provider credentials, packages the exact
source, verifies its checksum and clean build identity, and publishes from a
separate job using the fixed native Preview command. Only focused isolation
checks are part of this demo publication; this is not a full release acceptance.
The standard production checks remain separate.

### Preview database publication credential

The recovery/migration step requires the separate GitHub Actions secret
`ARKPEDIA_PREVIEW_D1_API_TOKEN`. It never falls back to the production/pilot
Worker token, and the database token is not passed to installation, building or
Worker publication. The Worker token keeps its existing permissions.

The database token needs D1 access for recovery bookmarks and schema migrations
(D1 Write for migrations) in account `1ff51c10571eaa9934bc451e1bfdb361`.
Cloudflare lists D1 permissions under account scope; do not describe a token as
database-restricted unless the provider actually enforces that restriction.
Review the exact available resource scope and obtain explicit approval before
creating persistent access. Prefer a dedicated token with a bounded expiry and
no Worker, DNS, R2 or token-management permissions. Never put a developer's
Wrangler OAuth session into GitHub secrets.

The migration configuration still validates the exact isolated Preview database
before sending any authorized request. These code checks do not narrow a token's
provider-side permissions. Missing authorization or HTTP 401/403 stops publication;
do not bypass the recovery check. After configuring the secret, rerun the workflow
for checked immutable Preview source and verify both recovery and publication.

References: [Cloudflare API permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/),
[D1 recovery bookmark](https://developers.cloudflare.com/api/resources/d1/subresources/database/subresources/time_travel/methods/get_bookmark/).

The public URL is `https://preview.arkpedia.net`; its fixed upstream is
`https://arkpedia-gins-arkpedia.cloudflare-1ff.workers.dev`. The technical
`staging` build role is retained only for noindex/analytics compatibility.

The old controller, staging workflow/config/helpers and their dedicated tests are
removed. Live release validation uses shared provider utilities instead of
importing the retired staging adapter. Keep unreleased source on the redesign
branch when pruning superseded branches.

On 2026-10-26, PR #794 disabled production accounts at the server boundary and
retired the `arkpedia-cf.mocchibird.com` custom domain and edge route. The
application Worker remains `arkpedia`, serving canonical `www.arkpedia.net`.
Vercel remains online as a rollback target, including its `.well-known` route
exception. Historical release-recovery origins do not represent active domains.
