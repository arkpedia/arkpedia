# Arkpedia accounts

Current deployment boundary and recommendation: [2026-10-30 cost/security review](account-cost-security-review.md). Accounts are Preview-only on the native Cloudflare staging deployment, with isolated account storage. The pilot and staging-disabled configuration descriptions below are historical migration notes; they are not instructions to re-enable the retired pilot or bind Preview to production data. The current `accountsEnv()` implementation and `AGENTS.md` own the deployment gate.

The account implementation uses Better Auth 1.7.12, Google/Discord and a
native Cloudflare D1 binding. Preview binds only `arkpedia-preview-accounts`
(`7d9cdfb2-2203-4708-bad5-f357d2c105b2`) under `previews.d1_databases` in
`wrangler.preview.jsonc`, with `https://preview.arkpedia.net` as the auth origin.
Its existing account tables and provider secret names were verified on 2026-10-31;
restoring the missing binding requires no new database, migration or secret rotation.
Production rejects account APIs even when bindings and credentials are present.
Browser-only imports, plans, backups and music remain available everywhere.

The retired pilot used `arkpedia-cf.mocchibird.com`. Preserve its retained database,
identities and secrets; never attach that database to Preview or copy its users.
R2 page/audio caches never store account records or credentials.

## Saving and privacy

Saving has three independent categories: personal settings/plans, pull history,
and imported game snapshots. History and game snapshots require their own opt-in;
disabling either must not revoke the other. Confirm category removal. Deleting all
cloud saves also removes the archive and pauses saving on every device.

Yostar email, codes, tokens and device identity stay browser-local. A closed upload
key list and recursive credential rejection protect the API. Provider login/session
storage is separate; OAuth tokens are encrypted and requests must not be logged.
Never include account data in public content releases, static payloads or analytics.

New users explicitly choose a unique username. Google/Discord names and pictures
are not their public profile. An imported Doctor name is only an explicit suggestion;
optional friend tag/server data is private and does not prove game-account ownership.
AccountActions owns the single login/setup/settings popup. Sign-in returns to the
originating same-site route, preserving its filters and anchor. A new user chooses
a username, resolves any save conflict, then reviews independent saving choices
and selects Done. Friend tags and pictures are optional later settings. Existing
accounts skip creation. A per-user, tab-local session marker resumes an unfinished
saving step after reload; Done or closing that step clears it. This marker is not
cloud data and does not grant authentication or enable saving. Existing consent,
paused saves and deletion protections are unchanged. The setup screen discloses
personal saving's existing default before continuing.

Provider linking requires an existing account and cannot remove the last login.
Deletion requires typed confirmation and a fresh provider session.

Pull archives use account/server/game UID namespaces, retaining an unknown-UID
legacy namespace. Union preserves maximum known draw multiplicity rather than
deduplicating repeated operators. Bounded chunk uploads, revision/nonce CAS and
owner-qualified archive revision checks protect concurrent devices and account
switches. An import archives earlier history before replacing its game snapshot.

Visible/focused clients automatically sync selected locally held data at 15-second
intervals. This never fetches Yostar history. Import regularly inside its 90-day
window. Restore remounts only page content; theme and player preferences update via
the restore event while the music engine stays mounted.

## Configuration and deployment boundaries

The Worker needs `ARKPEDIA_ACCOUNTS_DB`, the exact `ARKPEDIA_AUTH_URL` origin,
`BETTER_AUTH_SECRET` (at least 32 characters), and configured provider client IDs
and secrets. Keep secrets in Worker runtime configuration, never public build vars
or committed files. `.dev.vars.example` lists local names without real credentials.
Register each exact `/api/auth/callback/google` and `/api/auth/callback/discord`
URL with its provider. A different hostname's cookies do not transfer sessions.

Production accounts remain disabled. `wrangler.preview.jsonc` allows only the
fixed isolated Preview database; the isolation checks reject any other database
and any service binding. Keep the staging role and noindex policy. Publish only
with the native Preview workflow, never `wrangler deploy` with this config.

For a reviewed account-enabled configuration with an empty D1 array, the helper
prepares only its non-secret binding and origin:

```sh
node scripts/accounts/configure.mjs --config <reviewed-config.jsonc> --database-id <uuid> --database-name <reviewed-name> --origin https://<exact-host>
```

All options are explicit; the file must be inside this checkout. Existing bindings
and isolated staging are refused. Review the resulting diff before any deployment.
The helper creates no remote resource and never migrates data or copies secrets.

For a fresh approved database apply 001 → 002 → 003 once; for the pilot inspect its
migration ledger. Decide explicitly whether production retains the pilot database
or uses a validated copy/new database. Before a copy, preserve identities, provider
links, profiles, consent, revisions, complete archive and encrypted-token secret
compatibility; validate row counts, ownership, multiplicity and cascades on a copy.
Never silently create replacement user identities during canonical-host migration.

## Verification

`scripts/tests/test-cloud-accounts.ts` exercises real local SQLite through the D1
adapter: migrations/backfill, auth schema, origin and owner isolation, consent/CAS
races, profile uniqueness, archive retention and deletion. Browser tests cover
onboarding, independent saving, account switches, reauthentication, unavailable
deployments and playback-safe restore. Mocked browser auth is not provider acceptance.

Package and validate both Vercel and native Worker roles. Preserve the main route
taxonomy, Vercel analytics until cutover, and independently pinned provider artwork.
Real OAuth/login/link/restore/delete acceptance on the exact candidate hostname,
old/new clients and rollback safety remain required before production promotion.
See [the promotion review](account-main-promotion-review.md) and
[the migration plan](system-simplification-plan.md) for the remaining gates.

## Preview hardening — 2026-11-01

`server.ts` requires a session created within five minutes for `/link-social` and
`/revoke-other-sessions`, checked against server-side session storage. The existing
fresh-session requirements for unlinking/deletion remain. Account settings offers
**Sign out other devices** and directs stale sessions to an already linked provider.
A provider return does not automatically perform the requested sensitive action.

Native Preview ingress rejects excessive account traffic before calling the app:
6,000 requests/minute per Cloudflare location overall and 300/minute per individual
Cloudflare-supplied IP. Cross-zone Worker requests share a Cloudflare IP and use only
the aggregate cap. These Cloudflare limits are approximate and are not a global
spending cap. Never trust a client-supplied forwarded IP to bypass the aggregate cap.
Only Preview binds the dedicated `2026110101` and `2026110102` rate namespaces.

Authenticated custom APIs additionally use atomic D1 limits across all locations
and devices: 120 cloud reads, 60 cloud writes, 30 profile operations and 10 removals
per account per minute. Removal has its own allowance. Counters are bounded to four
rows per account and cascade on account deletion. Responses include `Retry-After`;
cloud sync waits before retrying throttled/unavailable requests. Existing 15-second
successful polling is unchanged; revision-only polling remains a cost improvement.

Migration `0004_account_protection.sql` adds the counters and archive usage tracking.
Archive growth is bounded to 64 game-account namespaces, 100,000 draws and 16 MiB of
accounted row content (including a fixed per-row allowance), whichever is reached
first. This is a payload quota, not total D1 disk usage including indexes. The
900 KB snapshot/upload limits remain. Triggers maintain usage transactionally;
quota failure rolls back the full save batch, including its revision. Re-importing
known rows does not consume duplicate quota. Consent withdrawal/deletion reclaims
space. Existing over-quota records survive migration unchanged; new growth is
refused and the reader can export before deleting cloud data. No old migration is
rerun and no existing identity, provider link or secret is replaced.

Preview responses enforce a seven-day HSTS policy without `includeSubDomains` or
preload, plus CSP restrictions on objects, framing, base URLs and form targets.
Script restrictions are **report-only**, observed during browser QA; they are not
an enforced XSS barrier yet. No CSP reports or reader URLs are sent to a third party.
Do not enforce the script policy until inline bootstrap scripts and external players
have been checked across the static/ISR site. The wrapper preserves `no-referrer`
on auth endpoints, including after Next's shared headers.

### Recovery and acceptance

The Preview publication workflow verifies a D1 Time Travel bookmark through its dedicated API endpoint before applying
pending migrations to the fixed isolated Preview database, then publishes the same
checked source. The bookmark stays in the runner's temporary recovery file; do not
log account data or credentials. A temporary migration-only configuration exposes exactly the verified Preview binding to Wrangler, whose migration command does not read nested `previews` bindings. If recovery verification fails, migration and
publication stop. Inspect the provider's current Time Travel retention before an
incident; do not assume backups last forever.

A code rollback may leave the additive schema in place. Do not restore the active
database merely to roll back code: doing so can discard later saves. An intentional
incident restore needs a chosen recovery point and preservation of subsequent data.
Keep the auth encryption secret available; replacing it can invalidate sessions or
make stored provider tokens unreadable. Do not copy Preview data into production.

The SQLite/D1-adapter tests exercise limits, quota rollback, preservation of old data,
session expiry/revocation and restoration of a synthetic database backup with its
identities, provider links, session and saves. They do not prove a hosted restore
or a real provider login. Complete Google/Discord round trips, link/unlink and
cross-device restore/deletion on disposable accounts remain manual acceptance.
