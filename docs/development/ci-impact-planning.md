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
