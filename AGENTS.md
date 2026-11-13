# Arkpedia project guidance

Game reference pages must use actual in-game icons and artwork wherever available. Reuse shared image components and publish missing assets through the asset/CDN pipeline; avoid text-only catalogues when native art exists.

For any UI change, read `docs/development/design-system.md` and the relevant sections
of `docs/development/ui-primitives.md`. Reuse shared primitives; put reusable paint in
`styles/core/`. Content updates count as UI work: use official post imagery with
full-size viewing and style source links with shared primitives. Consult the design
documents for every new or updated page and feature. Keep feature styles focused on layout.
Verify desktop/mobile and
dark/light themes, including the populated/interactive states affected by the change.
Content updates count as UI changes too. When official posts provide useful images,
use them in an image-led layout with concise accessible summaries and full-size viewing;
do not replace them with a wall of prose. Style standalone source/action links with
the shared link/button primitives and an external-link indicator. Consult the design
documents for every new or updated page/feature, then inspect the actual result.
Follow `docs/development/ux-review.md` for the complete affected journey and report
checks actually run in the PR. Before declaring a release live, use
`npm run release:status` and verify the affected deployed browser journey; a merged
PR or passing HTTP check alone does not prove the new behavior shipped.

New work branches from `main` and uses short-lived feature pull requests into `main`.
Develop locally, then request an explicit checked-source isolated Cloudflare preview
when ready. The retired `dev` work is preserved in `archive/legacy-dev-2026-10-26`;
extract its base simulator and other unreleased features individually. Preserve
unreleased `cloudflare` work; do not merge or retire that branch wholesale. Never use a permanent branch as a
disposable PR head. Cloudflare serves public production through the checked-main application owner.
The maintainer authorized retiring Vercel hosting and its rollback role on 2026-10-27.
Use Cloudflare version recovery, preserving stored data; see docs/development/vercel-retirement.md.
Historical migration instructions requiring Vercel retention are superseded by that decision.

Google/Discord accounts, profiles and cloud saves are approved for production
promotion as of 2026-11-02. Canonical production uses only `arkpedia-prod-accounts`;
native Preview uses only `arkpedia-preview-accounts`. Keep both identities, data,
credentials and sessions isolated. The base optimizer remains Preview-only.
Preserve retained account data and secrets; code rollback must not restore an old
database over newer writes. Use the checked-main release owner and verify the
actual deployed journey. Vercel hosting and rollback were retired on 2026-10-27.
The retired `arkpedia-cf.mocchibird.com` hostname is not a release or reader target.

## Release execution

Follow `docs/development/release-execution.md` for release handoffs. Freeze and validate
one source commit before requesting CI/Preview. Use `npm run release:preview -- HEAD`
to resolve and submit its full SHA; review only `https://preview.arkpedia.net` after
its served identity matches. Use `gh run watch RUN_ID --exit-status` for an active
run instead of manual sleep/status loops. Inspect a concrete failure before retrying;
preserve passing evidence for unchanged source. After checks and Preview acceptance
pass, merge promptly, then follow the existing automatic production owner. Once
production passes, run `npm run release:status`, replay the affected deployed journey
and finish. Keep unrelated investigations out of the release's critical path.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
