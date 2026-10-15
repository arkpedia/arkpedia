import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
// @ts-expect-error Importers are plain JavaScript.
import { timoLibrary } from '../lib/timo-library.mjs';
import { STORY_CATEGORIES, type StoryLibraryEntry } from '../../lib/story/storyLibrary';
import type { StoryChapters } from '../../lib/story/storyChapters';

test('the library uses reader/game categories, including groups absent from a canvas and missing sections', () => {
  const section = { storyTxt: 'obt/main/test', storyName: 'First part' };
  const catalog = {
    ops: { char_001_test: ['Test operator', 'Test'] },
    review: { main_10: { name: 'Ten', infoUnlockDatas: [section] }, main_2: { name: 'Two', infoUnlockDatas: [section] }, event: { name: 'An event', entryType: 'ACTIVITY', infoUnlockDatas: [section] }, vignette: { name: 'A vignette', entryType: 'MINI_ACTIVITY', infoUnlockDatas: [] }, story_test_set_1: { name: 'Record', infoUnlockDatas: [section] } },
    equip: { charEquip: { char_001_test: ['original', 'module_test'] }, equipDict: { module_test: { charId: 'char_001_test', uniEquipName: 'Module title', typeName1: 'SUM', typeName2: 'Y' } } },
    rogue: { topics: { rogue_1: { name: 'An IS theme' } }, details: { rogue_1: { endings: { ending_1: { name: 'An ending' } } } } },
    sandbox: { basicInfo: { sandbox_1: { topicName: 'RA season' } } },
    storyKeys: ['Obt/SandboxPerm/sandbox_1/sandbox_1_entry', 'Obt/SandboxPerm/sandbox_1/sandbox_1_ending_1'],
    extras: { extra: { name: 'An extra event', scripts: [{ txt: 'extra/entry', kind: 'intro' }] }, act1sandbox: { name: 'RA pilot', shelf: 'sandbox', scripts: [{ txt: 'ra/entry', kind: 'intro' }] } },
  };
  const { entries, chapters } = timoLibrary(catalog);
  assert.deepEqual(entries.filter((e: StoryLibraryEntry) => e.category === 'main').map((e: StoryLibraryEntry) => e.id), ['main_2', 'main_10']);
  for (const [category] of STORY_CATEGORIES.filter(([id]) => id !== 'manga')) assert.ok(entries.some((e: StoryLibraryEntry) => e.category === category), category);
  assert.equal(entries.find((e: StoryLibraryEntry) => e.id === 'module_test').title, 'Test operator, SUM Y');
  assert.equal(entries.find((e: StoryLibraryEntry) => e.id === 'vignette').url, 'https://arknights.timo.beer/story.html#mini&vignette&0');
  assert.equal(chapters.vignette, undefined, 'an empty group remains listed with a direct reader link');
  assert.deepEqual(chapters.module_test, [[0, '', 'Module title', '']]);
  assert.deepEqual(chapters.sandbox_1.map((s: unknown[]) => s[2]), ['Prologue', 'Ending 1']);
  assert.equal(entries.find((e: StoryLibraryEntry) => e.id === 'act1sandbox').category, 'sandbox');
  assert.throws(() => timoLibrary({}), /no stories/);
});

test('the shipped library has all eight reading categories, unique deep links, and valid section indices', () => {
  const { entries } = JSON.parse(readFileSync('data/story-library.json', 'utf8')) as { entries: StoryLibraryEntry[] };
  const { chapters } = JSON.parse(readFileSync('data/story-chapters.json', 'utf8')) as { chapters: StoryChapters };
  const map = JSON.parse(readFileSync('data/story-map.json', 'utf8'));
  const onMap = new Set(map.elements.flatMap((e: { link?: { story?: string } }) => e.link?.story ? [e.link.story] : []));
  assert.ok(entries.length > 900);
  assert.ok(entries.filter(e => !onMap.has(e.id)).length > 800, 'canvas membership must never limit the catalogue');
  assert.equal(new Set(entries.map(e => e.id)).size, entries.length);
  for (const entry of entries) {
    assert.equal(entry.url, `https://arknights.timo.beer/story.html#${entry.category}&${entry.id}&0`);
    const rows = chapters[entry.id] ?? [];
    assert.equal(new Set(rows.map(s => s[0])).size, rows.length, entry.id);
    assert.ok(rows.every(s => Number.isInteger(s[0]) && s[0] >= 0), entry.id);
  }
});
