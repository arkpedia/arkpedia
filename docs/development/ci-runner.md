# CI runners for the private app

The three workflows in this repository (Check, Deploy, Prepare content release) run
on the runners that carry the label the repository variable `ARKPEDIA_RUNNER` names:

```yaml
runs-on: ${{ vars.ARKPEDIA_RUNNER || 'ubuntu-latest' }}
```

- **Set**: the jobs run on the self-hosted runners that carry that label. Two are
  registered, to this repository only:
  - `truenas` and `truenas-2` (labels `arkpedia-nas`, `arkpedia-self`): two containers on a
    maintainer's NAS, 4 of its 8 cores and 6 GB each, so two jobs run at once instead of
    queueing (since 2026-10-02; one runner had every job wait behind every other).
  - `hetzner-vps` (labels `arkpedia-vps`, `arkpedia-self`): a maintainer's VPS, 2 vCPUs,
    about 3 GB. A full Check takes about 19 minutes.

  Since 2026-09-25 the variable is `arkpedia-nas`: the NAS takes every job and the VPS
  stands by. GitHub has no runner priority, so with `arkpedia-self` an idle VPS would take
  some jobs and run them almost three times slower. If the NAS is down, set the variable
  to `arkpedia-self` (both) or `arkpedia-vps`.

  The public repositories keep GitHub's hosted runners, which are free for them.
- **Unset**: the jobs run on GitHub's hosted runners and count against the
  organization's 2,000 private minutes a month ([automation.md](automation.md#cost-limits)).

Two jobs take seconds and only call GitHub's API: Check's `seen` (does a pull request's
green Check already vouch for this push?) and Deploy's `targets`. They run on the label
`ARKPEDIA_LIGHT_RUNNER` names (`arkpedia-vps`), falling back to `ARKPEDIA_RUNNER` when it is
unset. Otherwise a merge's push waited in line behind another pull request's whole Check
on the NAS (15 minutes on 2026-10-02) before Deploy could start.

Switching is a settings change, not a commit: **Settings → Secrets and variables →
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

- Timeouts are longer (Check 60, Deploy 45, content release 90, stage refresh
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
