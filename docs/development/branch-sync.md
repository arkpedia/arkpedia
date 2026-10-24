# Production, development and Cloudflare synchronization

`main` owns production releases. `dev` may intentionally have a newer framework, renamed
routes or features not released to production yet. `cloudflare` contains dev plus its
Worker-specific code. Synchronization merges history; it does not replace one branch's
tree with another or resolve conflicts by always choosing a side.

Every push to main, including a documentation-only release, starts `sync-main.yml`:

1. If main is already an ancestor of dev, dev is left alone and the downstream Cloudflare
   sync is dispatched again. Otherwise, merge current main into current dev on a temporary
   `sync/main-to-dev-<main>-<dev>` branch. Merge conflicts stop here and open a tracked issue.
2. Explicitly dispatch the existing Check workflow on that integration branch. The branch
   is immutable; retries reuse it. A failed Check opens the tracked issue and changes no
   shared branch. Check's final notifier job explicitly dispatches the sync with its run ID.
   No runner waits for the full suite; the completion handler allows up to two minutes for
   that notifier job's run record to finalize before reading its authoritative conclusion.
3. Accept only a successful Check workflow-dispatch run from this repository, for the exact
   integration branch head and the expected main/dev merge parents. Privileged orchestration
   always executes the script checked out from main, never code from a completed Check.
4. If either branch advanced while Check ran, prepare and check a fresh merge. Otherwise,
   fast-forward dev to the exact green commit. The GitHub API uses `force: false`; a racing
   dev push cannot be overwritten and is automatically included in a newly checked integration.
5. Dispatch Deploy with that checked commit pinned, and dispatch the existing dev-to-Cloudflare
   sync. This is explicit because writes with GITHUB_TOKEN do not start push workflows.
   Delete only the disposable integration branch after these dispatches succeed.

The existing Cloudflare workflow merges normally and reports conflicts in a separate tracked
issue. The external Workers Builds integration handles its deployment. Edge Worker build watch
paths remain unchanged, so unrelated releases do not rebuild `arkpedia-edge` unnecessarily.

The workflows use the repository workflow token and the existing light runner. They require
no personal access token, new account login or new scheduled job. Each orchestration job is
limited to five minutes; full application verification belongs to Check on the build runner.

Both handoffs use explicit `workflow_dispatch`, one of GitHub's documented
[workflow-token trigger exceptions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).
During the initial 2026-10-24 rollout, the bot-dispatched integration Check passed but its
`workflow_run` callback never started. Completion therefore does not depend on that event.

## Recovery

Read the tracked issue and failed run first. Resolve a genuine conflict through a temporary
branch and a green Check. Preserve both main ancestry and intentional dev/Cloudflare changes;
do not squash or rebase a reconciliation merge. Then run **Sync main into dev** manually from
Actions. A rejected fast-forward indicates another dev update raced the sync: rerunning builds
a new candidate from the current tips. A dispatch failure after dev advanced can be retried by
rerunning the failed sync completion job; the candidate remains until dispatches succeed.
To retry a completed integration Check directly, dispatch **Sync main into dev** with its
numeric Actions run ID in `checked_run`; leave it empty to prepare from the current tips.

After recovery, GitHub's `main...dev` and `main...cloudflare` comparisons should both show zero
behind. Ahead commits are expected: the branches retain unreleased and hosting-specific work.
