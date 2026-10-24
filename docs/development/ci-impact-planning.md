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
