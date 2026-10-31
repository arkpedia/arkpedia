# Arkpedia accounts

Current deployment boundary and recommendation: [2026-10-30 cost/security review](account-cost-security-review.md). Accounts are Preview-only on the native Cloudflare staging deployment, with isolated account storage. The pilot and staging-disabled configuration descriptions below are historical migration notes; they are not instructions to re-enable the retired pilot or bind Preview to production data. The current `accountsEnv()` implementation and `AGENTS.md` own the deployment gate.

The accepted account implementation uses Better Auth 1.7.12, Google/Discord and a
native Cloudflare D1 binding. It is being integrated selectively into main from
Cloudflare source `de829d1e`; this document does not claim a completed main release.
Vercel and isolated staging have no account binding: APIs return private/no-store
503 and browser-only imports, plans, backups and music remain available.

The existing pilot is on `arkpedia-cf.mocchibird.com`. Its D1 migrations 001–003
have already been applied. Do not reset that database or rerun its ALTER statements.
R2 page/audio caches never store account records or credentials.

For PR #770, accounts stay on that pilot. Main integration does not enable accounts
on `www.arkpedia.net` or move pilot users. No new D1 database, OAuth application,
callback registration, secret or DNS change is required for this integration.
Production hostname and database migration remain separate decisions.

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

The main production Worker config and production D1 choice are separate reviewed
hosting work. Do not add accounts to `wrangler.preview.jsonc`: it deliberately
isolates writable resources and disables login. An authenticated alternate host
needs its own reviewed role and noindex policy.

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
