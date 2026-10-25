# Deferred feature review during consolidation

## Current checkpoint after main hosting preparation, 2026-10-25

Fetched remote tips are main `b9ffe6dfa8163bf6bd7f8cf002788415433e3784`,
dev `5b0e72a8cd0c77d2711978905522c2f875bc8750` and Cloudflare
`de829d1eac0e1dc0efc17866e680b447650434df`. The complete main-to-dev net comparison
now contains 378 entries (15 additions, 109 deletions, 240 modifications and 14
renames); main-to-Cloudflare contains 299 (15 additions, 41 deletions, 229
modifications and 14 renames). Exact paths/statuses are retained in
`.cache/deferred-feature-main774-20261025.json`. Counts describe file differences,
not outstanding features or an approved merge.

Main now contains the accepted accounts implementation. The current Cloudflare
tip has no net differences under `lib/cloud-account/` or `pages/api/auth/`;
that bounded comparison does not establish parity of every account consumer,
deployment binding, database or OAuth origin. Conversely, the dev comparison
would delete released account and preview-controller files. Those deletions are
evidence of divergence and must not be carried into a product promotion.

Central versioned site preferences already exist on main. The remaining dev
change in `lib/settings/siteSettings.ts` adds a React `useSetting` hook; review
its consumers and any remaining technique preference behavior as the new unit,
rather than reintroducing the whole historical preferences implementation.
The sole current dev consumer is `components/techniques/TechniqueRecord.tsx`:
review its detailed-description checkbox together with optional excerpt/note fields,
finalization helpers and older-release/source-text fallback. An unused hook alone
does not migrate the intended feature.
Base simulation/optimizer files, technique clause/direction/excerpt helpers and
the route-name migration remain separate review units. Preserve the released
account/archive/restore contracts while extracting their dependency-complete
changes. The historical checkpoints below remain useful provenance and are not
the current file counts.

Inventory checked 2026-10-24 against framework candidate `868736506d1e72c71a61e7e702bafc35024e2eba`
and reconciled dev candidate `d8a8d30e`. Their net difference is 225 files, including
tests, documentation and lockfiles. This is a review inventory, not approval to
release dev. Both candidates retain the current production baseline in their history.

Use the net file difference rather than a list of commits absent from main:
squashes, dev twins and previous release merges make commit titles an unreliable
inventory of behavior still missing from production. Recompute this comparison
after each promotion; do not cherry-pick an old batch solely from its title.

## Review units

| Unit | Remaining implementation | Acceptance before promotion |
| --- | --- | --- |
| Cloudflare hosting | `output: 'standalone'`, OpenNext/Wrangler dependencies and configuration, Worker-safe server fetch options, content-channel selection | Vercel still builds; separately isolated staging proves cache/self-calls/queue and unavailable accounts without bindings. Preserve the account pilot's D1, OAuth and private responses when reconciling Cloudflare. Review independently of the product units below. |
| Navigation and route names | `config/renamed-routes.json`, renamed `pages/` files, navigation menus and route references in page builders, content publication and tests | Old bookmarks and query strings redirect correctly; canonical URLs and sitemap/search agree; a new app reads the preceding content release. Migrate app, content route map and consumers together. |
| Base simulation and optimization | `lib/base/baseSimulation.ts`, `baseOptimizer.ts`, `calculateBase.ts` and special skill keys; two new test suites | Review chronological simulation, team/rotation assumptions and imported-roster constraints against the design in `base-optimizer.md`. The new library files alone do not establish an exposed, complete planner UI. |
| Techniques and synergies | Clause/excerpt/direction helpers, classification and buff matching, record components and filters | Review representative operator text and effect targets, faction-name false positives, empty/filter states and mobile/light/dark records. Keep source text/provenance visible. |
| Central site preferences | `lib/settings/siteSettings.ts`, technique-detail preference and settings documentation | Versioned import/export validation, blocked-storage fallback and default behavior pass. Coordinate its payload contract with cloud-account backups; do not infer an account migration from the presence of an export helper. |
| Import diagnostics | Separate hardened structured activity-shape diagnostics from deferred raw-save export; `gameToken()` has no external caller | Migrate the shape unit only after identifier/output bounds and adversarial privacy fixtures pass. Raw export is not approved as-is; see the bounded review below. Preserve consent, specific Yostar-login removal, cloud reset and archive contracts. |
| Music recovery and covers | Retry an already-refused primed Monster Siren file, API cover handling and updated playback regressions | Exercise refused media, retry limits, paused versus playing state, navigation and resume. Retain original playback-position assertions. This is separate from the test-readiness correction in PR #738. |
| Smaller product adjustments | Gacha control placement, regional banner/window references, stream/community links, planner/checkbox/close controls and associated styles | Review the actual hunks and affected journeys. Many references belong to the route-rename unit; separate only behavior that works without that migration. Do not treat all small diffs as cosmetic. |
| CI and import resource handling | Runner sampling/temporary-download cleanup, official-table disk downloads and per-version reuse, lint/audit updates | Preserve exact-tree proof, unknown-impact fallback and existing source/asset coverage. Measure actual queue/build/browser time. Do not activate a partial browser lane as full-suite proof. |

Several units share files. Extract dependency-complete changes into separate PRs
against main after the framework candidate lands; recreate the intended final diff
rather than blindly cherry-picking whole historical batches. Each PR records its
source candidate, dependent units, focused tests and remaining release checks.

## Bounded import-diagnostics source review

The accounts owner reviewed exact main `b9ffe6df` / dev `5b0e72a8` source and exercised
synthetic inputs only. Main already wires `beginnerDiagnostics.ts` into the existing
report; `connectionDiagnostics.ts` is identical across these snapshots. A hardened
activity-shape addition and its existing diagnostic fixtures form the first separate
unit. Reject arbitrary numeric/identifying activity or field keys and bound list
traversal/output before promotion. No UI, cloud schema, relay or raw-save dependency
is required for that unit.

The dev raw export retains synthetic `accessToken`, `authorization`, free-text email,
numeric identity and timestamps. Its host gate also permits the real pilot, staging
and arbitrary hosts. It must not be called anonymous, date-free or dev-only. Keep it
deferred until redaction, strict host policy, explicit download/capture lifecycle,
reset races, output bounds and exclusion from cloud storage are separately accepted.
The public `gameToken()` extraction has no external dev consumer and is not a
diagnostics dependency; defer the unused export.

Do not port the dev `DataDialog`, `ImportDialog` or `GameSignIn` wholesale. Their
unrelated deltas undo released tabs, sign-out/pause-before-clear, controlled cancel,
specific Forget Yostar login behavior and accurate cloud consent wording. Preserve
main's cloud components, account page, SSRF/network restrictions and archive/CAS/
nonce/ownership protections. The source review is not an implementation or release.

## Hosting and account work outside this comparison

Cloudflare has additional edge/cache, isolated staging and account-pilot work beyond
dev. This table does not inventory those changes. Review the pinned Cloudflare tip
against reconciled dev separately, retaining the accounts owner's accepted contract
and [staging isolation](cloudflare-staging.md). The [current architecture](../architecture.md)
distinguishes the services and bindings.

Preservation already exists in annotated `migration-preserved/2026-10-24/*` tags
and a verified complete-history bundle. Preservation permits deliberate review;
it does not make branch deletion safe while deployment/content consumers still use
those refs. See the [migration plan](system-simplification-plan.md) for retirement gates.

## Reproducing the inventory

```sh
git diff --stat 868736506d1e72c71a61e7e702bafc35024e2eba d8a8d30e
git diff --name-status --find-renames 868736506d1e72c71a61e7e702bafc35024e2eba d8a8d30e
git diff 868736506d1e72c71a61e7e702bafc35024e2eba d8a8d30e -- pages lib components config next.config.js package.json
```

These commands inspect the reviewed candidates without switching or changing the
accounts session's checkout. The candidates and counts describe this checkpoint,
not an automatically refreshed dashboard.

## Main-based account and hosting promotion: current source review

This later review compares main CI candidate
`0f5f4b27c8c9d35c24538ef6ee5095b13c19e64c` with the accounts owner's frozen CF
candidate `9cd820f1b6615e6af1d5799f0ab131f2b2846eb4`. The complete comparison has
293 entries including renames, tests and infrastructure; it is not 293 product
features and does not replace the earlier 225-file checkpoint. Exact paths are
saved in `arkpedia-ci-migration/.cache/main-cf-promotion-source-diff.json`.
Both candidates are still under required CI; this review does not approve a merge.

| Review boundary | Required main behavior / acceptance |
| --- | --- |
| Accepted account implementation | The accounts owner reviews the dependency-complete API/auth/profile, consent, personal/game backups, CAS and pull-archive unit; preserve migrations through 003 and existing accepted data. Do not copy unrelated renamed routes, optimizer or techniques work. |
| Vercel compatibility | Keep main's conditional standalone output and Vercel analytics/dependency while www remains there. The account code must return private/unavailable behavior on a host without D1/OAuth, with no credential or raw game-save disclosure. |
| CF adapter and build | Adopt Worker target detection, audited bundle budget and accepted Better Auth workerd tracing without reverting main's staging isolation, noindex role, locked dependencies or Vercel build behavior. Preserve current cache/self-reference/queue bindings until a reviewed resource migration. |
| Content contract | Main currently reads live; the CF pilot reads dev-live. Verify the main-compatible release, old tabs, cached props and account links explicitly rather than importing route renames merely to make them match. |
| Candidate indexing and analytics | A main/live CF candidate still needs noindex on its alternate public hostname, with accounts available. Do not misuse staging role if that strips account configuration. Check canonical/host and cache/header behavior, and select analytics by hosting target rather than a permanent cloudflare branch name. |
| Account resources and origin | Current root Worker configuration names pilot D1 arkpedia-accounts-dev and the cf.mocchibird auth origin. Production database/pilot-data treatment, provider callbacks, cookies and canonical-origin acceptance remain explicit gates owned with the accounts session. No production resource/domain promotion is inferred here. |
| One CF build owner | Repo secret names and the existing Production environment were inspected: no Cloudflare deploy credential is configured there. Local Wrangler OAuth does not supply CI authentication. Prepare the reviewed build/deploy workflow and least-privilege credential requirement before requesting setup; preserve provider-native builds until their replacement is verified. |

Repository webhook API returned zero hooks for app, data and both simulator repos.
Provider-managed Git integrations, Workers Builds/dashboard configuration and external
consumers still need their own inventory. No source or provider setting changed in
this read-only review. Coordinate the main account port after CF's real selected-run/
partial-proof reuse gate, keeping the current full-check sources frozen.

The accounts owner completed the [dependency and migration review](account-main-promotion-review.md):
186 transitive files, 52 current differences and zero unresolved local imports.
This is a reviewed dependency graph, not a batch copy list. The versioned settings
contract, archive-before-replacement hooks and playback-safe global restore listeners
are real prerequisites; unrelated diagnostics, route renames and UI features remain separate.
