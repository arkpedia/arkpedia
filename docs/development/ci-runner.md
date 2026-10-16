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

- **Set**: the jobs run on the self-hosted runners that carry that label. Two are
  registered, to this repository only:
  - `truenas` and `truenas-2` (labels `arkpedia-nas`, `arkpedia-self`): two containers on a
    maintainer's NAS, 6 GB and up to 6 of its 8 cores each, so two jobs run at once instead of
    queueing (since 2026-10-02; one runner had every job wait behind every other). One Check
    alone takes about 15 minutes; two at once share the cores. Both also carry
    `arkpedia-nas-build`, so either can take a deploy.
  - `truenas-deploy` (label `arkpedia-nas-build` only, since 2026-10-13): a third container in
    the same stack, up to 4 cores and 6 GB, that only Deploy can use. A deploy is a
    `next build` and an upload, about 3 minutes.
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
  go to waiting for the public asset syncs, which run on GitHub's runners, so a Check
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

## Avoid repeated checks

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
input-graph/green-base guard proves the change irrelevant. A manual Check always
runs it. Content preparation's data tests and publication checks are also separate
from code checks: new source records can fail even when the app code is unchanged.

Check, Deploy and Prepare content release restore the remote npm cache only on
GitHub-hosted runners. Self-hosted runners keep their own npm cache under their
persistent home volume; setup-node must not download/unpack the whole archive over
it on every job. A cold self-hosted home remains correct: `npm ci` fetches missing
packages and verifies lockfile integrity. No node_modules directory is reused.
The observed remote archive was 484 MB and cost 44 seconds in Check and 84 seconds
in Deploy (2026-10-16). See [setup-node's cache inputs](https://github.com/actions/setup-node/blob/v7/action.yml).
