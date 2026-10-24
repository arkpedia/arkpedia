# Arkpedia project guidance

For any UI change, read `docs/development/design-system.md` and the relevant sections
of `docs/development/ui-primitives.md`. Reuse shared primitives; put reusable paint in
`styles/core/`, and keep feature styles focused on layout. Verify desktop/mobile and
dark/light themes, including the populated/interactive states affected by the change.
Follow `docs/development/ux-review.md` for the complete affected journey and report
checks actually run in the PR. Before declaring a release live, use
`npm run release:status` and verify the affected deployed browser journey; a merged
PR or passing HTTP check alone does not prove the new behavior shipped.

Normal feature pull requests target `dev`; Cloudflare-only work targets `cloudflare`.
Production is `main`. Never use `dev` itself as the head of a release PR: merged head
branches are deleted. See the README for release and deployment rules.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
