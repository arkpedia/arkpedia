import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { browserImports, pages, pathToTarget } from './browser-graph';

/*
 * Game tables the content release carries, which no browser bundle may compile in.
 *
 * Each of these used to be imported by client code, so a page rendered from the live
 * release still read the copy the last deploy compiled into its chunk: a new event
 * landed in the stage browser's raw "other" group with no dates, an operator added
 * after the last regeneration fell back to text heuristics on /base, and so on, until
 * somebody redeployed. The page now gets the table through its props
 * (__contentTables, see lib/content/tables.mjs), which the content export fills from
 * the release's own data and the server fills from its bundle for an older release.
 *
 * The walk reads each page the way Next builds its browser half: getStaticProps and
 * everything only it uses are dropped, every other import is followed, lazy import()s
 * included. `production build` confirms the same on the emitted chunks.
 */
export const RELEASE_ONLY_TABLES = [
  // /stages/browse: the filter's headings (components/stages/StageList.tsx).
  'data/stages-content.json',
  'data/content-windows.json',
  'data/story-groups.json',
  // Every asset path, 453 KB: availability is resolved at export, not in the browser.
  'data/assets/public-asset-index.json',
  // The banner list and its art versions (lib/gacha/headhuntingBannerData.ts).
  'data/headhunting_banners.json',
  'data/assets/banner_art_sources.json',
];

/* The one bundled copy that stays: /schedule's no-release fallback for the table the
   release hands it (useContentTable). Named as an edge, so the same file arriving
   through any other import still fails. */
const NO_RELEASE_FALLBACKS = ['pages/schedule.tsx -> data/headhunting_banners.json'];

test('the release-only game tables exist as data, so the release can carry them', () => {
  for (const file of RELEASE_ONLY_TABLES) assert.ok(fs.existsSync(file), `${file} is missing`);
});

test('no page compiles a release-only game table into its browser bundle', () => {
  const all = pages();
  // Not vacuous: the server half of these pages does read the tables.
  assert.equal(pathToTarget('pages/obtain-method.tsx', ['data/headhunting_banners.json'], { clientOnly: false })?.at(-1), 'data/headhunting_banners.json');
  assert.ok(browserImports('pages/obtain-method.tsx', true).includes('lib/gacha/limitedBannerType.ts'));
  assert.equal(pathToTarget('pages/stages/browse.tsx', ['data/story-groups.json'], { clientOnly: false })?.at(-1), 'data/story-groups.json');
  assert.ok(browserImports('pages/stages/browse.tsx', true).includes('components/stages/StageList.tsx'));
  const leaks = all.flatMap(page => RELEASE_ONLY_TABLES.flatMap(table => {
    const chain = pathToTarget(page, [table], { allowed: NO_RELEASE_FALLBACKS });
    return chain ? [chain.join(' -> ')] : [];
  }));
  assert.deepEqual(leaks, [], 'Browser code must read these tables from the page props, which carry the content release.');
});
