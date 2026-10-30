# Account design and cost review — 2026-10-30

Recommendation: retain **Better Auth + direct Google/Discord OAuth + Cloudflare Workers/D1**. This is already implemented and fits Arkpedia's current hosting. Avoid a second account backend, a new per-user authentication subscription, password handling and a transactional-email dependency for the initial release. This is a recommendation based on the existing code and published prices, not a claim that every alternative is more expensive.

Accounts remain **Preview-only**. Production sign-in and cloud saves stay disabled. The separate native Preview database must never be replaced with a production binding. This review creates no database, copies no users, changes no OAuth registration and enables no production login.

## Cost

Cloudflare's [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) has a $5/month Standard subscription, with 10 million requests and 30 million CPU-ms included; request overage is $0.30/million and CPU overage $0.02/million CPU-ms. These are account-wide allowances shared with the website, not a separate $5 charge per login user. If Arkpedia already has Workers Paid, accounts could add no extra infrastructure charge while shared allowances are sufficient. Billing-plan status and actual usage were not inspected, so this is not a quote or a guaranteed cap.

[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) includes 25 billion rows read, 50 million rows written and 5 GB storage per month on Workers Paid; excess is $0.001/million reads, $1/million writes and $0.75/GB-month. Index maintenance counts as additional writes. The free plan has daily limits; it is not a substitute for planning capacity and abuse controls.

The immediate cost issue is polling, rather than the choice of SQL database. `SyncProvider.tsx` checks every 15 seconds while the tab is visible, including paused saves; unchanged snapshots are not uploaded, but `/api/cloud-account` still reads and decodes the save payload. A save can be up to 900 KB, and archive storage is additional.

For illustration, 1,000 daily users with one visible account-enabled tab for one hour each day produce **7.2 million polling requests/month** at 15 seconds, versus **1.8 million** at 60 seconds (30-day month). Extra tabs, focus events, uploads, login calls and public-site traffic are additional. This calculation measures requests, not database rows or measured CPU. A per-user average 100 KB snapshot is roughly 1 GB for 10,000 users before archives and indexes; actual history sizes need measurement.

Before production promotion, implement and test this bounded sync policy:

- Upload local changes after a short debounce and when the reader explicitly chooses Sync now. Continue fingerprint/CAS checks so unchanged data is not rewritten and device conflicts are not silently overwritten.
- Poll a small owner-qualified revision/consent/archive-version response every 60–120 seconds while visible; fetch the full snapshot only after its revision changes. Refresh on focus. Paused saves need infrequent checks for remote consent/deletion changes, not repeated full snapshots.
- Back off on network failures and 429/5xx responses; do not synchronize every open tab independently when one tab can coordinate safely.
- Keep indexed owner lookups, request/body/archive limits and per-user write limits. Add edge abuse protection before requests can generate unlimited database work, retaining the auth library's own limiter.
- Measure Worker CPU/requests, D1 rows and storage under representative signed-in workloads. Set usage alerts and an operational response for unusual growth; an alert is not a hard spending cap.

These sync changes are recommendations, **not implemented by this fixes branch**. The existing 15-second sync behavior has been preserved.

## Security assessment

Current owning code: `lib/cloud-account/server.ts`, `api.ts`, `profile-api.ts`, `data.ts` and `archive.ts`, plus `migrations/accounts/`.

The implementation already has useful controls: exact trusted/auth origin; server-side sessions; disabled password signup; encrypted provider tokens; explicit provider linking rather than automatic email linking; no unlinking the last login; fresh-session requirements for sensitive account actions; origin/JSON checks on mutations; session-derived ownership; revision/nonce conflict checks; private/no-store responses; a closed upload-key list and recursive credential rejection; independent personal/history/game consent; and explicit deletion/export behavior. Yostar login credentials must remain outside cloud-save data, static releases and analytics. Keep distinct databases, OAuth callbacks and secrets for Preview and any future production deployment.

The [Better Auth security reference](https://better-auth.com/docs/reference/security) describes the library's session, CSRF, trusted-origin and secret-management mechanisms. Application configuration, deployment and acceptance tests are still required; using the library is not itself a security guarantee.

Checks performed on the locked source:

- `npm audit --package-lock-only --omit=dev --json`: **zero known runtime dependency advisories** at the time of this review. The lockfile uses Better Auth 1.7.12. This does not rule out unknown vulnerabilities.
- `test-cloud-accounts.ts`: **20 tests passed**, including actual local SQLite/D1-adapter paths, consent/owner/revision races, credential exclusion, profile validation and OAuth-state/password-signup checks. These are local tests, not a penetration test or proof of provider acceptance on the deployed hostname.

Before enabling production: exercise real disposable Google/Discord login, linking/unlinking, expiry/revocation, fresh reauthentication, cross-account isolation, consent withdrawal, restore/export/deletion and conflicting devices on the exact intended origin. Verify runtime cookie attributes and callback registration, user-data-safe rollback and recoverable backups. Preserve existing pilot identities/data and encryption-key compatibility if a migration is later authorized; never silently replace users or reset the old database.

A poll can enforce one vote per Arkpedia account with a database uniqueness constraint. Neither Google/Discord login nor an imported game UID proves one human has only one account or proves ownership of that game account. Do not label those stronger guarantees without a separate verification mechanism.

## Outcome

Reuse the existing account foundation, reduce unnecessary sync traffic before promotion, and keep production disabled until the exact deployment passes the account acceptance journey. The review supports a low incremental cost at modest usage; it does not promise a fixed monthly bill or authorize production activation.
