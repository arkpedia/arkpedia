# Browser impact planning: shadow phase

`scripts/ci/browser-plan.mjs` is an observation tool. It does not change Check,
Playwright, deployment gates or the existing exact-tree proof. Its output explicitly
sets `reusableCheckProof: false`; neither a reduced plan nor its tests approve a release.

The initial narrow families are Story, Schedule, Music and Accounts. A candidate plan
contains the family's existing specs plus shared navigation/Back journeys. Shared
shell/config/style changes, unknown inputs, missing core/family tests, missing green
baseline and explicit full-check requests retain the full suite. Shared browser
fixtures also require full coverage. Account-related plans retain import, cloud-account
and music-continuity scenarios; server owner/CAS/consent/credential-exclusion unit
checks remain in the unchanged application suite.

The shadow planner now follows reverse references transitively across runtime
pages, components and libraries. A consumer outside the changed family, missing
dependency evidence or an unreadable runtime source keeps full coverage. It reuses
the existing conservative reference scanner; comments can add edges and widen a
plan. Storage, emitted events, filesystem reads, computed imports and unknown
feature input formats now also force broad coverage. This is a conservative blocker,
not a complete proof of every possible runtime side effect.

Observed against the 93-spec Cloudflare checkout on 2026-10-24:

| Changed file | Observed plan | Reason |
| --- | --- | --- |
| `components/story/StoryMapView.tsx` | 7 specs | Story family and core navigation |
| `lib/story/storyProgress.ts` | Full | Account backup consumes progress |
| `lib/music/youtube.ts` | Full | Community stream cards consume music utilities |
| `lib/schedule/gameWindow.ts` | Full | Homepage banners consume scheduling utilities |

These are simulations, not executed browser results or runtime estimates. Eleven
planner unit tests pass, including a transitive story-to-account consumer and
missing/unreadable dependency evidence, global effects and computed imports.

An observation pass parsed the successful [full Check 40106791726](https://github.com/arkpedia/arkpedia/actions/runs/40106791726):
93 specs, 1,454 passing cases and 217 intentional skips. Summed case execution was
2,975 seconds across parallel workers; this is **not wall time**. The largest sums
were layout census (634 seconds), chibis (405) and motion (244). Do not remove these
checks from shared UI, asset or framework changes.

On the rebased 94-spec accounts tree, a StoryMapView-only simulation still selects
seven existing specs: 28 previously measured passing cases, with 33 seconds summed
case execution in that recorded run. That suggests useful scope reduction, but it is
neither a new execution nor a promised feedback time. The new cloud-account spec
has no timing in that older run; plans containing it report missing timing rather
than treating its cost as zero. CI behavior remains unchanged pending coverage-proof
integration and real candidate runs.

The existing build/browser dependency closure can identify tooling changes that
browsers do not read. A caller without that proof falls back to full work. Changed
specs are included by name. Rename callers supply both old and new paths. No new
test-specific skips, looser tolerances or automatic retries are introduced.

Local simulation:

```sh
node scripts/ci/browser-plan.mjs --base origin/cloudflare
node scripts/ci/browser-plan.mjs --base origin/cloudflare --assume-green-base
node --test scripts/tests/test-browser-plan.mjs
```

`--assume-green-base` is explicitly a simulation input. The eventual CI integration
must obtain its baseline evidence from trusted GitHub run/tree records, not an
operator flag. Without it this tool plans the full suite. It prints JSON, not
`GITHUB_OUTPUT`, and emits no artifacts or Check markers.

Before activation:

1. Inventory cross-feature imports and data/storage side effects; expand impacted
   families or use full fallback for shared consumers. A folder name alone is not
   sufficient proof that a change affects only that feature.
2. Compare plans against past regressions and collect actual test counts/durations.
   Spec-file counts are not a timing estimate; one census file can hold many cases.
3. Validate against the combined accounts/staging tree, preserving auth, owner isolation,
   CAS, game-data consent and persistent playback across cloud restore.
4. Record policy version, exact tree/base, selected and omitted coverage, baseline
   proof and outcome in a machine-readable manifest. Update exact-tree reuse to
   validate that evidence; never present targeted coverage as a full regression run.
5. Keep main/release/manual broad coverage available. Activate only after observed
   plans match actual dependencies, then measure p50/p95 feedback time.

This work is isolated in `E:/Projects/arkpedia-ci-migration`. The accounts owner
continues in `E:/Projects/arkpedia`, and staging PR #739 is maintained separately in
`E:/Projects/arkpedia-release-ux`. Accounts pilot deploys before staging rebases;
new CI gate behavior will not be activated during that deployment.

## Existing census selection

`browser-coverage.mjs` consumes Playwright's actual `--list --reporter=json`
inventory. For a targeted runtime family it adds that family's existing layout
census routes and every registered query/state/theme/project case. It preserves
the census's current assertions and tolerances. A spec-only plan with no runtime
family includes the complete page census. Unknown census naming, missing route or
project coverage, or a changed file inventory falls back to full. Collection errors
and ambiguous test identities fail before emitting a usable list. Global CSS
changes always retain full coverage: the JS import graph does not prove where a
global selector or variable takes effect.

The inventory and selected/omitted case identities have a SHA-256 fingerprint;
`outcome: planned-only` and `reusableCheckProof: false` remain explicit. This is
planned coverage, not evidence the cases executed. The full-census stale-entry
audit is omitted from partial runs because it requires every page measurement;
full runs retain it. Existing census cases that deliberately measure only one
theme keep that scope; selecting them does not claim additional theme coverage.

On the 94-spec shadow checkout, a StoryMapView simulation selected 38 of 1,679
listed cases, including desktop/mobile story census cases. A second real
Playwright collection using its supported `--test-list` returned exactly those
38 identities, with no extra project dependency or completion-audit tests. This
proves list selection, not browser execution or timing. Nineteen planner/coverage
unit cases pass. Current main/PR/release CI remains unchanged.

```sh
npx playwright test --list --reporter=json > .cache/browser-inventory.json
node scripts/ci/browser-plan.mjs --base origin/main --assume-green-base --inventory .cache/browser-inventory.json
node --test scripts/tests/test-browser-plan.mjs scripts/tests/test-browser-coverage.mjs
```

The emitted `coverage.testList` uses Playwright's project/file/title format,
relative to its configured test directory. Before activation, validate completed
results against this exact list and trusted baseline; do not reuse the old
full-tree Check artifact name for this partial evidence.

`executionEvidence` separately rejects a collection-only report, missing/extra
identities, interrupted outcomes and retries. Intentional skips and expected
failures are counted separately from passes; summed case durations are not wall
time. An actual small Playwright contract fixture verified reporter handling of
one pass, one runtime skip and one declared expected failure. It did not run the
website suite. The resulting ledger still cannot vouch for Check: trusted baseline,
policy/configuration identity and artifact consumers remain to be integrated.
