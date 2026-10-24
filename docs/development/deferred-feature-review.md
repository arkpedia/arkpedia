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
