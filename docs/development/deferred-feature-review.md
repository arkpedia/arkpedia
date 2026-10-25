# Deferred feature review during consolidation

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
| Import diagnostics | Redacted raw-save download, extra source-shape diagnostics and `gameToken()` extraction | Confirm downloads remain off the public domain, identity redaction is adequate and no Yostar credentials or raw save reach server logs/cloud storage. The accounts owner reviews interactions with consent, saves and OAuth identity. |
| Music recovery and covers | Retry an already-refused primed Monster Siren file, API cover handling and updated playback regressions | Exercise refused media, retry limits, paused versus playing state, navigation and resume. Retain original playback-position assertions. This is separate from the test-readiness correction in PR #738. |
| Smaller product adjustments | Gacha control placement, regional banner/window references, stream/community links, planner/checkbox/close controls and associated styles | Review the actual hunks and affected journeys. Many references belong to the route-rename unit; separate only behavior that works without that migration. Do not treat all small diffs as cosmetic. |
| CI and import resource handling | Runner sampling/temporary-download cleanup, official-table disk downloads and per-version reuse, lint/audit updates | Preserve exact-tree proof, unknown-impact fallback and existing source/asset coverage. Measure actual queue/build/browser time. Do not activate a partial browser lane as full-suite proof. |

Several units share files. Extract dependency-complete changes into separate PRs
against main after the framework candidate lands; recreate the intended final diff
rather than blindly cherry-picking whole historical batches. Each PR records its
source candidate, dependent units, focused tests and remaining release checks.

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
