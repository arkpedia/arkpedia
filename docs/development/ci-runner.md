# CI runners for the private app

## Website deployments: NAS only

Deploy's build/upload job requires `[self-hosted, Linux, X64, arkpedia-nas-build]`.
All three NAS runners carry that label, and `truenas-deploy` carries only it, so no Check
or content job (which ask for `arkpedia-nas`) can take that runner and a deploy starts at
once instead of waiting behind two Checks. If every NAS runner is offline, it waits; it
cannot fall back to Vercel, GitHub's hosted machines or the VPS. The lightweight target-list job may still use the VPS.
`npm run deploy:vercel` dispatches this workflow for the remote main/dev branch
(`DEPLOY_BRANCH=dev` selects dev); it no longer builds on the invoking computer.

Both Vercel projects must have their Git repository disconnected and their
Ignored Build Step set to `exit 0`. Deploy verifies these settings before building
and fails with a repair instruction if they drift. `vercel.json` and its ignore
script also disable Git builds, including production and `[preview]` commits.
Use GitHub Actions to deploy; do not reconnect Git or use dashboard source rebuilds.

Vercel still calls artifact extraction and publishing "Running build". Its log
must say `Using prebuilt build artifacts from .vercel/output`, with no Next.js
compilation. Deployment metadata `arkpediaBuildRunner` and `arkpediaBuildRun`
identify the NAS runner and GitHub run. Hosting/functions remain on Vercel.

## Checks and content preparation

Check and Prepare content release run on the runners that carry the label the
repository variable `ARKPEDIA_RUNNER` names:

```yaml
runs-on: ${{ vars.ARKPEDIA_RUNNER || 'ubuntu-latest' }}
```

- **Set**: the jobs run on the self-hosted runners that carry that label. Registered to this
  repository only:
  - `truenas` (label `arkpedia-nas`): a container on a maintainer's NAS, 11 GB and up to 7 of its
    8 cores, taking Checks and content jobs one at a time. A second Check runner (`truenas-2`, 6 GB
    each) ran from 2026-10-02 to 2026-10-29: two Checks side by side shared the cores, took 40 to
    45 minutes each instead of about 15 alone, starved each other's browser suites into
    timeouts, and both runners peaked at their 6 GB. One runner with the memory of both finishes
    two Checks in about the time two side by side took.
  - `truenas-deploy` (label `arkpedia-nas-build` only, since 2026-10-13): a second container in
    the same stack, up to 4 cores and 8 GB, that only Deploy and the production release use (a
    release that landed in a 6 GB Check runner was OOM-killed on 2026-10-29). A deploy is a
    `next build` and an upload, about 3 minutes.
  - The two take 19 GB of the NAS's 31; its own apps take 8 to 10 GB at their peak.
  - `hetzner-vps` (labels `arkpedia-vps`, `arkpedia-self`): a maintainer's VPS, 2 vCPUs,
    about 3 GB. A full Check takes about 19 minutes.

  Since 2026-09-25 the variable is `arkpedia-nas`: the NAS takes every job and the VPS
  stands by. GitHub has no runner priority, so with `arkpedia-self` an idle VPS would take
  some jobs and run them almost three times slower. If the NAS is down, set the variable
  to `arkpedia-self` (both) or `arkpedia-vps`.

  The public repositories keep GitHub's hosted runners, which are free for them.
- **Unset**: the jobs run on GitHub's hosted runners and count against the
  organization's 2,000 private minutes a month ([automation.md](automation.md#cost-limits)).

Three jobs take seconds and only call GitHub's API: Check's `seen` (does a pull request's
green Check already vouch for this push?), Deploy's `targets`, and Prepare content release's
`start-dev` (one `gh workflow run` that starts the dev channel's run after the scheduled one).
They run on the label `ARKPEDIA_LIGHT_RUNNER` names (`arkpedia-vps`), falling back to
`ARKPEDIA_RUNNER` when it is unset. Otherwise a merge's push waited in line behind another
pull request's whole Check on the NAS (15 minutes on 2026-10-02) before Deploy could start.

Switching Check/content runners is a settings change, not a commit (Deploy stays NAS-only): **Settings → Secrets and variables →
Actions → Variables**, or `gh variable set ARKPEDIA_RUNNER --body <label>` /
`gh variable delete ARKPEDIA_RUNNER`. A job queued for a label whose runners are all
offline waits up to 24 hours before failing, so check **Settings → Actions → Runners**
first if runs sit in *Queued*.

## Why

In September 2026 the private minutes ran out on the 25th (Check is about 13 minutes
per push to main). With the $0 budget GitHub then refuses to start any job here, so
nothing deploys and the daily content release stops until the month resets.

## Dependabot pull requests never run here

A self-hosted runner keeps its files between jobs: its tool cache, npm cache and the
runner itself. A Dependabot pull request installs dependency versions nobody has
reviewed yet, and code it plants would run in the next Deploy or content release job,
which hold the Vercel token and the deploy keys. So Check sends Dependabot's pull
requests to GitHub's hosted runners, which start fresh and are given no secrets, whatever
`ARKPEDIA_RUNNER` says. While the private minutes are used up, those checks do not start
until the month resets.

Pull requests from maintainers run on the self-hosted runners: they are the same people
and the same code that push to main.

## What differs on the self-hosted runners

- Timeouts are longer (Check 60, Deploy 45, content release 105, stage refresh
  30 minutes) for the smaller machines. Up to 30 of the content release's minutes can
  go to waiting for arkpedia-data's nightly import, which runs on GitHub's runners, so a Check
  queued behind it on the same runner can wait that long too.
- Playwright installs Chromium without `--with-deps`: the system libraries are
  installed on the machines once, and the runner user has no sudo. The NAS image pins
  the Playwright version it installs them for; bump it with `@playwright/test`.
- Jobs cannot reach private, tailnet or link-local addresses, or the machines' own
  services. They need only the public internet (GitHub, npm, Vercel, the mirrors and
  the wiki).

How each runner is built, and how to change or remove it: [infra/runners/](../../infra/runners/README.md).

Workflows must not assume a fresh machine: write temporary files under
`$RUNNER_TEMP` (cleared after every job), never `/tmp`.

Check's full and selected browser steps set `TMPDIR` to `${{ runner.temp }}` and
`PW_WORKERS=5` on the NAS (2 on a GitHub-hosted runner), overriding the runner
container's older three-worker default. On the 7-CPU, 11 GB Check runner the full
suite took 1,671 s with two workers and 824 s with five (2026-10-29, the whole Check
36.5 → 22.3 minutes), with the container peaking at 4.4 GB and about six CPUs busy.
The nightly Browser audit uses the same count.
Chromium's profiles and its `--disable-dev-shm-usage` IPC fallback otherwise use
the NAS's 2 GB RAM-backed `/tmp`, sharing the container's 6 GB memory allowance.
Keep that browser scratch space on the job's disk-backed directory. The full
and selected suites keep their existing coverage, assertions and zero retries.

## Avoid repeated checks

Pushes and same-repository pull requests first ask whether a completed, successful
PR Check already tested their exact prospective merge tree. A history-only rebase
can reuse that proof. Every file belongs to the tree, including tests and workflows:
a changed file or changed integration result requires its own Check. The proof must
come from this repository's Check workflow, with a matching unexpired artifact and
a successful completed run from this repository. PR reuse also requires the same
target branch; unknown base metadata runs the full Check. Missing or unreadable evidence
runs the full Check. Forks and normal manual rechecks always run it. Automatic branch
integration explicitly opts in to the same exact-tree lookup on its disposable
`sync/main-to-dev-*` branch; other branches cannot enable that manual opt-in. Only full
checks record artifacts; a reused result cannot create a new proof chain.

Check runs application regressions and `npm run test:py` concurrently in one step;
Python suites run sequentially within their own process and use temporary fixtures.
Both verdicts are collected and either failure fails Check. `test:py` discovers
`scripts/**/test-*.py`, so a new importer suite joins the same runner automatically.

After content export, Check runs `prebuild` once, then typecheck and the warning-capped
lint. Generating first matters: prebuild can change JSON imported by TypeScript.
Only the two Check builds set `ARKPEDIA_BUILD_CHECKS_PASSED=1`, with `CI=true`, to
avoid repeating those explicit gates inside Next. The bundled build invokes
`npm run --ignore-scripts build` followed by `npm run postbuild`; postbuild still
checks deployment traces and client chunks. Normal `npm run build` and Deploy
retain their lifecycle scripts and Next validation, including manual deployments.

The bundled-data build and the live-content build prove different contracts; keep
both. The browser suite still runs desktop and mobile unless the existing
input-graph/green-base guard proves the change irrelevant or the PR release selection
narrows it to the affected journeys ([ci-impact-planning.md](ci-impact-planning.md)).
A push to main that no PR proof vouches for (another PR merged in between) plans its
browser lane the same way, from main's full-browser ancestor, rather than running the
whole suite again. A normal manual Check always
runs it; an automatic integration may instead reuse a completed exact-tree PR Check.
Content preparation's data tests and publication checks are also separate
from code checks: new source records can fail even when the app code is unchanged.

Check, Deploy and Prepare content release restore the remote npm cache only on
GitHub-hosted runners. Self-hosted runners keep their own npm cache under their
persistent home volume; setup-node must not download/unpack the whole archive over
it on every job. A cold self-hosted home remains correct: `npm ci` fetches missing
packages and verifies lockfile integrity. No node_modules directory is reused.
The observed remote archive was 484 MB and cost 44 seconds in Check and 84 seconds
in Deploy (2026-10-16). See [setup-node's cache inputs](https://github.com/actions/setup-node/blob/v7/action.yml).

Deploy has one install owner: Vercel runs `npm ci --include=dev` from `vercel.json`,
without a redundant outer install. Its former automatic `npm install` changed the
lockfile after checkout and produced dirty public build metadata despite a green
upload. The built output must now match the clean checked commit/fingerprint,
schema, channel and production role before upload. The public alias must verify
that same identity before the deploy report closes or held content resumes.
This uses Vercel's [per-deployment install command](https://vercel.com/docs/project-configuration).

## Keep the code graph clean

Check runs `audit:unused` once, alongside the existing style and type gates. Knip's
framework/manual entrypoints are exercised by a small fixture that deliberately adds
unused files, exports and dependencies. The compiler's noUnusedLocals flag reuses the
existing typecheck rather than adding another compiler pass. Shared .mjs declaration
twins have export/parameter-count checks, and a test inventory covers every suite.
The editorial watcher's deterministic regressions run in npm test instead of on every
ten-minute poll. `npm run check:local` is the non-build/non-browser local entrypoint.

## Draft feedback and release checks

Same-repository draft PRs run application/Python regressions, generated inputs,
types, lint, style and code-graph checks. They do not build the website, run browsers
or create a reusable full-tree Check artifact. Marking the PR ready for review
triggers the readiness profile with proportional browser coverage; forks and
manual checks retain full coverage.
GitHub prevents merging a draft. A passing draft job is development feedback only.

The quick job uses the existing heavy runner pool and dependency-isolation rules;
it does not occupy the dedicated deployment runner or move unit work onto the light
metadata pool. Queue time is still subject to active full jobs. Measure the actual
profile before claiming a speedup. The [browser coverage policy](ci-impact-planning.md)
selects core navigation/consent and affected functional journeys for classified PR
changes, including feature CSS. Shared chrome runs representative populated account,
music, story, base, reward, planner and game journeys. Exhaustive layout, motion,
tab-geometry and close-button contracts run in the independent **Browser audit**
workflow after pushes to main, or manually. That workflow cannot gate Deploy or
produce reusable Check evidence. Unknown inputs, toolchain changes, forks, manual
Checks and a missing trusted baseline retain full coverage. Actual selected/omitted
identities stay in the evidence. Partial
evidence has its own artifact and cannot masquerade as a full baseline. Normal
manual checks remain full; exact-tree sync reuse must validate completed PR proof
and any recorded full baseline.
