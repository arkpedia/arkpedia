import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addSongToPlaylists, formatPlaylistFile, mergePlaylists, MUSIC_PLAYLISTS_KEY, parsePlaylistFile, FAVORITES_PLAYLIST_ID, readPlaylists, initializeFavoritesPlaylist, writePlaylists } from '../../lib/music/musicPlaylists';
import { formatBackup, parseBackup } from '../../lib/account/backup';
const saved = [{ id: 'a', name: 'Late night', tracks: ['abcdefghijk', 'lmnopqrstuv'] }];
test('adding a song preserves playlist order and unselected playlists, and is idempotent', () => {
  const existing = [...saved, { id: 'b', name: 'Morning', tracks: ['lmnopqrstuv'] }];
  const next = addSongToPlaylists(existing, ['a', 'b'], '12345678901');
  assert.deepEqual(next.map(p => p.tracks), [['abcdefghijk', 'lmnopqrstuv', '12345678901'], ['lmnopqrstuv', '12345678901']]);
  assert.deepEqual(addSongToPlaylists(next, ['a', 'b'], '12345678901'), next);
  assert.deepEqual(addSongToPlaylists(existing, ['b'], '12345678901')[0], existing[0]);
  assert.deepEqual(existing[0].tracks, ['abcdefghijk', 'lmnopqrstuv']);
  assert.throws(() => addSongToPlaylists(existing, ['deleted'], '12345678901'));
  assert.throws(() => addSongToPlaylists(existing, ['a'], 'invalid'));
  const full = { id: 'full', name: 'Full', tracks: Array.from({ length: 5000 }, (_, i) => String(i).padStart(11, '0')) };
  assert.throws(() => addSongToPlaylists([full], ['full'], 'abcdefghijk'));
});
test('portable playlists round-trip names and the chosen order, including non-ASCII names', () => {
  const playlists = [...saved, { id: 'b', name: '音楽 🎵', tracks: ['lmnopqrstuv', 'abcdefghijk'] }];
  assert.deepEqual(parsePlaylistFile(formatPlaylistFile(playlists)), playlists);
});
test('a malformed file, unsupported version or URL cannot be partially imported', () => {
  for (const text of ['{', '{}', JSON.stringify({ kind: 'arkpedia-music-playlists', version: 2, playlists: saved }),
    JSON.stringify({ kind: 'arkpedia-music-playlists', version: 1, playlists: [...saved, { id: 'b', name: 'Bad', tracks: ['https://example.com'] }] })]) {
    assert.throws(() => parsePlaylistFile(text));
  }
});
test('import preserves existing content, skips identical copies and renames changed collisions', () => {
  assert.deepEqual(mergePlaylists(saved, saved, () => 'new'), { playlists: saved, added: 0 });
  const changed = [{ ...saved[0], tracks: ['lmnopqrstuv'] }];
  const imported = mergePlaylists(saved, changed, () => 'new');
  assert.deepEqual(imported.playlists, [...saved, { ...changed[0], id: 'new', name: 'Late night (2)' }]);
  assert.equal(mergePlaylists(imported.playlists, changed, () => 'another').added, 0);
  assert.deepEqual(saved[0].tracks, ['abcdefghijk', 'lmnopqrstuv']);
});
test('whole-account backups also preserve playlists and validate them before restoring', () => {
  const backup = formatBackup({ getItem: key => key === MUSIC_PLAYLISTS_KEY ? JSON.stringify(saved) : null });
  const parsed = parseBackup(backup);
  assert.ok(parsed && parsed !== 'invalid');
  assert.deepEqual(JSON.parse(parsed.stores[0].raw), saved);
  const bad = JSON.parse(backup); bad.stores[MUSIC_PLAYLISTS_KEY][0].tracks = [12];
  assert.equal(parseBackup(JSON.stringify(bad)), 'invalid');
});

function storageFixture(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
test('the default favourites list is available empty and reads current heart state', () => {
  const storage = storageFixture();
  assert.deepEqual(initializeFavoritesPlaylist(storage), [{ id: FAVORITES_PLAYLIST_ID, name: 'Favourites', tracks: [] }]);
  storage.setItem('musicFavorites', JSON.stringify(['abcdefghijk']));
  assert.deepEqual(readPlaylists(storage)[0].tracks, ['abcdefghijk']);
  storage.setItem('musicFavorites', '[]');
  assert.deepEqual(readPlaylists(storage)[0].tracks, []);
});
test('legacy favourites migrate once without losing songs or resurrecting removed hearts', () => {
  const storage = storageFixture({ musicFavorites: JSON.stringify(['abcdefghijk']),
    [MUSIC_PLAYLISTS_KEY]: JSON.stringify([{ id: 'manual', name: 'Favourites', tracks: ['lmnopqrstuv'] }, ...saved]) });
  const lists = initializeFavoritesPlaylist(storage);
  assert.deepEqual(lists, [{ id: FAVORITES_PLAYLIST_ID, name: 'Favourites', tracks: ['abcdefghijk', 'lmnopqrstuv'] }, ...saved]);
  assert.deepEqual(JSON.parse(storage.getItem('musicFavorites')!), lists[0].tracks);
  storage.setItem('musicFavorites', '[]');
  assert.deepEqual(initializeFavoritesPlaylist(storage)[0].tracks, []);
  assert.deepEqual(readPlaylists(storage).slice(1), saved);
});
test('adding to favourites updates hearts; missing default list cannot delete them', () => {
  const storage = storageFixture();
  const lists = initializeFavoritesPlaylist(storage);
  writePlaylists(storage, addSongToPlaylists(lists, [FAVORITES_PLAYLIST_ID], 'abcdefghijk'));
  assert.deepEqual(JSON.parse(storage.getItem('musicFavorites')!), ['abcdefghijk']);
  writePlaylists(storage, saved);
  assert.deepEqual(readPlaylists(storage), [{ id: FAVORITES_PLAYLIST_ID, name: 'Favourites', tracks: ['abcdefghijk'] }, ...saved]);
});
test('imported default favourites merge additively into a single list and round-trip', () => {
  const storage = storageFixture({ musicFavorites: JSON.stringify(['abcdefghijk']) });
  const existing = initializeFavoritesPlaylist(storage);
  const incoming = [{ id: FAVORITES_PLAYLIST_ID, name: 'Favourites', tracks: ['lmnopqrstuv', 'abcdefghijk'] }];
  const merged = mergePlaylists(existing, parsePlaylistFile(formatPlaylistFile(incoming)), () => 'new');
  assert.equal(merged.added, 1);
  assert.equal(merged.playlists.length, 1);
  writePlaylists(storage, merged.playlists);
  assert.deepEqual(readPlaylists(storage)[0].tracks, ['abcdefghijk', 'lmnopqrstuv']);
  assert.equal(mergePlaylists(readPlaylists(storage), incoming, () => 'new').added, 0);
});

test('default setup leaves unreadable existing playlist data untouched', () => {
  const storage = storageFixture({ [MUSIC_PLAYLISTS_KEY]: '{broken', musicFavorites: JSON.stringify(['abcdefghijk']) });
  assert.deepEqual(initializeFavoritesPlaylist(storage)[0].tracks, ['abcdefghijk']);
  assert.equal(storage.getItem(MUSIC_PLAYLISTS_KEY), '{broken');
});
