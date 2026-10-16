import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
// @ts-expect-error Importers are plain JavaScript.
import { timoLibrary } from '../lib/timo-library.mjs';
import { STORY_CATEGORIES, type StoryLibraryEntry } from '../../lib/story/storyLibrary';
import { storyChaptersForRelease, type StoryChapters } from '../../lib/story/storyChapters';
import { bundledStoryLibrary } from '../../lib/story/storyMapData';
import { storyLibraryArt } from '../../lib/story/storyLibraryArt';

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

test('story categories follow the requested order and representative groups use their own art', () => {
  assert.deepEqual(STORY_CATEGORIES.map(([id]) => id), ['main', 'side', 'mini', 'manga', 'rogue', 'sandbox', 'extra', 'record', 'module']);
  const entries = bundledStoryLibrary();
  for (const id of ['main_0', '1stact', 'act10d5', 'story_ling_set_1', 'uniequip_002_ling']) {
    const entry = entries.find(entry => entry.id === id)!;
    assert.ok(entry.image, id);
    if (['record', 'module'].includes(entry.category)) {
      assert.equal(entry.imageKind, 'portrait', id);
      assert.match(entry.image!, /-star-icons\//, id);
    }
  }
  assert.match(entries.find(entry => entry.id === 'main_15')!.image!, /act2mainss_zone1/);
  assert.match(entries.find(entry => entry.id === 'rogue_1_month_team_1')!.image!, /rogue_1/);
  assert.match(entries.find(entry => entry.id === 'story_ling_set_1')!.image!, /Ling/);
});

test('a future story without art stays navigable and released image projections are preserved', () => {
  const map = JSON.parse(readFileSync('data/story-map.json', 'utf8'));
  const future: StoryLibraryEntry = { id: 'unknown-future-story', category: 'side', title: 'Unknown future story', url: 'https://arknights.timo.beer/story.html#side&unknown-future-story&0' };
  assert.deepEqual(storyLibraryArt([future], map), [future]);
  const published = { ...future, image: '/content-art/published.webp', imageKind: 'art' as const };
  assert.deepEqual(storyLibraryArt([published], map), [published]);
});

test('canvas-only chapter releases retain off-canvas dialogs; complete catalogues retain their own omissions', () => {
  const bundled: StoryChapters = { main_0: [[0, '', 'Old title', '']], story_ling_set_1: [[0, '', 'Record', '']], uniequip_002_ling: [[0, '', 'Module', '']] };
  const legacy: StoryChapters = { main_0: [[9, '', 'Published title', '']] };
  const chapters = storyChaptersForRelease(legacy, bundled, false);
  assert.equal(chapters.main_0[0][0], 9, 'published section indices retain authority');
  assert.equal(chapters.story_ling_set_1[0][2], 'Record');
  assert.equal(chapters.uniequip_002_ling[0][2], 'Module');
  assert.equal(legacy.story_ling_set_1, undefined, 'the input release is unchanged');
  assert.equal(storyChaptersForRelease(legacy, bundled, true).story_ling_set_1, undefined, 'complete new catalogues can intentionally omit a group');
  assert.deepEqual(storyChaptersForRelease({ story_ling_set_1: [] }, bundled, false).story_ling_set_1, [], 'an explicit empty group is respected');
});
