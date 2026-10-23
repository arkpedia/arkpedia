# Arkpedia project guidance

For any UI change, read `docs/development/design-system.md` and the relevant sections
of `docs/development/ui-primitives.md`. Reuse shared primitives; put reusable paint in
`styles/core/`, and keep feature styles focused on layout. Verify desktop/mobile and
dark/light themes, including the populated/interactive states affected by the change.

Normal feature pull requests target `dev`; Cloudflare-only work targets `cloudflare`.
Production is `main`. Never use `dev` itself as the head of a release PR: merged head
branches are deleted. See the README for release and deployment rules.
