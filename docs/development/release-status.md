# Consolidated release status

Run `npm run release:status` from the app checkout with Node 24 and an authenticated
GitHub CLI. It reads www, dev and Cloudflare without changing deployments, data or
provider settings. `npm run release:status -- --json` produces machine-readable output.
Without GitHub access it still probes public sites but reports the missing evidence
and exits unsuccessfully rather than implying a complete verification.

The **Release status** Actions workflow publishes the same report in its run summary
after Deploy completes, including failed Deploy runs. Once this workflow is released
to main, it also supports manual dispatch. It does not require Vercel or Cloudflare
credentials or add scheduled polling. Cloudflare uses external Workers Builds and
can finish after Vercel; rerun the report after that build to refresh its snapshot.
It is a point-in-time observation, not a persistent monitoring dashboard.

## Reading the report

- **Live checks:** clean served build, expected content channel/schema, validated
  pointer/manifest checksum, and four HTTP page responses (`/`, `/schedule`, `/story`,
  `/base`). Error pages returned with HTTP 200 fail too.
- **Served commit / branch tip:** separates what readers receive from what GitHub
  currently holds. A difference is displayed, not automatically failed: a docs-only
  commit deliberately does not deploy. Consult CI evidence for an in-progress release.
- **Content:** the channel's current published release. ISR pages may still serve
  their preceding release until revalidation; this does not prove the exact release
  rendered by every page or browser tab.
- **CI evidence:** Check/Deploy and Workers Builds results for the served commit,
  where available. Missing evidence is explicitly reported. Pending runs retain their
  actual state; the report never substitutes an unrelated branch's latest green run.
- **Behind main:** a nonzero value on dev or cloudflare fails the report so an
  unfinished synchronization remains visible. Ahead commits are expected.

An unhealthy site, invalid content manifest, schema/channel mismatch, failed page
probe, missing GitHub access or branch behind main yields exit code 1. Results for
other targets are retained when one fails. Failed/cancelled CI evidence also fails.
CI evidence absent altogether is disclosed separately; HTTP health does not imply CI
approval. No automatic retries, merges, deployments or issue creation happen here.

## Completion and recovery

Do not call a release complete solely because its PR merged. Check the served
commit, relevant Check/deploy evidence, content, synchronization and HTTP smoke
results, then perform the affected [UX journey](ux-review.md). A newer branch tip
may still be waiting for its deployment; a healthy older version is not confirmation
that a new feature shipped. Record the exact report run and any exception.

For failures, follow the linked CI run, [branch synchronization recovery](branch-sync.md),
or [content release recovery](runtime-content.md). Keep release promotion deliberate;
this report has no authority to promote dev into production.

Vercel origins/branches come from `config/production.json`, channels from
`config/content-channels.json`. The Cloudflare target and shared probe routes are in
`config/release-status.json`. Update them alongside domain/channel/route changes.
