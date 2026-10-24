# Migration progress: first staging proof

Observed 2026-10-24. Work is isolated in `E:/Projects/arkpedia-release-ux`, branch
`codex/system-simplification`, so the separate cloud-account work in the main checkout
is not reset, included or deployed here.

## Completed

- Full staging PR Check [40106791726](https://github.com/arkpedia/arkpedia/actions/runs/40106791726)
  passed at `326d1707`, including desktop/mobile browser regressions and content
  update/rollback checks. This supersedes the earlier hygiene/Knip failures.
- After the verified accounts pilot, staging rebased onto `0f319194` and rebuilt
  clean candidate `6026245a` in Linux run `40109963907`. Deployed staging Worker
  version `2cebc414-6eb4-468e-a9d9-1d1c4d4616a2` from a fresh extraction of that
  exact artifact (no old output mixed in). Four isolation tests pass. Provider API
  confirms no staging D1, OAuth variables or secrets, and separate R2/queue/self
  bindings. Pilot and edge deployment timestamps were unchanged by this deployment.
- Fresh Chromium checks passed 20 route/theme/viewport combinations, now including
  `/account`: browser-local import/export stays available, account-unavailable text
  appears, and Google/Discord buttons are absent. The real account API and both
  OAuth starts return private/no-store 503 without redirects or auth cookies.
  Desktop/mobile schedule navigation and Back still restore scroll. Combined full
  PR Check `40109967991` passed, and PR #739 merged as `11d175fb`. Its normal
  Cloudflare pilot build also passed and now reports that exact clean commit.
  Anonymous pilot account requests still return private/no-store 401; staging
  returns private/no-store 503. Public www remains on `0a6da170`.
- An old browser tab was held across the staging update. Account navigation and
  Back recovered without an uncaught page error, but three old chunk/data URLs
  returned 404 and Next reloaded from build `N79GscF-MSLAPapZ4Airx` to
  `ScM_rTOpc3hcoqc7bKUCj`. This proves recovery, not seamless old-asset compatibility
  or uninterrupted playback. Retain that distinction in the cutover gate. OpenNext's
  current [experimental skew protection](https://opennext.js.org/cloudflare/howtos/skew)
  relies on version preview URLs, conflicts with the current in-Worker Durable
  Object, and adds billed Worker requests for assets; assess the tradeoff before
  changing architecture or declaring the old-tab requirement complete.
- Published annotated `migration-preserved/2026-10-24/{main,dev,cloudflare}` tags
  for `0a6da170`, `994952e7` and `8520b03a`. A separate 31,681,227-byte app bundle
  passed `git bundle verify` with complete history and 36 refs, including current
  feature branches. Its SHA-256 is recorded in
  `E:/Projects/arkpedia-migration-backups/app-inventory.json`. No shared branch moved.

- Cloudflare OAuth login verified. Workers, R2 and binding reads/deploys work. Workers
  Builds administration/log APIs return 403 with this OAuth scope; the maintainer read
  the relay failure in the dashboard and disabled its unintended non-production builds.
- Created `arkpedia-staging` and `arkpedia-staging-cache`. The staging self-reference
  targets staging. Provider API inspection confirms a distinct revalidation Durable
  Object namespace and cache bucket from production. No production domains/routes
  were assigned to the new Worker.
- [Linux build 40097450508](https://github.com/arkpedia/arkpedia/actions/runs/40097450508)
  passed the staging-isolation tests, Next checks, deployment/client audits and Worker
  bundle budget. Build+package job took 2m26s; the app/adapter build took 1m38s.
  This is a targeted pipeline, not equivalent coverage to the 27-minute full suite.
- Deployed the clean artifact for `f0c42100d5739eaacc6aba40d669c4cba1f7e730` to
  [staging](https://arkpedia-staging.cloudflare-1ff.workers.dev). Build identity reads
  `dev-live`. The production site and front-cache Worker bindings/deployment timestamps
  were unchanged by this proof.
- Chromium checked homepage, schedule, story and base at 1440px/390px in dark/light:
  16 route/theme/viewport checks, expected noindex headers, no horizontal overflow or
  uncaught page errors, and working Upcoming/Past switching. Desktop/mobile browse to
  a past event and browser Back restored the scrolled list after hydration.
- Staging's public EN account-network endpoint returned 200. All 14 allowlisted game,
  login and Account Center TLS destinations passed from the exact staging origin;
  the probe also rejected private/loopback/metadata addresses, arbitrary hosts,
  disallowed ports and foreign origins. No account credentials or private game data
  were used. This proves transport, not a complete authenticated import.
- [Relay PR #8](https://github.com/arkpedia/arkpedia-relay/pull/8) added only the exact
  staging origin and a negative-origin regression, plus CRLF handling in the existing
  Docker-file-list test. All 13 tests passed locally and on Linux; its main Workers
  deployment passed. The VPS installation was not changed.
- Staging's authenticated release-refresh endpoint regenerated all 21 configured
  routes successfully through its own self-binding. The temporary staging-only secret
  was removed and its absence verified; unauthenticated refresh returns 401.
- Before any rename, both simulator repos were mirrored and complete Git bundles
  verified in `E:/Projects/arkpedia-migration-backups`. `inventory.json` contains bundle
  SHA-256 hashes, every captured ref and branch divergence. Legacy: 21 branches,
  20 with commits absent from master. Standalone: 29 branches, 27 with unique commits.
  Pull-request refs are also preserved. Neither repo has been renamed or archived.

## Decisions and limitations

Use one explicit staging Worker for the initial development loop. It is deployed
from the feature branch being reviewed; it does not require a permanent dev branch.
It hosts one candidate at a time and has a stable exact-origin relay rule. Deploy
serialization and displayed commit identity must make replacement of that candidate
visible. Native multi-branch Previews remain an optional later improvement after
OpenNext self-calls can be isolated correctly.

The Windows Next build completed but failed the existing deployment-trace audit;
that audit was not weakened. Linux produces the deployable artifact. Initial DNS
propagation caused failures in Playwright's API request resolver; normal Chromium
navigation and the HTTPS identity check subsequently passed.

This proof does not yet cover a changed candidate content snapshot, old-tab asset
compatibility after a new deploy, production edge-cache behavior, real credentialed
imports, cloud-account/D1 features, billing measurements or the public-domain cutover.
The new Worker has no production front-edge route; cached request timing is therefore
not a production performance comparison.

Earlier [PR #738](https://github.com/arkpedia/arkpedia/pull/738) remains unmerged. Its
full Check failed one music data-saver playback-position assertion in the browser
suite, outside its changed files. Do not call that PR green or silently drop the test;
triage it while adapting its useful checklist/report to the new release targets.

## Next work

### Independent preparation while accounts is verified

- The accounts session owns PR #740 and the existing `arkpedia` pilot Worker/D1.
  Its full Check passed and it merged into cloudflare as `0f319194`. The owner verified
  the exact deployed clean build, anonymous API privacy/cache behavior, both OAuth
  authorization starts and the account page. A real provider login/link/save roundtrip
  still needs maintainer interaction. PR #739 has now rebased onto this pilot code;
  root pilot D1/origin and additive hygiene/Knip entries are preserved. Staging keeps
  its separate cache/queue and no account bindings or OAuth settings; its build also
  removes inherited account environment variables. Combined checks, deployment and
  no-bindings validation passed; PR #739 is merged. The real user sign-in roundtrip
  remains with the accounts owner, separate from staging's intentional unavailable state.
- [Framework PR #742](https://github.com/arkpedia/arkpedia/pull/742), draft at
  `86873650`, starts from preserved main and isolates Next 16/React 19, ESLint 9,
  self-hosted fonts and the existing trace/resource corrections. It does not include
  route renames, base optimization, account UI or Cloudflare deployment configuration.
  Typecheck, capped application lint (nine warnings), pipeline lint and Knip passed
  locally. Focused framework/config tests passed; two Linux-specific CI-harness checks
  fail on Windows but passed in full Linux Check `40109416312`. The candidate lockfile
  audit reports zero vulnerabilities. A protected Vercel preview built and deployed;
  its HTTP/browser verification passed in temporary helper branch
  `codex/framework-vercel-preview` (run `40113997645`): 36 route/theme/viewport cases,
  populated music/favourite controls, and four inspected screenshots. Verification uses
  the pinned CLI's token environment; its argument parser otherwise forwards the token
  option to native curl. The same preview was reused, with no rebuild or production alias
  change. Framework #742 is now ready for review, held for dev reconciliation #743.
- [Dev reconciliation PR #743](https://github.com/arkpedia/arkpedia/pull/743) is draft
  at `d8a8d30e`, with full Check `40113183215` in progress. It preserves dev routes,
  optimization work, adapter configuration and extra tests. Its net four-file change
  updates the Node minimum and compatible brace-expansion pin, removes the unsupported
  Next lint option and keeps the explicit lint gate. It depends on framework #742
  landing with commit `86873650` retained in merge history; no shared dev branch moved.
- A shadow browser planner in local branch `codex/ci-impact-plan` (`85546656`)
  passes eleven tests and follows reverse references transitively. Real examples keep
  full coverage for story progress consumed by account backups, YouTube utilities
  consumed by community cards, and scheduling consumed by homepage banners. The
  StoryMapView-only simulation selects seven of the current 94 spec files. From the
  older successful full run, those files contain 28 passed cases and 33 seconds of
  summed case work, against 2,975 seconds across the whole parallel suite. This is not
  wall time, a fresh execution or reusable Check proof. Storage/events, computed imports,
  filesystem reads and unknown formats retain broad coverage. No CI lane changed.
- Read-only runner inspection found metadata jobs pinned to a busy VPS while the
  three NAS runners were idle. `ARKPEDIA_LIGHT_RUNNER` now uses the existing
  `arkpedia-self` VPS/NAS label pool. Heavy Check and deployment labels, tests and
  release gates are unchanged. This improves scheduling capacity; measured feedback
  percentiles still need collection. [Runner details and rollback](ci-runner.md).

Targeted browser activation must retain the existing layout census for affected
routes and driven states, using supported Playwright test selection rather than
duplicating its bounds/card/row checks. A seven-file feature-only plan does not by
itself cover that UI contract. Record partial census coverage explicitly in reusable
evidence and keep the full census for shared changes.
- Local branch `codex/r2-content-pilot` (`38cc26ab`) prototypes immutable generated
  data objects, verified snapshot indexes and conditional staging-pointer promotion.
  Five Node cases pass. Local Miniflare/workerd R2 also passed publication races,
  switch/rollback, stale writers after rollback and missing/corrupt-object rejection.
  No remote data bucket, application reader or production pointer changed. A complete
  real snapshot, remote staging delivery, operations/latency and cache/old-tab behavior
  remain unverified.
- A pinned-tree audit covered all 18 organization repositories: 2,486 source,
  configuration and documentation files, plus tracked simulator text from the
  verified mirrors. All trees were complete; no API read failed. Generated bulk
  data/media payloads were excluded. The application's complete tracked main/dev/
  cloudflare trees contain no simulator repository references. Both simulator repos
  report no GitHub Pages site, homepage, webhooks or deployment environments;
  this does not prove the absence of external dashboard integrations.
- The audit found four SD source reviews citing unresolvable simulator commit
  `a550f5e048bb94e7cdefc6eb97a4091f0c4c7add`. Each exact foundation file was recovered
  from preserved history and fetched from its replacement pinned GitHub URL; all
  four existing SHA-256 digests match. [SD assets PR #59](https://github.com/arkpedia/arkpedia-sd-assets/pull/59)
  repaired those commit references and merged as `2270b269` after both repository
  validation runs passed; the four existing model/animation/byte tests also passed
  locally. Media and review semantics are unchanged. These references must
  follow the future legacy repository after renaming; standalone package/source
  links and version assertions also need coordinated updates. No repo rename yet.

1. Inventory suite overlap and implement relevant CI lanes with exact-tree evidence
   that records which coverage actually ran. Keep unknown-impact fallback checks.
2. Review framework/Cloudflare infrastructure consolidation into main separately from
   unreleased features. Preserve main/dev/cloudflare tips and all deferred work first.
3. Complete staged-data publication/rollback and deploy-cache/old-tab proofs before
   retiring channels or switching the public domain.
4. Finish simulator consumer/link inventory before the approved archive/rename.

No DNS cutover, branch deletion, simulator rename or R2 canonical-data migration has
occurred. The active goal is the [phased plan](system-simplification-plan.md).
