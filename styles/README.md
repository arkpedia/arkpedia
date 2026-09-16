# Styles

`core/` owns shared tokens, the Arkpedia theme, and global navigation. Other folders own feature-wide CSS. `pages/_app.tsx` imports global styles in deliberate cascade order. Component-only CSS modules live beside their components.

Both stylesheet audits recurse through these folders. Run `npm run check:styles` after moving or renaming styles. UI interactions should preserve layout positions as much as possible.
