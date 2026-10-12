import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chapterRead, formatStoryFile, parseStoryFile, parseStoryProgress, setStoryPart, STORY_PROGRESS_KEY } from '../../lib/story/storyProgress';
import { applyBackup, formatBackup, parseBackup } from '../../lib/account/backup';
import { exportDataArchive, exportDataFiles, EXPORT_NAMES, parseDataArchive } from '../../lib/account/exportFiles';
import { readImportFile } from '../../lib/account/importFile';
import { FAVORITES_PLAYLIST_ID, MUSIC_PLAYLISTS_KEY } from '../../lib/music/musicPlaylists';
import { strToU8, zipSync } from 'fflate';
import type { Section } from '../../lib/story/storyChapters';

const sections: Section[] = [[0, '', 'Prologue', ''], [1, '0-1', 'Collapse', 'before'], [2, '0-1', 'Collapse', 'after']];
test('parts are independent; a chapter is complete only when every known part is read', () => {
  let progress = setStoryPart({ other: [1] }, 'main_0', 1, true);
  assert.deepEqual(progress, { other: [1], main_0: [1] });
  assert.equal(chapterRead(progress, 'main_0', sections), false);
  progress = setStoryPart(setStoryPart(progress, 'main_0', 2, true), 'main_0', 0, true);
  assert.equal(chapterRead(progress, 'main_0', sections), true);
  assert.equal(chapterRead(progress, 'main_0', [...sections, [3, '0-2', 'Protection', 'before']]), false);
  assert.equal(chapterRead(progress, 'missing', []), false);
  progress = setStoryPart(progress, 'main_0', 1, false);
  assert.equal(chapterRead(progress, 'main_0', sections), false);
  assert.deepEqual(progress.other, [1]);
});
test('story files round-trip read and unread parts without accepting account data or malformed progress', () => {
  const text = formatStoryFile({ main_0: [2, 0, 2], main_1: [] });
  assert.deepEqual(parseStoryFile(text), { main_0: [0, 2] });
  for (const text of ['[]', 'null', '{"main_0":[-1]}', '{"main_0":[0.5]}', '{"main_0":[10000]}', '{"__proto__":[1]}', '{"main_0":["1"]}']) assert.equal(parseStoryProgress(text), null);
  for (const file of [{ kind: 'arkpedia-backup', version: 1, stores: {} }, { kind: 'arkpedia-story-progress', version: 2, progress: {} }, { kind: 'arkpedia-story-progress', version: 1, progress: { main_0: [null] } }]) assert.throws(() => parseStoryFile(JSON.stringify(file)));
});
const entries = {
  arkpediaAccount: JSON.stringify({ version: 1, server: 'en', importedAt: '2026-10-02T12:00:00.000Z', doctor: 'D#1', operators: ['Amiya'], skins: [], cleared: [] }),
  [MUSIC_PLAYLISTS_KEY]: JSON.stringify([{ id: 'a', name: 'Favorite songs', tracks: ['abcdefghijk'] }]),
  musicFavorites: JSON.stringify(['abcdefghijk']),
  [STORY_PROGRESS_KEY]: JSON.stringify({ main_0: [0, 1] }),
  arkpediaGameLogin: '{"token":"secret"}',
  theme: 'dark',
  'arkpedia.friends.v1': '{"friend":"friend-only"}',
};
const storage = { getItem: (key: string) => entries[key as keyof typeof entries] ?? null };
test('export everything carries three independent JSON files, excludes logins and friends, and restores them together', () => {
  const files = exportDataFiles(storage);
  assert.deepEqual(Object.keys(files), [...EXPORT_NAMES]);
  const player = JSON.parse(files[EXPORT_NAMES[0]]);
  assert.deepEqual(Object.keys(player.stores), ['arkpediaAccount']);
  assert.deepEqual(JSON.parse(files[EXPORT_NAMES[1]]).favorites, ['abcdefghijk']);
  const expectedPlaylists = [
    { id: FAVORITES_PLAYLIST_ID, name: 'Favourites', tracks: ['abcdefghijk'] },
    { id: 'a', name: 'Favorite songs', tracks: ['abcdefghijk'] },
  ];
  assert.deepEqual(JSON.parse(files[EXPORT_NAMES[1]]).playlists, expectedPlaylists);
  assert.deepEqual(JSON.parse(files[EXPORT_NAMES[2]]).progress, { main_0: [0, 1] });
  for (const text of Object.values(files)) {
    assert.ok(!text.includes('secret') && !text.includes('friend-only'));
    assert.equal(readImportFile(text, { aliases: {} } as never).kind, 'backup');
  }
  const restored: Record<string, string> = { friend: 'untouched' };
  const events: string[] = [];
  applyBackup(parseDataArchive(exportDataArchive(storage)), { setItem: (key, raw) => { restored[key] = raw; } }, { dispatchEvent: event => { events.push(event.type); return true; } });
  for (const key of ['arkpediaAccount', 'musicFavorites', STORY_PROGRESS_KEY]) assert.deepEqual(JSON.parse(restored[key]), JSON.parse(entries[key as keyof typeof entries]));
  assert.deepEqual(JSON.parse(restored[MUSIC_PLAYLISTS_KEY]), expectedPlaylists);
  assert.equal(restored.friend, 'untouched');
  assert.ok(events.includes('arkpediaStoryProgressChanged') && events.includes('arkpediaMusicPlaylistsChanged'));
});
test('a damaged story file, unknown entries and inflated size limits refuse the entire archive', () => {
  const files = exportDataFiles(storage);
  const zip = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([key, value]) => [key, strToU8(value)])));
  assert.throws(() => parseDataArchive(zip({ ...files, [EXPORT_NAMES[2]]: '{"kind":"wrong"}' })));
  assert.throws(() => parseDataArchive(zip({ ...files, extra: '{}' })));
  assert.throws(() => parseDataArchive(zip({ ...files, [EXPORT_NAMES[0]]: 'x'.repeat(4 * 1024 * 1024 + 1) })));
  assert.throws(() => parseDataArchive(zip({ [EXPORT_NAMES[0]]: files[EXPORT_NAMES[0]] })));
});
test('legacy full backups can carry story progress, and older backups leave it untouched', () => {
  const backup = parseBackup(formatBackup(storage));
  assert.ok(backup && backup !== 'invalid');
  assert.ok(backup.stores.some(store => store.key === STORY_PROGRESS_KEY));
  const older = parseBackup(JSON.stringify({ kind: 'arkpedia-backup', version: 1, stores: { musicFavorites: [] } }));
  assert.ok(older && older !== 'invalid');
  assert.ok(!older.stores.some(store => store.key === STORY_PROGRESS_KEY));
});
test('a failed multi-file restore rolls back storage and sends no change events', () => {
  const restored: Record<string, string> = { arkpediaAccount: 'old account', [STORY_PROGRESS_KEY]: '{"main_1":[0]}' };
  const before = { ...restored };
  const events: string[] = [];
  let writes = 0;
  assert.throws(() => applyBackup(parseDataArchive(exportDataArchive(storage)), {
    getItem: key => restored[key] ?? null,
    removeItem: key => { delete restored[key]; },
    setItem: (key, raw) => { if (++writes === 2) throw new Error('quota'); restored[key] = raw; },
  }, { dispatchEvent: event => { events.push(event.type); return true; } }));
  assert.deepEqual(restored, before);
  assert.deepEqual(events, []);
});
