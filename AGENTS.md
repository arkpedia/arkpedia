# Arkpedia project guidance

For any UI change, read `docs/development/design-system.md` and the relevant sections
of `docs/development/ui-primitives.md`. Reuse shared primitives; put reusable paint in
`styles/core/`, and keep feature styles focused on layout. Verify desktop/mobile and
dark/light themes, including the populated/interactive states affected by the change.
Follow `docs/development/ux-review.md` for the complete affected journey and report
checks actually run in the PR. Before declaring a release live, use
`npm run release:status` and verify the affected deployed browser journey; a merged
PR or passing HTTP check alone does not prove the new behavior shipped.

New work branches from `main` and uses short-lived feature pull requests into `main`.
Develop locally, then request an explicit checked-source isolated Cloudflare preview
when ready. The retired `dev` work is preserved in `archive/legacy-dev-2026-10-26`;
extract its base simulator and other unreleased features individually. Preserve
unreleased `cloudflare` work; do not merge or retire that branch wholesale. Never use a permanent branch as a
disposable PR head. Vercel still serves public production; the checked-main pilot
owner is active, while public-domain cutover has separate acceptance gates. See the README and simplification
plan for current deployment state and release rules.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
