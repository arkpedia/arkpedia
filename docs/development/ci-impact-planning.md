# Browser coverage policy

Readiness checks retain source/type/lint/build/publication gates and run existing
browser contracts proportionally. Assertions, tolerances and zero retries are unchanged.

| Context or change | Browser coverage |
| --- | --- |
| Same-repository draft | Quick source/regression feedback; no website build, browsers or reusable artifact |
| Narrow Story, Schedule, Music or Accounts runtime change | Core navigation/Back, affected families and existing census routes/states/themes/projects |
| Tooling outside the proved browser/build dependency closure | None, with explicit omissions and a full baseline |
| Shared shell/storage/events/global CSS, dependencies, CI policy or unknown impact | Full |
| Normal manual check, push without reusable proof, fork or missing baseline | Full |

Marking a draft ready starts the readiness profile. A quick job passing does not
supply a full-browser baseline or approve deployment. The first validation of this
CI policy itself retains the full suite.

## Impact and baseline

`browser-plan.mjs` follows reverse consumers transitively. TypeScript parsing
handles static/literal-template imports, exports, import types and CommonJS.
Computed imports, unresolved paths/packages/aliases, redirected/inherited path
configuration and missing parse evidence fail closed. Declared packages and Node
builtins are distinguished from repository inputs. Shared storage/events and
filesystem reads retain broad coverage. A folder name alone does not prove isolation.
Unrelated importer/workflow/runner inputs retain the established no-browser choice
when the dependency closure proves the current build/tests do not read them.

`browser-baseline.mjs` searches at most 25 first-parent ancestors using bounded
GitHub run/artifact metadata. It requires successful actual full-browser execution,
not a green draft-only, targeted-only or skipped workflow. PR proof must bind an
unexpired exact-tree artifact, same repository and target branch; direct push/manual
proof binds the exact commit and branch. Cleared merged-PR associations are recovered
only through matching repository/head/base metadata and the actual merge tree.

The diff includes every change from that full ancestor to the current merge tree,
including previous targeted merges. API failures, missing inventory, uncommitted
generated inputs and exhausted baseline history retain full coverage. There is no
production assume-green flag. The standalone shadow CLI's simulation output still
cannot approve a Check.

## Actual execution

`browser-coverage.mjs` consumes Playwright's real JSON inventory. Narrow families
retain core navigation/mobile/Back journeys and every existing registered census
route/state/theme/project they affect. Spec-only changes retain the page census.
Unknown census naming or missing routes/files/projects falls back to full.

The supported `--test-list` selects existing cases. Partial runs omit the completion
audit that needs every census page; full runs keep it. Deliberately single-theme
cases keep their actual scope. `browser-lane.mjs` records tree, policy blob hash,
run/target, full baseline and selected/omitted identities. Completed JSON must match
that exact selection: collection-only output, missing/extra results, failures,
interruptions and retries cannot produce valid evidence. Intentional skips and
expected failures are counted separately. Summed case time is not wall time.

## Truthful reuse

Only actual full execution creates `checked-tree-<tree>`. Targeted/no-impact results
use `checked-policy-tree-<tree>-<policy-hash>` and `browser-evidence.json`. Drafts
upload neither. Uploads follow all gates and execution validation; cancelled or
failed workflows cannot vouch.

`already-checked.mjs` validates exact tree/policy/target/run, successful check,
execution-validation/upload steps and the downloaded ledger. It revalidates the
recorded full source through GitHub and its ancestry on the current head. Missing,
expired, malformed or inaccessible proof runs checks again. The metadata job uses
Node builtins only, without installing app dependencies.

Account plans retain authentication/import, cross-device and music-continuity
journeys. Application/Python suites retain API/session/owner isolation, privacy,
consent/deletion, migrations, CAS and archive preservation. These contracts must
not be removed for a timing improvement.

## Initial validation

Focused policy/import/census/reporter/workflow/reuse fixtures cover the boundaries.
Real Actions validation and a post-merge narrow PR probe remain required for initial
activation. A simulated selection alone proves neither execution nor timing.

One actual draft job took 3m20s of execution and uploaded no artifacts; this is not
a controlled benchmark or p50/p95. The current main-based Story Map simulation
selects 40 of 1,679 real cases, including the new deep-Back contract. A remote-live
probe correctly rejected a bundled/live story-count mismatch; matching bundled
execution passed 32 cases with 8 intentional skips in 27.4 seconds. That is local
functional selection/report proof, not deployable Windows output or reusable GHA
proof. Linux deployment-trace and full readiness gates remain unchanged.

During migration each branch keeps its content/account contract. Reconcile the CI
policy onto dev/Cloudflare before expecting scoped behavior there. Permanent branch
retirement follows the system-simplification gates.
