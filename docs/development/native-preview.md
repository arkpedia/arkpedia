# Native redesign Preview

The redesign is reviewed independently of the live www / Cloudflare copy. Its
native Cloudflare Worker Preview is named `arkpedia` under the existing `arkpedia`
Worker. Publish with the manual Build and publish Cloudflare Preview workflow,
using an immutable full source SHA on the redesign branch. This does not merge the
redesign into main or change production traffic.

`wrangler.preview.jsonc` is exclusively for `wrangler preview`; never deploy it
with `wrangler deploy`. It binds `arkpedia-preview-cache`, an automatically
isolated Durable Object namespace, and the separately approved empty
`arkpedia-preview-accounts` database (`7d9cdfb2-2203-4708-bad5-f357d2c105b2`).
There is no production database or service binding. The database is configured
only under `previews.d1_databases`; its three account migrations have been applied.
The wrapper in `scripts/deploy/preview-worker.mjs` injects `ctx.exports.PreviewSelf`
for both normal requests and queued revalidation. A normal service binding would
call the live deployment from a native Preview.

The existing internal `staging` build role means noindex and analytics disabled;
it is retained for build compatibility. The user-facing environment is Preview.
Twitch/YouTube credentials are Preview secrets, maintained separately from live.
Account credentials are configured separately for Preview.

Google/Discord accounts, profiles and cloud saves are Preview-only features.
The isolated database, new session secret and Google/Discord client IDs are
configured on Preview. Both providers retain only their respective
`https://preview.arkpedia.net/api/auth/callback/google` and
`https://preview.arkpedia.net/api/auth/callback/discord` callbacks. Login remains
unavailable until the owner enters `GOOGLE_CLIENT_SECRET` and
`DISCORD_CLIENT_SECRET` directly into native Preview secrets. Do not paste these
values into issues or copy live account data. Do not proxy Preview account APIs
into the live Worker/database. The edge forwards account cookies only to the
fixed isolated native Preview upstream and marks responses private/no-store.

The workflow builds on Linux without provider credentials, packages the exact
source, verifies its checksum and clean build identity, and publishes from a
separate job using the fixed native Preview command. Only focused isolation
checks are part of this demo publication; this is not a full release acceptance.
The standard production checks remain separate.

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
