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

This staging proof does not yet cover a changed remote candidate content snapshot,
seamless old-tab compatibility, production edge-cache behavior, real credentialed
game imports, billing or the public-domain cutover. Cloud accounts are intentionally
unavailable on staging; their separate pilot acceptance is recorded below.
The new Worker has no production front-edge route; cached request timing is therefore
not a production performance comparison.

[PR #738](https://github.com/arkpedia/arkpedia/pull/738) merged into main as
`a575ec69` after full Check `40118453074` passed. It adds read-only release reporting,
UX review guidance and the shared architecture/setup references. Its music test now
delays returning media and waits for decoded data/seek completion, retaining both
position bounds. Two staged reproductions pass. Main's combined Check `40121286554`
failed an existing primed-audio recovery race, correctly blocking deployment.
[Fix #752](https://github.com/arkpedia/arkpedia/pull/752)
ports the existing dev recovery fix and fixes the shared native `inert` helper for
React 19. Delayed-engine recovery fails on actual www and passes locally with the fix;
four playback cases and twelve hidden-panel/theme/viewport cases pass. Full Check
`40125945631` passed; the fix merged as main `cd3e611b`, whose Check `40128065772`
and Deploy `40128182705` passed. Actual www serves that clean commit/fingerprint
and passed 36 route/theme/viewport cases, 12 native-inert cases and both refused-file
timing orders. No account implementation files were changed.

## Next work

### Current migration checkpoint

- The accounts session owns PR #740 and the existing `arkpedia` pilot Worker/D1.
  Its full Check passed and it merged into cloudflare as `0f319194`. The owner verified
  the exact deployed clean build, anonymous API privacy/cache behavior, both OAuth
  authorization starts and the account page. The maintainer subsequently confirmed
  real Google/Discord login and music saves through the accounts session. PR #739 rebased onto this pilot code;
  root pilot D1/origin and additive hygiene/Knip entries are preserved. Staging keeps
  its separate cache/queue and no account bindings or OAuth settings; its build also
  removes inherited account environment variables. Combined checks, deployment and
  no-bindings validation passed; PR #739 is merged. The accounts owner now implements
  the separately requested username/onboarding/deletion work on `codex/account-onboarding`.
  That work passed full Check `40126002906` (1,482 browser passes, 217 intentional skips)
  and merged as Cloudflare `6aac0761`. The owner applied migration 0002 with aggregate
  users/providers/saves/revisions/payload sizes/opt-ins unchanged. Workers Build
  `923908a9-df39-4c62-8610-f9bf325247a3` and live identity, desktop/mobile account/menu,
  anonymous API privacy and both provider-start checks passed. Preserve its new profile
  migration, API tracing and guide updates during reconciliation; real users choose
  their own username through the one-time onboarding.
- [Framework PR #742](https://github.com/arkpedia/arkpedia/pull/742), candidate
  `86873650`, isolated Next 16/React 19, ESLint 9,
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
  option to native curl. Framework #742 merged with its history retained as main
  `04712d02`, and Vercel Deploy `40115653172` passed. Cloudflare's normal sync/build
  passed at `8ead2819`; account bindings/source remained unchanged. Anonymous account
  privacy and both provider authorization starts were reverified after that deployment.
- [Dev reconciliation PR #743](https://github.com/arkpedia/arkpedia/pull/743), candidate
  `d8a8d30e`, passed full Check `40113183215` and merged as `d3a33929`. It preserves dev routes,
  optimization work, adapter configuration and extra tests. Its net four-file change
  updates the Node minimum and compatible brace-expansion pin, removes the unsupported
  Next lint option and keeps the explicit lint gate. The subsequent history integration
  `5173027f` passed Check `40115764460`, deployed to dev and synced into Cloudflare.
- Public verification found a default-locale summon formatter changing server `3,275`
  to German browser `3.275`. It was unchanged from the prior production version.
  [Fix #747](https://github.com/arkpedia/arkpedia/pull/747) passed full Check
  `40117081504` and deployed as main `2564430d` (Deploy `40119774172`). Actual www
  passed 36 route/theme/viewport cases with populated music controls, plus eight
  German/French summon hydration/level-interaction cases across both themes and widths.
- Main's later release tooling encountered one add/add conflict in dev's Cloudflare
  guide. [Reconciliation #749](https://github.com/arkpedia/arkpedia/pull/749), head
  `a658b4e1`, retains both the current infrastructure sections and dev's audio memo
  guidance, correcting its API-cache description against the edge implementation.
  Nine report and 21 workflow/deployment-policy tests and full Check `40121939284`
  passed. The merge `573029e1` retains main ancestry; trusted sync `40126260620`
  passed. Cloudflare sync `40126456264` stopped on two documentation conflicts.
  After the owner completed #750, [CF reconciliation #754](https://github.com/arkpedia/arkpedia/pull/754)
  retained that exact deployed account head. Candidate `f3e3a1b4` resolves the two
  guides, passes nine report tests and leaves account implementation, guide, profile
  trace/migration, root Worker and relay config unchanged against `6aac0761`.
  While its first Check was still queued, verified main `cd3e611b` was included;
  the only added net change is the shared inert helper. Current head `5ef242b4`
  has full Check `40129450311` active. Dev integration Check `40128080660` passed,
  and trusted sync advanced dev to `5b0e72a8`; CF sync still reports the known docs
  conflict. After #754 passes, retain that dev merge's ancestry only if the resulting
  tree is identical, then use the existing exact-tree proof before merging once.
  No active computation was restarted without a source change. Main's newer changes
  are not yet claimed deployed on Cloudflare.
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
- [CI optimization #746](https://github.com/arkpedia/arkpedia/pull/746), head
  `b0055182`, lets automatic integration opt into existing exact-tree proof on its
  disposable branch. Normal manual checks default to full; failed/missing proof
  still runs everything. Actual condition tests cover opt-in/default/fork/branch
  boundaries. Twelve real Git fixtures passed; 23 current policy/trust tests pass.
  Full Check `40120584599` passed. Actual Actions smoke `40123207561` reused that
  exact full-tree artifact, skipped the heavy job and completed its notifier. Trusted
  main handoff `40123228484` returned `ignored` for the deliberately ineligible proof
  branch, so it could not move dev. The unchanged disposable branch was removed.
  The PR is ready but its merge is held for the current release reconciliation.
  This does not activate targeted browser lanes.

Targeted browser activation must retain the existing layout census for affected
routes and driven states, using supported Playwright test selection rather than
duplicating its bounds/card/row checks. A seven-file feature-only plan does not by
itself cover that UI contract. Record partial census coverage explicitly in reusable
evidence and keep the full census for shared changes.
- The shadow branch is now published at `f32d0bd7`. It selects affected existing
  census cases from actual Playwright inventory. A StoryMapView simulation selected
  38 of 1,679 listed cases; replay through `--test-list` returned exactly those
  identities. Nineteen planner/coverage tests pass. Completed-report validation rejects
  missing/extra tests, collection-only output, failures and retries; runtime skips and
  expected failures are counted separately. A real small reporter fixture verifies
  those formats. Global CSS retains full coverage. No CI lane or reusable Check
  marker changed; trusted baseline/artifact integration remains open.
- [Main-based hosting #755](https://github.com/arkpedia/arkpedia/pull/755), branch `codex/main-cloudflare-staging`,
  ports the existing adapter/cache/bundle corrections separately from dev features
  and account bindings. Staging reads compatible `live` data while an independent
  deployment role enforces noindex and disables production analytics. Deploy rejects
  dirty output, another commit or missing/wrong role/channel. Local staging, role,
  fetch, public-network and data-table parity checks pass, as do typecheck, lint and
  Knip. The adapter uses the existing pinned versions with scoped compatible glob/
  undici patches; clean Linux installs report zero known vulnerabilities. Linux builds
  `40129047590` (`cca5e640`) and `40129816201` (`19b51e89`) passed with a 17.40 MB
  Worker against the unchanged 19 MB budget. Inspected artifacts were deployed only
  to staging. Current staging is clean `19b51e89`, role `staging`, channel `live`,
  version `591c4728-48b9-4058-b035-9b95cea0e9c4`.
  It passed 36 route/theme/viewport cases with noindex, all three public server-list
  APIs, and 21 self-referenced page regenerations. The temporary refresh secret was
  removed; absence and unauthenticated 401 were verified. Remote settings confirm
  the original queue `a62f631f91804a7b8331338d63fc5b23`, its own cache/self-reference,
  no database and no secrets. Main's staging includes no cloud-account routes or
  provider buttons, rather than the CF-branch proof's unavailable API handlers.
  The main browser now selects the existing CF relay on the two already-approved
  origins only; www/dev/unknown hosts retain the VPS relay. Twenty import/relay tests
  and the real 14-destination TLS plus negative/foreign-origin probe pass.
  Deep archive → event → Back returned to 1,731px/3,397px on desktop/mobile. The probe
  must wait for the event page to render before Back; its earlier premature navigation
  did not establish a restoration failure. Both cases are now added to existing
  navigation regressions and pass against staging.
  Head `7118d968` adds only that test and its build trigger beyond deployed `19b51e89`.
  Fresh Linux build `40130664450` and full Check `40130748630` are active/queued.
  A held tab across `cca5e640` → `19b51e89` recovered navigation without page errors
  but got two old Next 404s and reloaded to the new build. Seamless continuity remains
  unproven; keep the comparison/rollback/soak gates open. No production Worker config,
  account/D1/OAuth promotion, DNS or canonical R2-data change occurred.
- Published feature branch `codex/r2-delivery-pilot` (`171e7999`) contains the inactive
  manifest-only R2 transport. Nine unit cases and a complete local workerd R2 proof
  pass for real data revisions `7706f719` and `4f790631`: each has 8,963 delivery paths,
  about 259 MB. Original manifest bytes/pins are retained, without a second index.
  Initial staging writes 8,850 objects; an unchanged repeat writes none; the second
  release adds 207. Publish/switch/rollback each write one pointer; stale publication
  after rollback reads only the pointer and writes nothing. Missing/corrupt payloads
  cannot advance it. Both releases occupy 9,058 objects. These are local API-call
  observations, not Cloudflare billing or network latency. No remote data bucket,
  app reader or live pointer changed. Remote publication, delivery/cache/old-tab and
  cost proofs remain open. The prototype is preserved without starting a premature PR build.
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

### Coordination checkpoint: 2026-10-24, after 21:24 UTC

This checkpoint supersedes the queued/active statuses above; earlier entries retain
the evidence and limitations of their respective runs.

- Cloudflare reconciliation #754 merged as `5a60da64`. Full Check `40129450311`
  passed; adding dev history produced the identical tree, and `40131767587` reused
  that completed proof. Native build `dbc8a72b-89ae-4fe7-b35c-45101504dc6a` passed.
  Actual CF identity, private account responses, both OAuth starts and twelve native
  inert cases passed. The release report at 20:59 UTC found www `cd3e611b`, dev
  `5b0e72a8` and CF `5a60da64` healthy, with dev/CF zero commits behind main.
  Subsequent sync runs `40132339438` / `40132353275` succeeded without another push.
- Hosting #755 is ready at `e47ea264`; full Check `40132015502` passed. Four
  structural test references/allowlists were updated after extracting the release
  reader. Their existing assertions remain intact. Deployed staging is still
  `19b51e89`; later changes are regression/build-trigger/guard changes. Hold merging
  main while the accounts owner completes #757, because automatic sync could move CF.
- Draft CI #756 at `5bd1dbe0` incorporates #746's proven exact-tree work. Actual
  quick run `40132433692` passed in 3m20s of job execution and uploaded zero artifacts;
  the full job was skipped. This is one observed execution, not a controlled benchmark.
  An existing cache test now verifies each profile's clean install and hosted-only
  cache. Keep #756 draft until #755 is incorporated, then reconcile its base and run
  mandatory full Check on readiness. #746 is preserved as a draft until replacement
  #756 merges. Main-based shadow planner `1d0a2576` is published separately; its
  nineteen tests pass, but no affected-browser lane is activated.
- R2 branch `codex/r2-delivery-pilot` is now `18253aaf`, with runtime tested at
  `29620404`. The explicit-credential official S3 adapter has bounded connections,
  response sizes and conditional writes; a real SDK loopback fixture and seventeen
  transport cases pass. Its lock-only dependency addition changed no previously
  locked versions. Bounded four-task staging verifies every logical path, coalesces
  hash destinations and drains active tasks on failure.
  Complete local workerd proof again passed for both real snapshots: initial staging
  152.08s/8,850 PUTs; unchanged repeat 39.14s/zero PUTs; second staging 45.34s/207 PUTs.
  Publish/switch/rollback each wrote one pointer; stale and corrupt/missing inputs
  could not advance it. Both releases occupy 9,058 objects, generation three after
  rollback. These are local timings/API observations, not remote latency or billing.
  Source/result evidence is retained in `.cache/r2-complete-bounded-result.json`.
  CLI, app reader, isolated remote CAS/cache/rollback/cost proof remain unfinished;
  no remote bucket, credentials, binding or live data pointer changed.
- Accounts owner controls #757, final head `2fdecdef`, based on CF `5a60da64`.
  Required Check `40133311736` has passed its non-browser gates and is running the
  full desktop/mobile suite. Remote migration 003 has not been applied at this
  checkpoint. Keep both main and CF stable until the owner confirms rollout complete.
  Root owns infrastructure/data/CI in separate worktrees; the other chat owns
  accounts/D1/OAuth and its primary checkout. Direct coordination is user-authorized.

No DNS cutover, branch deletion, simulator rename or R2 canonical-data migration has
occurred. The active goal is the [phased plan](system-simplification-plan.md).

### Publisher continuation: 2026-10-24

R2 pilot branch `750ebaa3` adds the concrete `r2-pilot.mjs` command and pinned source
loader. `inspect`, `stage` and `promote` remain separate; promotion requires saved
candidate and pointer JSON files. Credentials are environment-only with no default
AWS identity. The source manifest is fetched at a full public Git commit; every
payload is bounded and hash-checked. Missing downloads require explicit opt-in;
cache publication uses create-only atomic links and never repairs corruption silently.
Decoded-size checks handle compressed tiny files correctly. No workflow invokes it.

Twenty-three source/CLI/snapshot/S3 tests, two repository hygiene cases, ESLint and
diff checks pass. Native temporary-file links and the actual SDK loopback fixture
require execution outside the restricted Windows sandbox; the same focused suite
passed there without changing assertions. The real loader fetched the original two
pinned manifests and verified all 8,963 cached paths each, totalling 258,553,041 and
258,462,721 bytes. Original manifest bytes match the preserved proof. Evidence is
`arkpedia-ci-migration/.cache/r2-pinned-source-result.json`. This verification made
zero remote storage calls and enabled no missing-payload downloads.

The CLI is preserved on its feature branch, without a premature PR/full build.
The app/public-file reader, bulk source handoff, isolated remote publication/cache/
rollback/cost evidence remain open. The accounts full browser job `40133311736`
was revalidated live; the shared main/CF merge hold remains in effect.

### Delivery and bulk-source proof: 2026-10-24 UTC

Inactive R2 branch `75a0eeb2` now contains a portable immutable HTTP reader
(`8c9b60c9`) and compiled-release source handoff. Publisher and reader share the
original manifest contract. Immutable URLs carry manifest hash and full Git pin;
no request consults a mutable pointer. The existing front Worker is the intended
caller, but no route, binding, service or application environment setting enables
the handler. Optional hash-verified fallback uses only the same Git revision and
never forwards reader credentials. Verified successes may use the Cache API;
failures remain uncached. Manifest/origin-read/queued-request counts are bounded.

All 36 focused source/CLI/snapshot/reader/S3 cases and ESLint/diff checks pass.
The actual local workerd/Chromium harness verified five real page/public files per
snapshot, immutable caching/HEAD/conditional responses, a warm hit with zero R2
reads, and held-old/current URLs through pointer changes/rollback plus twelve-read
bursts without page errors. Its 12,161-byte harness bundle needs no Node compatibility.
This is transport evidence, not the integrated Arkpedia app or a remote cost/latency
proof. Results: `arkpedia-ci-migration/.cache/r2-delivery-native-result.json`.

The bulk handoff seeded a fresh hash cache from all 8,963 logical files in a local
compiled release tree materialized from preserved verified bytes: 258,553,041 bytes,
8,849 unique payloads, one pinned public manifest request and zero payload downloads.
Measured local handoff time was 12.92s; generated temporary files were removed after
verification. Result: `.cache/r2-local-handoff-result.json` in the CI worktree.
The CLI's `--source` option avoids individual payload requests when CI already has
the compiled output. No remote storage call/resource or deployment changed.

The accounts owner reports #757 full Check `40133311736` succeeded, migration 003
applied with direct aggregate preservation verified, and #757 merged as CF
`03d2f4b2c5727f9ddb97d873158af723b996dc8f`. Its native deployment/live verification
is still running; keep main/CF unchanged until the owner releases the hold.
The user also asked that session to reduce CI repetition. Root retains ownership
of #756 and the shadow impact plan; account API/privacy/consent/deletion/migration/
CAS/archive preservation and cross-device journeys remain required. No duplicate
workflow edits in the accounts checkout.

### CI activation and hosting checkpoint: 2026-10-24, after 23:29 UTC

This checkpoint supersedes the earlier accounts rollout hold. Accounts #757 passed
full Check 40133311736, applied migration 003 with aggregate preservation verified,
and deployed CF 03d2f4b2 cleanly. Its owner verified deployed APIs/OAuth starts and
cleared the hold. Main hosting #755 then merged as 74c7ed30; Check 40136923712 and
Deploy 40136945647 completed successfully. Main staging build 40136993030 also
succeeded, but that newer artifact has not been deployed: staging still serves
19b51e89 with role staging and no account bindings/secrets.

Actual public release inspection found www main74 reports dirty=true despite the
successful workflow. The deploy log proves Vercel ran a second npm install that
modified package-lock.json. The schema is correctly 2; a separate reporting bug
incorrectly added a schema warning after dirty validation failed. Do not call this
release healthy or clear its dirty marker manually. The clean-build repair makes
Vercel own one locked npm ci install and verifies exact built/public identity before
allowing held content publication to resume. Its real clean redeploy is still open.

CI #756 now contains the actual proportional browser executor, not only a shadow
plan. Final frozen source is 93195f54f5198c1e02b2452e16bfb26d21dd7118 on
codex/draft-ci-feedback. It includes the install/identity repair, trusted historical
PR proof recovery and accurate dirty/schema reporting. All 119 focused cases,
JavaScript lint, Knip and TypeScript passed. Draft Check 40142927680 is running.
After its quick success, readiness must trigger the full Linux first-policy check.
A later real narrow PR plus actual partial-artifact reuse must prove activation.
Draft/partial results cannot vouch for full coverage; shared/unknown/policy/manual
changes fall back to full. Account integrity and existing assertions remain intact.

Actual selected bundled browser evidence covers 40 identities: 32 passed and eight
intentionally skipped in 27.4 seconds. A live-data 1018/1016 mismatch was correctly
rejected. This is functional selection/reporter proof; the Windows build's normal
trace audit failed, so it is neither a deployment artifact nor an Actions proof.
The isolated test server was stopped and the user's local browser was untouched.

Main-to-dev reviewed integration #759 (d6026597) passed full Check 40138347385.
Hold its merge until the accounts owner completes combined CF #761, avoiding a
competing automatic downstream build. CF #761 includes reviewed main hosting/CI
and the user's provider icons/Sync now changes, preserving CF bindings and Worker
sampling. Its initial Check 40141249461 failed one stale sampler command fixture
before browsers; the owner repaired that exact fixture and is integrating final
root CI source before one new required full run. No failed attempt spent browser
compute. Root owns #756/main verification; the accounts owner owns #761/CF rollout.

The R2 reader/publisher remains inactive at 75a0eeb2 with the previously recorded
local evidence. No remote data resource, route, binding or publication changed.
The one-main transition, preview validation, old-tab continuity, parity/cost/soak,
branch retirement, simulator rename and DNS/Vercel cutover gates remain open.

### Checklist reconciliation and provider assets: 2026-10-24, 23:50 UTC

At the maintainer's request, the plan's milestone checkboxes now reflect completed
source inventory/backups, staging creation/update/isolation, framework/hosting review,
quick/scoped CI implementation and local R2 publication/reader proof. Compound items
were split so local implementation does not imply remote or production acceptance.
The plan has one current milestone table; stale append-only execution notes were
replaced with a current pointer to this historical evidence log.

Final-head quick Check 40142927680 succeeded. Ready-state full Linux Check
40143210893 on #756 head 93195f54 has passed tests, content compilation, lint, build
and content update/rollback and is executing the actual full browser step. Main's
real full baseline was recovered and revalidated after its PR branch deletion:
main74 tree bb79f2438a1107cd07cbc7f9848241a876f20458, full run 40132015502,
job 120985578272 and artifact 12575882205. The saved read-only result is
arkpedia-ci-migration/.cache/main74-full-baseline-proof.json.

The maintainer explicitly requested Google/Discord logos in an asset repository.
Image-assets #55 passed full Validate 40144011854 and merged at
75bca3430542ff200f79b60621999a6c18c16b1d. Existing essential-icons/google.png and
essential-icons/discord.svg paths preserve the original official bytes; the generated
manifest adds exactly two entries, retaining all 15,967 prior rows unchanged.
Both actual immutable public files returned 200 and matched source/manifest hashes:
Google 2,947 bytes, Discord 1,310 bytes. Provenance is sources/provider-brand-icons.json;
public verification is E:/Projects/.tools/provider-assets-public-proof.json.
The accounts owner is adopting these code-owned image URLs without allowing an old
runtime content release to rewrite them to an image revision that predates the files.
CF #761's previous external-media failure occurred before browsers and its source
remains held for this requested delivery change. No audit exception or fake external
manifest entry is needed; no production data pointer has been advanced here.


### Full-check diagnosis and bounded repair

The first ready-state full Check 40143210893 finished with 1,460 passes, 217 skips,
one failure and one dependent case not run. Its sole mobile archive Back failure
reported an exact 788px mismatch. No code was merged. An isolated local Linux
Chromium reproduction against bundled output reproduced it in two of 30 unchanged
runs (28 passed, 40.9s). Instrumented concurrent runs reproduced three failures:
the fixture sampled 3,728px before the action, Playwright scrolled the row to 2,940px
before clicking, and the app correctly saved and restored 2,940px with 72 rows.
The test compared the wrong departure point; no runtime restoration bug was shown.

Commit 0f5f4b27c8c9d35c24538ef6ee5095b13c19e64c changes only the existing archive
fixture to capture actual click-time departure. It retains the greater-than-500px
depth, at-most-eight-pixel restoration, visible-event assertion, timeout and zero
retries. Corrected Linux stress passed 30/30 across three workers in 37.8s; all four
desktop/mobile navigation cases passed in 4.7s, with TypeScript/diff checks passing.
The local build remains functional diagnostic output, not a deployable Windows
artifact or Actions reuse proof. Native Linux browser dependencies were extracted
inside E:/Projects/.tools; system packages were not changed. Both isolated servers
(Windows 3309 and Linux 3310) were stopped. The user's 3192 browser/server was untouched.
Evidence: arkpedia-ci-migration/.cache/scroll-repro-evidence.json and
.cache/scroll-diagnostic/result-{0,2,4}.json. New-source full Check 40145743982 is live;
the failed previous handle is retained and was not blindly rerun.

The accounts owner froze CF #761 at 9cd820f1 with published provider image delivery,
no global data-pin changes, data URIs or external-media audit exceptions. Its full
Check 40144480430 is running. Local published-image eight-state checks, all 34 account
cases and 12 representative shared-image/navigation journeys passed. If this source
passes, its real Sync now explanation follow-up will also carry the exact fixture
repair and exercise selected browser coverage/reuse. #759 stays held through that
proof, avoiding an automatic CF baseline movement.

A main-based documentation-only candidate aa4ab2c7 copies just plan/progress/deferred
inventory and adds their docs index link, excluding all unreleased dev source in the
historical progress branch. Thirty relative file links resolve. It remains local
until the new CI policy lands, when it can verify the real docs/no-browser path.
GitHub API webhook inventory returned zero repository hooks for app, data and both
simulators; this does not audit provider-managed Git integrations or external links.

### Read-only account promotion review and second CF result

The coordinated dependency review is preserved in account-main-promotion-review.md,
linked from the deferred-feature inventory. Main0f versus frozen CF9cd has293total
entries including infrastructure, tests and route renames; the account graph reaches
186files/52differences/zero unresolved local imports. It is not a batch copy list.
The versioned settings contract, archive-before-replacement hooks and global restore
listeners are genuine prerequisites. Keep player/provider identities mounted and
remount only page content. Vercel/unbound account503 behavior, pilot database/identity
preservation, callback/cookie origins, noindex-with-auth and provider-specific analytics
remain separate acceptance gates. No account code/resource changed for this review.
Repo and Production environment secret names show no CFdeploycredential; no values
were read. Local WranglerOAuth is not CI authentication. GitHub webhook metadata
shows zero repo hooks on app/data/bothsimulators, not absence of provider Git apps.

CFfull40144480430 finished with1499passes/217skips/2failures/1dependent not run in
18minutes of browser execution. One is the same proven788px navigation fixture race;
the owner cherry-picked0f locally as36dd98e9 but has not pushed another source yet.
The other is a desktop/light chibi transient-animation assertion (Special versus
Sleep); its app/test source is identical between main and CF, and the owner is
instrumenting the actual start/queue/timing before choosing any repair. No OOM was
reported and no bounds/retries were widened. The root’s released bundled local
.next and isolated diagnostic ports3309/3310 are temporarily owned by that session
for this focused reproduction; do not rebuild or mutate the output until released.
The user's3192browser/server stays untouched. Mainfull40145743982 remains live.

Docs-only draft #762 now contains five documentation files,32relative links checked
with none missing, and no runtime or workflow diff. Keep its main merge held during
current release/selected-proof sequencing; existing docs paths-ignore builds nothing.


### Repaired CF source and measured storage baseline

CF #761 is frozen at1add3b11220d00d43af936ca4af8d83bbba01dd4 with full Check
40147078074 live. It includes exact navigation repair36dd98e9 and a bounded chibi
fixture correction: controllable browser time measures the same two-second Special
window and eventual Sleep assertion without wall-clock/protocol overhead. Original
fixtures passed six normal and six CPU4x probes; the exact previous CI stall cause
remains unproven, and no runtime animation defect was observed. Corrected actual
source passed12Linux desktop/mobile/theme/repeated cases in1.3minutes, plus six
CPU4x clock probes; TypeScript/diff pass. Production code, assertions, timeouts and
zero retries are preserved. The owner confirmed lingering Linux next-server PID542
had the root CI cwd, terminated that exact diagnostic process, and verified3310free.
3309had no listener. The local .next artifact is released again;3192was untouched.

The account promotion review now correctly lists ten cloud-account modules and
explicitly retains encrypted OAuth-row/auth-secret compatibility across a reviewed
D1 migration. Copying rows alone is not an approved identity migration.

Wrangler/GraphQL read-only queries supplied actual sampled R2 storage and calendar-
month operation baselines, without object contents or names and without any provider
configuration/write. Raw account telemetry stays in local cache evidence rather than
this repository: arkpedia-ci-migration/.cache/r2-current-storage-metrics.json and
r2-month-operations-metrics.json. Latest sampled bytes are not billed GB-month usage,
and calendar month need not match the account invoice cycle. Actual CF/Vercel bills,
CPU/build usage and forecast remain open; a separate Cloudflare dashboard browser
sign-in is pending. CLI login/deploy access remains valid. No pilot bucket was created.

Recomputed the original two pinned manifests, checking their preserved SHA256 first:
8,963logical paths each; first8,849unique payloads total258,176,640bytes plus original
manifest3,095,796bytes. Snapshot two adds206unique payloads/118,106,269bytes and its
3,095,381-byte manifest. Union9,055payloads/376,282,909bytes plus6,191,177manifestbytes
is382,474,086bytes before pointer/R2metadata. This supersedes treating path count as
unique object count; transferred/compressed download bytes are not stored bytes.
Evidence: release-ux/.cache/r2-two-snapshot-size-audit.json. No remote data write.
Installed OpenNext R2 cache code keys entries by build ID; prefix usage/retention
still needs review before any cleanup. Local pilot proof does not authorize deleting
active/rollback/old-tab cache data or switching production delivery.

Real GitHub artifact API also confirms zero artifacts from failed root40143210893,
failedCF40144480430 and successful draft40142927680. None uploaded reusable coverage
markers. Main’s repaired-source full40145743982 remains live at0f5f4b27.


### Verified checkpoint and checklist refresh — 2026-10-25 01:20 UTC

The milestone checklist now distinguishes implementation, live pilot verification
and final production acceptance. CF #761 is complete: full Check 40147078074 at
1add3b11 passed 1,502 cases/217 intentional skips in 16.2 browser minutes. Merge
6ed9cfa4 reused full artifact 12581870902 in push Check 40149121837. Native build
fb36b36c-479c-4f1e-968b-6f6ad6981a75 deployed clean version
e5517c8d-92da-4d93-94d8-90d2643307f0. The accounts owner verified actual pilot
OAuth starts/private APIs, eight provider-logo states, autosync timer/focus behavior
and healthy release status. This completes CF adoption, not main consolidation.

Main's second full Check 40145743982 failed with 1,460 passes, 217 skips, one
close-button paint failure and one dependent case not run. Exact CI cause remains
unproven; local normal/CPU-throttled probes did not establish a runtime defect.
Fixture-only ddc6e89a waits for actual unhovered/settled state before retaining every
strict paint/size/hit/keyboard assertion. Affected tests passed 51 cases/three
intentional skips; eight throttled focused cases passed. A persistent red-fill
negative control still failed the unchanged no-fill assertion. Chibi-only clock
repair was separately adopted as 28fa9c7a. Current exact #756 head ddc6e89a has full
Check 40148916171 in progress; main74 remains dirty and no new main release is claimed.

Actual narrow follow-up #764 at 32e756de has Check 40149320709 in progress. Its
execution ledger, partial artifact and actual merge-push reuse still need proof.
Keep #759 and docs #762 held until that proof finishes; do not move the CF baseline.

Read-only simulator GitHub metadata confirms both repository identities, no Pages,
and complete empty deployment lists. Cloudflare Pages project inventory is empty.
Evidence is migration-backups/simulator-live-github-metadata.json and
ci-migration/.cache/cloudflare-pages-projects.json. These APIs do not prove absence
of provider-managed Workers/Vercel integrations or external incoming consumers.
No simulator name/archive, DNS, branch retirement, R2 publication or billing change.
Actual invoice/CPU/build comparison still awaits the separate dashboard sign-in.


### Preview artifact prerequisite and actual narrow-run fallback

The actual #764 run40149320709 selected full coverage because tracked generated
data/quarantine.json and next-env.d.ts changed during build validation. The owner
confirmed valid baseline provenance via actual API replay, then cancelled this
unintended full run to inspect its logs. No selected lane/partial reuse is claimed.
An explicit read-only Check quarantine path and bounded canonical Next type-reference
handling are being prepared independently; blanket dirty-file exclusions/reset are
not the repair. Main full40148916171 remains live and untouched.

Independent main74-based preview prerequisite a20df575 is committed locally in
E:/Projects/arkpedia-preview-lifecycle, not pushed or deployed. It records archive
identity/config/checksum in the staging artifact and provides a non-executing,
bounded verifier/extractor. Seven safety tests pass on Windows and Linux; workflow
YAML parses. The existing real19b artifact from successful run40129816201 validates
10,503 entries/323,467,864 expanded bytes and its exact clean identity. The receipt
for this historical archive is a local backfill test, not a CI-produced attestation.
Actual Linux extraction60951 completed successfully. Independent verification1407
confirmed the exact 9,954-file set and byte-identical hashes for the Worker, both
build identities, reviewed config and a cache filename containing a colon. Evidence:
preview-lifecycle/.cache/historical-extraction-proof.json. No diagnostic server remains.
No credentials, provider settings, runtime sources or production resources changed.
