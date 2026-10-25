# Accepted accounts to main: promotion review

Observed source: CF PR761 `9cd820f1b6615e6af1d5799f0ab131f2b2846eb4`; main `74c7ed3016cf1bdd4c11f8d196f6a45e2e7cd910` (main CI follow-up0f5f4b27 is not merged). No source/config/remote-data mutation performed for this audit. Source of truth is reviewed final file/hunk content, not blind cherry-picking the original commits onto main.

## Provenance

-913e4a11: Better Auth Google/Discord, D1, opt-in game sync, personal saves and initial UI.
-239c8488: restore without interrupting playback; theme/player restore events; remount only page component.
-9d7442e8: unique chosen username, explicit Arknights suggestion, profile API/migration002, cleaner settings/import/deletion and sign-in cleanup.
-6affc920: independent personal/history/game choices; durable pull multiset archive, migration003, ownership/CAS and cross-device retention.
-2fdecdef: independent archiveRevision / owner-qualified unchanged archive polling.
-b6d2c076: provider marks and Save now→Sync now.9cd820f1: published artwork through independently pinned ApplicationImage; public copies removed.

## Dependency-complete feature scope

1. All11 `lib/cloud-account/*` modules, three API routes (`auth/[...all]`, `cloud-account`, `account-profile`), AccountProfileForm, CloudAccountPanel+moduleCSS, ProviderIcon; ordered `migrations/accounts/0001..0003`; accounts configuration helper, non-secret sample configuration and accounts documentation.
2. Selective integration hunks in pages/_app.tsx and pages/account.tsx. Keep CloudSyncProvider outside MusicPlayerProvider, keep player/provider identities mounted, key only the page content on cloud restore. Port CLOUD_RESTORED_EVENT listeners into ThemeToggle and musicPlayerContext; omitting these creates stale preference UI or restarts playback.
3. DataDialog/ImportDialog and account import CSS changes; GameSignIn's scoped “Forget Yostar login” and revised prop contract, local opt-in explanation and accepted onboarding copy. Keep main's actual routes. Do NOT copy unrelated raw-save export, beginner-diagnostic or game-token refactoring merely because the graph traverses those components.
4. pullArchive.ts+pullArchiveStore.ts; required changes in pulls.ts (explicit500k bound/refusal, no truncation), importAccount.ts (archive before snapshot replacement), backup.ts (archive export/restore registration), PullHistory.tsx (archive-only view/status/CSV). Account parsing, planner/depot/roster, pull-plan/past-progress and music-playlist validators already exist on main; retain their main implementations unless a concrete account contract needs a hunk.
5. New lib/settings/siteSettings.ts is a REAL missing dependency: cloud data imports SETTINGS_KEY/parseSettings. Port the versioned storage/validation contract and test with accepted `techniqueDetail` schema so pilot settings remain readable; no Techniques page/UI promotion is needed. Review export usage with Knip rather than pulling in deferred feature UI to satisfy unused exports.
6. ApplicationImage named export in shared ContentImage, renderer/scanner regression and primitive docs; ProviderIcon pins original official essential-icons/google.png+discord.svg to asset-repo75bca3430542ff200f79b60621999a6c18c16b1d via assetUrl template. No app global asset pin, public media index regeneration or logo copies required. Existing content images must keep release-aware rewriting/lazy behavior.
7. Add pinned better-auth1.7.12 and its exact lockfile dependency changes. Main already has OpenNext/types for staging. Do not replace package.json/lock wholesale: preserve @vercel/analytics and existing main base-test/scripts; CF build/deploy/pilot bundle scripts belong to the separate hosting-adapter scope.

Mechanical transitive graph (static and literal dynamic imports) from seven account/API roots reaches186 files,52 currently different from main,0 unresolved local imports. `.cache/account-main-dependency-closure.json` records exact paths. This is an audit SUPerset, not a copy list. Inherited route-renames, general content/Worker fallback code, data asset pins/indexes, class-branch fixes, planner comment renames, material/operator tables, PageHeader/XButton comment changes are not account prerequisites. Also inspect global app/music/theme integration explicitly; root-only traversal does not cover those importers.

## Privacy, data and compatibility contracts to preserve

- Never send or persist Yostar email/code/token/deviceId/diagnostic payload in cloud data. Closed key list, recursive credential rejection, importer-local remembered-login opt-in remain intact. Google/Discord identity/session storage is separate from Yostar imports; encrypt OAuth tokens, no auth request logging.
- No provider real-name/photo becomes chosen public profile. Username unique normalized key is enforced in D1; imports only suggest a Doctor name by explicit selection. Friend tag/server optional and private, not verified ownership.
- Three independent consent flags, confirmation on removal, server paused flag, typed deletion+fresh provider reauth, session owner checks, exact Origin/JSON checks, private no-store/Vary Cookie. Vercel without native binding remains unavailable503, while browser-only import/planning continues.
- Durable archive keyed by Arkpedia user/server/UID; preserve unknown-UID legacy namespace. Maximum known multiplicity per at/pool/char, not replacement/dedup that loses repeated operators. Preserve delta chunking, CAS revision+unique transaction nonce, consent-revocation guards, owner-qualified archiveRevision cache, cross-login ownership markers and restore-by-union before snapshot choice.
- Keep0003 EXACTLY: legacy migration/backfill and old-Worker combined-consent trigger. It is already applied on pilot; never recreate/reset that database or rerun ALTER manually. Old/new tab and Worker rollout compatibility is required.
- Automatic15s-visible/focus sync saves locally held selected categories; it does not fetch Yostar history. Import regularly inside90days; archived older pulls remain. Changes to selected data, device switching, offline recovery and restore must keep this behavior.

## Main-route and deployment boundaries

`/account` and its existing DATA_DIALOG_TABLES/content page contract already exist on main; no account-driven content schema or whole content/table export is needed. Keep main `/planner`, `/gacha`, friend-route names and nav taxonomy. Do not promote renamed-routes.json/new page routes simply because a traversed module uses them in unrelated code/comments. In particular friendFile.ts's error-text-only “Friends page” diff can remain main wording until that route promotes.

Root owns build/hosting-adapter changes: retain Vercel analytics/deploy compatibility until cutover, conditional standalone/staging/noindex behavior; adopt native Worker detection, account tracing BetterAuth workerd instrumentation and bundle budgets selectively. CF analytics must key off hosting role/target, not forever branch=='cloudflare'. A main-based authenticated CF alternate host needs noindex while auth remains enabled: do not use the staging role, which deliberately strips accounts/D1/OAuth. R2 page/audio cache is never account storage. Pilot worker/D1/cache/self-reference values must not be blindly promoted as production infrastructure.

## Concrete acceptance/migration gates

A. After current CI rollout/proof, create an isolated candidate from then-current main. Select only accepted account scope above, integrate root-owned CF production adapter separately, fresh locked install/TS/lint/Knip plus focused account/profile/data/archive/privacy tests. Keep all225-file deferred work preserved, not merged.
B. Package/build both Vercel and CF roles: no binding on Vercel → private503/browser-only remains usable; native CF binding → real auth/D1 functional; main live content channel/schema/release provenance correct, no account tables in public payloads/static files, no secrets in client chunks/logs.
C. On alternate CF hostname verify account onboarding/login/link/unlink/last-provider guard/reauth/deletion, three saving modes/archive status, auto-sync, playback-safe restore and cross-device conflicting histories, both widths/themes and real dummy-D1 CAS races. Keep noindex and exact auth Origin/callbacks.
D. OAuth/cookie/domain decision before live enablement: register exact Google/Discord canonical callback URLs and trusted origin; Google audience/branding/prod verification if required. Host-scoped old pilot cookies do not magically become canonical-domain sessions; new login must resolve intended existing identity/save, never silently create a replacement database identity.
E. Production D1 decision is explicit: docs currently recommend separate arkpedia-accounts-prod and say pilot accounts are NOT copied automatically. Preserve existing pilot identities, provider links, profiles, consent/revisions and complete archive if migrating users; take recoverable backup and validate row counts/ownership/multiplicity/foreign-key cascade on a copy. If starting a separate prod DB, communicate that boundary and keep pilot data accessible. Apply001→002→003 once for fresh DB; for current pilot audit migration ledger, never reset. No credentials/UUID/binding changes applied by this audit.
F. Exact green candidate required; release:status plus affected deployed authenticated/dummy account journey, old/new client compatibility and rollback data-safety proof before declaring live. No DNS/provider cutover until root's hosting/latency/cost/rollback gates and user-approved promotion outcome.

## Current proof already available (scope, not a main-port approval)

Pilot archive PR757 is deployed with003 already applied. CF9cd source local13asset/renderer tests, TS/Knip,34account browser cases,12representative shared-image journeys and8real external-logo states pass. Deployed existing app dummy-account proof shows automatic15s/focus upload and exclusion of unchecked game data/Yostar credentials. At audit time, CF required full40144480430 was running. Its eventual terminal result and any repair are recorded in the [migration progress log](system-simplification-progress.md); local/deployed-old-app evidence is not main candidate approval.
