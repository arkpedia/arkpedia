# Release execution

Keep the release moving through one immutable source and the existing checked-main
owner. A green CI run, a published Preview and a healthy production deployment are
different facts; verify each at its owning boundary, once.

1. Fetch main, establish the branch and inspect local changes. Finish the release
   notes and targeted validation before freezing the commit. For changes to data
   producers, exercise their clean hydrated inputs and canonical output, not only
   a warm development checkout. Keep the user's dev server available.
2. Push the frozen source and create its main-based PR. Run
   `npm run release:preview -- HEAD`. It resolves a full commit SHA, refuses dirty
   code or a source unavailable on GitHub, and requests the existing Preview owner.
   The workflow must verify the exact clean build at `https://preview.arkpedia.net`
   after publication. Wrangler's generated hostnames are diagnostic output, not
   alternative review targets.
3. Review the affected Preview journey while CI runs. The Check workflow compiles
   the real production Worker in a separate job using live records, without provider
   credentials. Its existing bundle budget must pass before merge, alongside the
   application and browser checks. This job runs alongside the application checks;
   it does not publish or replace the production owner.
4. Follow identified runs with `gh run watch RUN_ID --exit-status` in a tool session.
   Read new output with the session polling tool. Do not spend the waiting period
   on repeated manual sleeps, unchanged status messages or unrelated audits. On a
   failure, inspect its failed step and evidence before changing code or retrying.
   Do not cancel another release's runner job.
5. When the exact source's Check and Preview acceptance pass, confirm the PR head
   and base are still the reviewed ones, then merge promptly. Preserve exact-tree
   reuse on main. Follow the automatically started `production-release.yml` run;
   inspect a missing handoff before requesting a manual retry with its exact Check.
6. After successful publication, run `npm run release:status` and replay the scoped
   production journey. Capture useful evidence, restore temporary browser settings,
   and report completion. A content-only publication also needs proof that the
   served page adopted it; a pointer or API response alone cannot prove that.

Keep public-repository readiness, unrelated feature audits and broad visual reviews
outside this path unless they block the requested release. Existing tests, source
identity checks, account isolation and recovery protections remain release gates.

The November 6 incident and repair evidence are in
[the release audit](PIPELINE-AUDIT-2026-11-06.md).
