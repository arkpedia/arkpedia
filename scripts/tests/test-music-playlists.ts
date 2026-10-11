import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addSongToPlaylists, formatPlaylistFile, mergePlaylists, MUSIC_PLAYLISTS_KEY, parsePlaylistFile } from '../../lib/music/musicPlaylists';
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
