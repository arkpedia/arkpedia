# Styles

`core/` owns shared tokens, the Arkpedia theme, and global navigation. Other folders own feature-wide CSS. `pages/_app.tsx` imports global styles in deliberate cascade order. Component-only CSS modules live beside their components.

Both stylesheet audits recurse through these folders. Run `npm run check:styles` after moving or renaming styles. UI interactions should preserve layout positions as much as possible.

Tokens are defined only in `core/shared.css`, and the shared components live in `components/ui`. A new transition or animation goes in `core/motion.css`, inside `@media (prefers-reduced-motion: no-preference)`, imported last; the older ones elsewhere are listed, with their reasons, in `MOTION_LEGACY` (`scripts/audits/audit-motion.mjs`), which only shrinks (rule 23; `audit:styles` checks it as `motionScope`). Read [UI primitives and tokens](../docs/development/ui-primitives.md) before styling a page. `npm run audit:styles` checks this folder and every `components/**.css` against a ratchet baseline.
