# Admin release queue

The release candidate is an open, ready, checked PR in the canonical app repository.
Keep its code on the PR branch until the editor approves it. Publish that exact commit
to isolated Preview with the existing Preview workflow. In Admin → Releases, use
Queue Preview, enter the PR number, and list the affected reader-facing paths (for
example, `/pull-planner` and `/schedule?view=calendar`). Each candidate has Live and Preview
links. Preview can hold one checked source at a time. The queue shows when the source
to review has been replaced.

Publish appears once the current Preview has an unexpired full Check artifact for
the exact merge tree against current main. Main can then reuse that Check, and its
normal production build and health checks still run.

The editor can add, preview, and save an optional update note. Marking it as a major
update also makes it eligible for the public pop-up after publication. The note stays
in the private release queue until the expected production commit and fingerprint are
verified and Cloudflare Workers Builds reports success. The queue polls while open.
Check status resumes verification after a reload. The published note is added to the existing Site updates history and public
feed in the same database transaction as the release completion.

## Review and activation

The Preview-only `/release-queue-preview` demo runs the same UI with per-browser
sample data and simulated publication. It can be tested without production admin
credentials, account data, or repository writes. The real API always requires the
production Cloudflare Access assertion and a same-origin JSON write.

Production activation is a separate maintainer-approved rollout:

1. Apply `0034_release_queue.sql` to the correct environment database after its usual
   recovery check. Never copy the production account database or credentials to Preview.
2. Configure the optional server-only `ARKPEDIA_RELEASE_QUEUE_GITHUB_TOKEN` using the
   approved production secret handoff. A fine-grained token for `arkpedia/arkpedia`
   needs Pull requests and Actions read access and Contents read and write. Cloudflare's
   public GitHub build check is read without a token. Keep repository
   protection rules in force. Without this credential, production Publish is disabled.
3. Make Admin publication the normal merge path for queued candidates. Keep the
   current checked-main Workers Builds owner and its deployment validation in place.

Publication revalidates the exact open PR, its checked Preview identity, and the
current main base. It verifies the two parents and tree of GitHub's computed PR
merge commit, then advances the main ref without force. A conflicting update or
repository rule fails the publication. GitHub can record an indirect PR merge when
its reviewed head is now on the target branch. A main Check still controls Cloudflare
production. Validate the indirect merge and matched Workers build in an approved
release before depending on the new path.

Only one release can be publishing at a time. Retry uses the same immutable commit
after a lost response. If main or the served build diverges, the queue marks the
release for review and holds its note. Use the existing Cloudflare recovery runbook
for code rollback and preserve the live account database. This version uses manual
publication. Runtime-content updates still use the established content release owner.
