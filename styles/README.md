# Styles

`core/` owns shared tokens, the Arkpedia theme, and global navigation. Other folders own feature-wide CSS. `pages/_app.tsx` imports global styles in deliberate cascade order. Component-only CSS modules live beside their components.

A reusable control's paint belongs to its shared primitive; a feature's private layout belongs to its feature sheet or module. Check the existing owner before adding a page override, a repeated selector or a `:global()` reach-in. Shared markup is not a reason to copy a primitive's colours, borders or control height into every consumer.

The shared native dialog frame (`.account-dialog` and its header/body/backdrop) is owned by `core/arkpedia-theme.css`, even though the component currently lives under `components/account`. Consumers choose their width with `--dialog-w` (default 560px) and optional viewport gutter with `--dialog-gutter` (default 32px). Keep the anchored top, fixed header and single scrolling body in that owner rather than fighting its width with compound selectors.

`audit:styles` rejects a responsive declaration when a later unconditional global rule with the exact same selector and property always overrides it. The check follows `_app.tsx`'s real import order and respects `!important`; it deliberately does not infer shorthand overlap, different specificity or cascade-layer precedence. Put an intentional responsive change after its owner, rather than leaving an ineffective media rule in `shared.css`.

Both stylesheet audits recurse through these folders. Run `npm run check:styles` after moving or renaming styles. UI interactions should preserve layout positions as much as possible.

Tokens are defined only in `core/shared.css`, and the shared components live in `components/ui`. A new transition or animation goes in `core/motion.css`, inside `@media (prefers-reduced-motion: no-preference)`, imported last; the older ones elsewhere are listed, with their reasons, in `MOTION_LEGACY` (`scripts/audits/audit-motion.mjs`), which only shrinks (rule 23; `audit:styles` checks it as `motionScope`). Read [UI primitives and tokens](../docs/development/ui-primitives.md) before styling a page. `npm run audit:styles` checks this folder and every `components/**.css` against a ratchet baseline.
