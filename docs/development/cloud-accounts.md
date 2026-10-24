# Arkpedia accounts on the Cloudflare branch

This implementation is for the Cloudflare deployment only. It uses Better Auth
1.7.12, Google/Discord login and a native D1 binding. Vercel deployments without
that binding show accounts as unavailable and keep browser-only features working.
The existing R2 bucket remains a page/audio cache, never an account database.

## Independent saving and the pull archive

Saving has three independent categories: personal settings/plans (on by default),
pull history (opt-in), and imported game snapshots (opt-in). Disabling a category
requires confirmation and removes that category's active cloud data; browser data
stays. Disabling game snapshots does not revoke history, or vice versa. Deleting
all cloud saves also deletes the archive and pauses saving on every device.

Migration `0003_pull_archives.sql` preserves existing consent: accounts that had
enabled full game saving retain history saving. It copies their existing pulls
into `pull_archive_account` / `pull_archive_row` before snapshots can be replaced.
Old records without a UID remain in a separate legacy archive for their server.
Known UIDs and servers are isolated; Arkpedia's user ID owns every cloud row.

Pull archives are separate from the 900 KB replaceable snapshot. Uploads send
small batches and only unknown draw multiplicities. The server keeps the maximum
known number of each operator at each timestamp/banner, so duplicate operators
inside a ten-pull survive but overlapping imports do not grow it. A partial batch
cannot shrink a previously archived one. Original order within a timestamp may
be unavailable. The browser's history parser permits 500,000 rows and refuses an
oversized import explicitly instead of truncating older rows.

`POST /api/cloud-account` merges archive batches without replacing settings or
roster data. A D1 transaction combines the revision CAS with archive upserts; a
unique mutation ID guards every statement so a losing writer cannot mutate an
archive or resurrect a consent deletion. Concurrent clients refetch and retry.
Archives are merged before snapshot choices and restored by union, so selecting
cloud settings preserves older browser pulls. Browser ownership markers prevent
silently uploading another Arkpedia account's history after switching logins.
New clients send `savingVersion: 2` for independent consent controls. Existing open
tabs keep their original combined game/history consent behavior, and histories
inside their snapshot uploads are extracted into the archive before projection.

The account page shows archive count, oldest retained pull, last import and last
cloud save, and can display history without a synced game snapshot. Reimport
before Yostar's rolling 90-day window expires: Arkpedia does not recover already
expired pulls or fetch them on the server. CSV and full backups include retained
history. No Yostar email, code, token, device ID or import-error text is uploaded.

## Usernames and first-time setup

After Google/Discord authentication, accounts without an `arkpedia_profile` choose
their own username once. Existing identities, linked providers and saves retain
their user IDs. Migration `0002_account_profiles.sql` removes provider names/photos
from the identity display fields without removing accounts or saves; new OAuth
users also start with a neutral identity name. Only the chosen profile name is
returned by the cloud-save API.

Usernames support 3–40 normalized Unicode characters, optional numeric #tags, and
case-insensitive uniqueness enforced by D1. Availability checks require login;
concurrent claims are settled by the unique index, not the browser's last check.
An imported Doctor name is a suggestion that the user must explicitly choose.
The optional Arknights friend tag and server are stored separately, privately,
only when submitted. They do not prove ownership or create a public profile and
are independent of consent to sync an imported game snapshot.

Account settings separates Profile, Saving, Logins and Delete data. Import / export
separates Game import, Backups and Browser data. Forget Yostar login removes only
the local remembered login. Clearing browser data first signs out of Arkpedia,
then clears and reloads, so cloud data cannot immediately refill the reset browser.
Deleting cloud saves persists a paused flag across devices/reloads; only an explicit
resume uploads again. Account deletion checks the displayed owner, exact username
confirmation and a recent provider login.

Pilot provisioning on 2026-10-24: `arkpedia-accounts-dev`
(`f7daff77-8e8f-4ec2-998b-97fb6e4b948f`, EU jurisdiction) is already configured in
Wrangler, and `0001_accounts.sql` has been applied to the remote database. The
login origin is `https://arkpedia-cf.mocchibird.com`. Steps 1 and the initial
migration are complete for this pilot; the remaining setup starts with Google.

## 1. Cloudflare: create the pilot database

Keep the pilot separate from production. In Cloudflare, open **Storage & databases →
D1 SQL Database → Create database**. Name it `arkpedia-accounts-dev`. Choose a
jurisdiction deliberately at creation; `EU` is available if you want the database
stored in the EU. A location hint alone does not impose a jurisdiction restriction.
Copy the database UUID from its overview.

Alternatively, with Wrangler signed into the correct Cloudflare account:

```sh
npx wrangler login
npx wrangler d1 create arkpedia-accounts-dev --jurisdiction=eu
```

Use the existing pilot Worker's stable HTTPS address (the `arkpedia` Worker, on
`workers.dev` or your chosen custom domain). Do not use a temporary preview URL.
From this checkout, configure the binding and explicit login origin:

```sh
node scripts/accounts/configure.mjs --database-id YOUR_DATABASE_UUID --database-name arkpedia-accounts-dev --origin https://arkpedia-cf.mocchibird.com
```

This edits `wrangler.jsonc`: `ARKPEDIA_ACCOUNTS_DB` points to D1 and
`ARKPEDIA_AUTH_URL` names the exact origin, with no trailing slash. Review and commit
those non-secret values. The script refuses to replace an existing binding.

Apply the schema before enabling login:

```sh
npx wrangler d1 migrations apply ARKPEDIA_ACCOUNTS_DB --remote
```

There is one application database, shared by users with ownership enforced by the
server's session. Do not create a database for each user, expose a D1 API token to
the browser, or reuse production data for development. To promote later, create
`arkpedia-accounts-prod`, apply its migrations and deliberately switch the binding
and OAuth registrations. Promotion does not automatically copy pilot accounts.

## 2. Google: register a web application

Open [Google Cloud Console](https://console.cloud.google.com/), create/select an
Arkpedia-owned project, then open **Google Auth Platform**.

1. Under **Branding**, use `Arkpedia`, a support email you control, and the app's
   real homepage/privacy-policy links. Do not reuse a Yostar email from an import.
2. Set **Audience** to External. Keep the pilot in Testing and add your Google
   account and other pilot testers as test users.
3. Under **Clients**, create a **Web application** client.
4. Register the exact callback:
   `https://arkpedia-cf.mocchibird.com/api/auth/callback/google`.
5. If an Authorized JavaScript origin is requested, use the app origin:
   `https://arkpedia-cf.mocchibird.com`.
6. Copy the client ID and secret into Cloudflare as described below. Login needs
   basic `openid`, `email`, `profile` identity scopes, not Gmail or Drive access.

Before public signup, complete Google's publishing requirements and switch the
audience out of Testing. Basic login and sensitive Google API access have different
verification requirements; follow the console's actual checks for this app.

## 3. Discord: register an application

Open [Discord Developer Portal](https://discord.com/developers/applications),
create `Arkpedia`, and open its **OAuth2** settings.

1. Add redirect `https://arkpedia-cf.mocchibird.com/api/auth/callback/discord`.
2. Copy the OAuth client ID and client secret. A bot token is not needed.
3. This login uses `identify` and `email`, not messages, servers, or a bot invite.

The provider identity email belongs to Arkpedia authentication. It is separate
from the Yostar email, which our importer never sends to the account API.

## 4. Cloudflare: configure runtime secrets and deploy

Open **Workers & Pages → arkpedia → Settings → Variables and Secrets**. Add these
as secrets (not build-time public variables), or use the commands below:

```sh
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
```

Generate `BETTER_AUTH_SECRET` with a password manager or `openssl rand -base64 48`.
Keep it stable, private and backed up: changing it invalidates sessions and can
prevent decryption of stored Google/Discord OAuth tokens. Never paste secrets into
Git, a PR, this guide, or chat. The OAuth client IDs are public identifiers, but
keeping all five values together as Worker secrets simplifies configuration.

Confirm `ARKPEDIA_AUTH_URL` is a normal Worker variable and the D1 binding is
`ARKPEDIA_ACCOUNTS_DB`. The checked-in Wrangler config should be the source of truth
for these non-secret settings so deployments preserve them.

Deploy the feature branch through the usual Cloudflare build process for review,
then merge its PR into `cloudflare` when checks pass. The pilot's Workers Builds
production branch remains `cloudflare`. For a deliberately manual deployment from
the feature checkout, run `npm run cf:deploy` only when ready to update the pilot.
No deployment to `main` or Vercel is required.

## 5. Test the complete journey

On the pilot's `/account` page:

1. Export current browser data through Import / export.
2. Sign in with Google and choose a username. Accept the imported Doctor-name
   suggestion or enter another available name. Existing saves and login links stay.
3. Change a music like or skin wishlist. Leave the tab open for at least 15 seconds,
   or use **Save now** on the account page. Check another browser, sign in, and
   check that the cloud copy restores automatically on an empty device. If both
   locations already have different saved work, choose which copy to keep explicitly.
4. Under **Account settings → Logins**, link Discord. Sign out, then sign in with Discord: the same
   Arkpedia account and saves should appear. Same-email sign-ins are never implicitly
   linked; a new provider must be linked from the existing account.
5. Import from Yostar with game-data storage off. In D1's `cloud_save` table, the
   payload must not contain the account snapshot, roster, depot or credentials.
6. Under **Account settings → Saving**, enable **Save imported game data**. Check the supported
   snapshot appears on another device. Disable it; the active database snapshot
   loses optional game data and imported starting values.
7. Edit on two devices. The second stale write must ask which copy to keep rather
   than silently replacing the first. Export both copies before resolving if needed.
8. Test logout, expired sessions, deletion, both themes and a phone-width viewport.

Google/Discord live login cannot be verified until their applications, secrets,
registered redirects, database and deployment exist. Local tests use synthetic
data and never sign into Yostar, Google or Discord as a real user.

## Data and security behavior

- The browser reads a closed list of supported stores, never the Yostar saved-login
  key. The API independently validates it and rejects credential fields/unknown stores.
- Personal sync includes music likes/playlists, skin/pull/operator goals, base plans,
  manual reward/story progress and selected preferences. Imported starting build values
  and imported reward provenance are omitted without consent. A pull wallet tagged
  as imported is omitted too; manually supplied resource estimates are part of a plan.
- Optional game sync saves what the current importer normalizes: account profiles,
  operators, skills/masteries/modules through the planner roster, inventory, skins,
  wallet, clears, medals, base snapshots and pull history. It does **not** upload raw
  Yostar responses or add extraction for game fields the importer currently discards.
- Existing per-server records are preserved. The existing planner still uses the
  latest imported roster/depot; independent planner workspaces for multiple game UIDs
  on one server are future work, not provided by this change.
- Settings not yet included in the centralized store or the explicit preference
  list remain browser-only. Friends files, player playback queues and diagnostics do
  not sync. Imported data is private; this adds no public profiles.
- Accounts start with game-data storage off. Consent changes and saves use one
  revision-checked database update, so a stale in-flight upload cannot undo revocation.
- Sync runs every 15 seconds in a visible tab, on focus, or on **Save now**. It is
  not a background Yostar import. Closing before a save finishes can leave recent
  changes only in that browser; export remains available.
- New empty accounts save their browser's personal data after username setup. Fresh
  devices restore cloud data automatically. Matching copies and remote-only changes
  need no prompt; divergent saved work or changing browser owners requires a choice.
  There is no automatic destructive merge. A cloud restore refreshes
  page state in place, notifies data/settings readers and keeps the music player alive.
- Logout preserves browser data and its owner marker. **Clear browser data** signs out
  and clears browser data, keeping the cloud account. **Delete cloud saves** clears remote saves and pauses automatic
  re-upload; **Delete Arkpedia account** removes the user and cascades through linked
  identities, sessions and saves. Account deletion requires a recent provider login.
- Database recovery backups may retain deleted records until their retention ends.
  Explain this in the site's privacy notice before public signup. Cloudflare Paid
  D1 Time Travel currently retains 30 days; do not promise immediate backup erasure.
- The authentication database contains an Arkpedia identity email, provider identity
  IDs, encrypted Google/Discord tokens, session records, and rate-limit records. It
  never intentionally receives a Yostar login email/token/code. Request bodies,
  cookies and callback query strings must not be added to application logs.
- Authenticated APIs are private/no-store, use same-origin mutation checks and derive
  ownership from the session. Keep them out of shared page/CDN caches.
- The first version caps a cloud save at 900 KB to stay within D1 row/request limits.
  Oversized or invalid saves fail visibly without replacing browser data.

## Local preview and checks

Copy `.dev.vars.example` to ignored `.dev.vars` and use development-only provider
credentials. Register `http://localhost:8787/api/auth/callback/google` and
`http://localhost:8787/api/auth/callback/discord` in development clients. Apply
`npx wrangler d1 migrations apply ARKPEDIA_ACCOUNTS_DB --local`, then run
`npm run cf:preview`. Use localhost consistently, not a mixture of localhost and
127.0.0.1. Ordinary `next dev` has no Worker D1 context and shows accounts unavailable.

```sh
npm run typecheck
npx tsx --test scripts/tests/test-cloud-accounts.ts
npm run lint -- --max-warnings 15
npm run lint:scripts
npm run check:styles
npm run audit:styles
npm run build
npx playwright test tests/browser/cloud-accounts.spec.ts
npm run cf:build
```

Provider requirements: [Google OAuth web apps](https://developers.google.com/identity/protocols/oauth2/web-server),
[Discord OAuth](https://docs.discord.com/developers/topics/oauth2).
Cloudflare: [D1 setup](https://developers.cloudflare.com/d1/get-started/),
[jurisdictions](https://developers.cloudflare.com/d1/configuration/data-location/),
[secrets](https://developers.cloudflare.com/workers/configuration/secrets/),
[Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

## Implementation validation (2026-10-24)

- 50 focused account/import/backup/settings tests passed, including the new D1 API
  isolation, consent, stale-write, identity-switch and OAuth-state checks.
- Eight browser checks passed on desktop/mobile, in dark/light themes: first-save
  choice, opt-in/revocation, concurrent revision handling, restore, preservation of
  local Yostar credentials, unconfigured deployments and provider buttons. The four
  populated theme/viewport states were also captured and visually inspected.
- Type checking, ESLint (nine existing warnings), script lint, style checks, unused
  code audit and client chunk audit passed.
- The Next production build and Cloudflare Worker packaging passed. A missing
  Better Auth `workerd` instrumentation export was fixed with explicit deployment
  trace includes. Wrangler dry run passed: approximately 3.51 MiB gzip.
- Local workerd with real local D1 and synthetic provider settings returned 401 for
  anonymous cloud saves, generated the Google authorization redirect successfully,
  and rejected an invalid OAuth callback state. No real provider login was performed.
- The complete repository suite on this Windows host was **not green**: 2,168
  passed, 176 failed, six skipped. Failures include Windows ESM paths, unavailable
  subprocesses, sandbox permissions and source/path assertions. The deployment trace
  audit also still reports local data paths across many routes on this host. These
  results are not replaced by the focused checks: Linux CI must pass before merging.
- Real Google/Discord login and cross-device sync on the public pilot still require
  the provider registrations, five Worker secrets and a reviewed deployment.
