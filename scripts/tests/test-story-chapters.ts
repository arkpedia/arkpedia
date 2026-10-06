import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chapterRows, readerLink, type Section } from '../../lib/story/storyChapters';
// @ts-expect-error Node import scripts are plain JavaScript.
import { chapterSections, timoEntries } from '../lib/timo-chapters.mjs';

const row = (storyTxt: string, storyCode: string, storyName: string, avgTag: string) => ({ storyTxt, storyCode, storyName, avgTag });

test('a chapter is listed as Timo\'s reader numbers it: the table, an opening video first, bonus reading and battle scenes in their places', () => {
  const catalog = {
    review: { main_9: { infoUnlockDatas: [row('obt/main/level_main_09-01_beg', '9-1', 'One', 'Before Operation'), row('obt/main/level_main_09-01_end', '9-1', 'One', 'After Operation'), row('obt/main/level_main_09-02_beg', '9-2', 'Two', 'Before Operation')] } },
    storyKeys: ['obt/main/main_9_zone_enter'],
    annex: { main_9: [{ txt: 'annex/recap', first: true }, { txt: 'annex/extra' }] },
    files: { main_9: [{ txt: 'files/a', name: 'A File' }] },
    scenes: { rows: {} },
  };
  const entries = timoEntries(catalog, 'main_9');
  // The opening video leads, the recap (-1) next, the table's rows, then the bonus reading.
  assert.deepEqual(entries.map((e: { storyTxt: string }) => e.storyTxt), ['annex/recap', 'obt/main/main_9_zone_enter', 'obt/main/level_main_09-01_beg', 'obt/main/level_main_09-01_end', 'obt/main/level_main_09-02_beg', 'annex/extra', 'files/a']);
  assert.deepEqual(entries.map((e: { index: number }) => e.index), [0, 1, 2, 3, 4, 5, 6]);
  // With a battle scene, every row is numbered by its place, as the reader's addScenes does: the
  // recap no longer leads.
  const withScene = { ...catalog, scenes: { rows: { main_9: [{ parts: ['battle/9-1'], code: '9-1', scene: 'battle', after: 'obt/main/level_main_09-01_beg' }] } } };
  assert.deepEqual(timoEntries(withScene, 'main_9').map((e: { storyTxt: string }) => e.storyTxt), ['obt/main/main_9_zone_enter', 'obt/main/level_main_09-01_beg', 'battle/9-1', 'obt/main/level_main_09-01_end', 'obt/main/level_main_09-02_beg', 'annex/recap', 'annex/extra', 'files/a']);
  // The page leaves the scenes out and keeps the reader's indices.
  assert.deepEqual(chapterSections(timoEntries(withScene, 'main_9')).slice(0, 3), [[0, '', 'Intro', 'intro'], [1, '9-1', 'One', 'before'], [3, '9-1', 'One', 'after']]);
  assert.equal(timoEntries(catalog, 'rogue_1'), null, 'a group the review lacks is not a chapter of this kind');
});

test('the popup pairs each stage\'s Before and After, and lists a story of its own on its own row', () => {
  const sections: Section[] = [[0, '', 'Intro', 'intro'], [1, '', 'Prologue, Part 1', ''], [2, '0-1', 'Collapse', 'before'], [3, '0-1', 'Collapse', 'after'], [4, '0-4', 'Brawl', 'before'], [5, '0-6', 'Resolve', 'after']];
  assert.deepEqual(chapterRows(sections), [
    { code: '', name: 'Intro', read: 0 },
    { code: '', name: 'Prologue, Part 1', read: 1 },
    { code: '0-1', name: 'Collapse', before: 2, after: 3 },
    // A stage with only a Before, and one with only an After, as the prologue has them.
    { code: '0-4', name: 'Brawl', before: 4 },
    { code: '0-6', name: 'Resolve', after: 5 },
  ]);
  assert.equal(readerLink('https://arknights.timo.beer/story.html#main&main_3&0', 5), 'https://arknights.timo.beer/story.html#main&main_3&5');
});
