# Retired dev branch and preserved work

The maintainer authorized retirement on 2026-10-26. Native Cloudflare Worker
Previews replace the old Vercel dev site. New work branches from main and uses
focused PRs and explicit isolated Previews.

## Recovery refs

| Repository | Archive tag | Preserved commit |
| --- | --- | --- |
| arkpedia/arkpedia | archive/legacy-dev-2026-10-26 | 5b0e72a8cd0c77d2711978905522c2f875bc8750 |
| arkpedia/arkpedia | archive/stage-producer-763-2026-10-26 | 7c94fb8516030728586005b01e75620bfc9b4c3b |
| arkpedia/arkpedia-data | archive/legacy-dev-2026-10-26 | e3c6952ab7147ec8fb27d2face9361fd948a11b9 |
| arkpedia/arkpedia-data | archive/legacy-dev-live-2026-10-26 | 1fb3d08d3f9b9d3d07e71102c7daf7cce55ca8e9 |

The app archive retains the entire dev history and all unreleased base simulator
and optimizer code, including lib/base/baseSimulation.ts, baseOptimizer.ts,
calculateBase.ts and specialSkillKeys.ts. Extract dependency-complete features
individually into current-main branches. Do not merge the archive wholesale.

PR763's canonical stage producer has its own preserved ref. The separate stage
simulator's immutable data snapshots and source receipts remain valid; no
simulator data or implementation is removed by this retirement. Its old PR base
must be retired with dev; future producer updates should be ported as a focused
main-based PR. The producer head branch remains available for that extraction.

## Retirement boundaries

- Remove dev from Vercel deploy targets and publishing channels.
- Remove main-to-dev and dev-to-cloudflare synchronization and its Check callback.
- Remove nightly/post-deploy dev publication while preserving the successful-main
  editorial notification and checked production release gates.
- Pause the old arkpedia-dev Vercel project; retain deployments/settings for
  recovery. Disconnect its Git integration and remove its unused CI credential.
- After this change lands, remove the app dev and data dev/dev-live branch refs
  only after confirming each archived commit still matches its branch tip.
- Keep main/live, the active pilot, native Preview, cloudflare's preserved work,
  base simulation work and the canonical stage-simulator producer checkpoints.

Historical synchronization runbooks and scripts are superseded. Restoring the old
deployment or publishing channel requires an explicit reviewed change; creating
a branch named dev alone must not reactivate deployment or content publication.
