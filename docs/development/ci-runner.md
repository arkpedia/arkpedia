# CI runners for the private app

The four workflows in this repository (Check, Deploy, Prepare content release,
Refresh bundled stage fallback) run on the runners that carry the label the
repository variable `ARKPEDIA_RUNNER` names:

```yaml
runs-on: ${{ vars.ARKPEDIA_RUNNER || 'ubuntu-latest' }}
```

- **Set** (`arkpedia-self` since 2026-09-25): the jobs run on two self-hosted runners
  that are registered to this repository only, and whichever is free takes the next job:
  - `hetzner-vps`: a maintainer's VPS, 2 vCPUs, about 3 GB for jobs.
  - `truenas`: a container on a maintainer's NAS, 6 of 8 cores, 8 GB.

  The public repositories keep GitHub's hosted runners, which are free for them.
- **Unset**: the jobs run on GitHub's hosted runners and count against the
  organization's 2,000 private minutes a month ([automation.md](automation.md#cost-limits)).

Switching is a settings change, not a commit: **Settings → Secrets and variables →
Actions → Variables**, or `gh variable set ARKPEDIA_RUNNER --body arkpedia-self` /
`gh variable delete ARKPEDIA_RUNNER`. Each runner also has its own label (`arkpedia-vps`,
`arkpedia-nas`), so the variable can pin every job to one of them. A job queued for
runners that are all offline waits up to 24 hours before failing, so check **Settings →
Actions → Runners** first if runs sit in *Queued*.

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

- Timeouts are longer (Check 60, Deploy 45, content release 60, stage refresh
  30 minutes) for the smaller machines.
- Playwright installs Chromium without `--with-deps`: the system libraries are
  installed on the machines once, and the runner user has no sudo. The NAS image pins
  the Playwright version it installs them for; bump it with `@playwright/test`.
- Jobs cannot reach private, tailnet or link-local addresses, or the machines' own
  services. They need only the public internet (GitHub, npm, Vercel, the mirrors and
  the wiki).

How each runner is built, and how to change or remove it: [infra/runners/](../../infra/runners/README.md).

Workflows must not assume a fresh machine: write temporary files under
`$RUNNER_TEMP` (cleared after every job), never `/tmp`.
