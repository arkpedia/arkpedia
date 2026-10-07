# Spine Runtimes 3.8 (spine-ts, WebGL)

The official Spine runtime that draws the game's animated outfit art (dynamic illustrations)
in the focused artwork view: `components/skins/DynamicArtwork.tsx` loads it with a dynamic
`import()` when a reader presses Animated, so it is never part of a page's bundle
(`scripts/tests/test-dynamic-art.ts` holds every page to that).

Arknights' skeletons are Spine 3.8.99, and only the 3.8 runtime reads them: the runtimes on
npm are 4.x and refuse them.

## Source

- Repository: [EsotericSoftware/spine-runtimes](https://github.com/EsotericSoftware/spine-runtimes), branch `3.8`
- Commit: `8b4844bd4b193ba9e54487ed397a777993cbad56`
- Files: `spine-ts/build/spine-webgl.js` and `spine-ts/build/spine-webgl.d.ts`

## Changes from the source

- `spine-webgl.js`: `export { spine };` appended, so it loads as an ES module.
- `spine-webgl.d.ts`: the same export appended, and the `/// <reference types="offscreencanvas" />`
  line removed (TypeScript's own DOM types carry `OffscreenCanvas`).

Nothing else. Do not modify these files unless a Spine licence is in force: the Spine Runtimes
License (`LICENSE`, beside them) permits integrating and changing the runtimes only for holders
of a Spine Editor licence, and any redistribution must carry that licence and copyright notice.
The site shows the licence on `/credits` (Licences), linked from the nav's Community menu.
