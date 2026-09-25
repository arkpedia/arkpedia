# CI runner for the private app

The four workflows in this repository (Check, Deploy, Prepare content release,
Refresh bundled stage fallback) run on the runner that the repository variable
`ARKPEDIA_RUNNER` names:

```yaml
runs-on: ${{ vars.ARKPEDIA_RUNNER || 'ubuntu-latest' }}
```

- **Set** (`arkpedia-vps` since 2026-09-25): the jobs run on a self-hosted runner, a
  maintainer's VPS registered to this repository only. The public repositories keep
  GitHub's hosted runners, which are free for them.
- **Unset**: the jobs run on GitHub's hosted runners and count against the
  organization's 2,000 private minutes a month ([automation.md](automation.md#cost-limits)).

Switching is a settings change, not a commit: **Settings → Secrets and variables →
Actions → Variables**, or `gh variable set ARKPEDIA_RUNNER --body arkpedia-vps` /
`gh variable delete ARKPEDIA_RUNNER`. A job queued for a runner that is offline waits
up to 24 hours before failing, so check the runner under **Settings → Actions →
Runners** first if runs sit in *Queued*.

## Why

In September 2026 the private minutes ran out on the 25th (Check is about 13 minutes
per push to main). With the $0 budget GitHub then refuses to start any job here, so
nothing deploys and the daily content release stops until the month resets.

## What differs on the self-hosted runner

- Timeouts are longer (Check 60, Deploy 45, content release 60, stage refresh
  30 minutes): the machine has 2 vCPUs and about 3 GB of memory for jobs.
- Playwright installs Chromium without `--with-deps`: the system libraries are
  installed on the machine once, and the runner user has no sudo.
- One job runs at a time. A Check, a Deploy and a content release queue behind each
  other instead of running side by side.
- The runner user cannot reach private or link-local addresses, or the machine's own
  services. Jobs need only the public internet (GitHub, npm, Vercel, the mirrors and
  the wiki).

Workflows must not assume a fresh machine: write temporary files under
`$RUNNER_TEMP` (cleared after every job), never `/tmp`.
