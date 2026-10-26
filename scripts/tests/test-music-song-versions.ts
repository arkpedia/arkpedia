import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSongVersion } from '../../lib/music/songVersions';

test('pairs exact vocal and instrumental versions in either direction', () => {
  const vocal = { id: 'v', title: '秋绪', altTitle: 'Autumn Moods', album: 'Autumn Moods' };
  const instrumental = { id: 'i', title: '秋绪 (Instrumental)', album: 'Autumn Moods' };
  assert.equal(findSongVersion(vocal, [instrumental])?.song.id, 'i');
  assert.equal(findSongVersion(instrumental, [vocal])?.label, 'Play vocal version');
  assert.equal(findSongVersion(vocal, [{ ...instrumental, album: 'Live' }]), null);
  assert.equal(findSongVersion(vocal, [instrumental, { ...instrumental, id: 'duplicate' }]), null);
  assert.equal(findSongVersion(vocal, [{ ...instrumental, title: 'Autumn Moods (Live Instrumental)' }]), null);
});
