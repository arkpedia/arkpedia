/*
 * Arknights: Endfield's album covers are cut square from the label's YouTube thumbnails and
 * published to arkpedia-image-assets album-covers/ by arkpedia-data's importer (its
 * scripts/sync/sync-endfield-albums.mjs, whose own test lives beside it). Until a cover is
 * published the site draws the album from its thumbnail, which is what this holds.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { albumCoverPath } from '../../lib/music/albumsData';

// An album record in the two states data/endfield-albums.json holds it in: staged, so still
// on its YouTube thumbnail, and adopted, with the published file's name filled in.
const staged = { game: 'endfield', coverUrl: 'https://i.ytimg.com/vi/aaaaaaaaaa1/maxresdefault.jpg', coverFilename: '' };
const adopted = { ...staged, coverFilename: 'endfield-one_cover.webp' };

test('an Endfield album is drawn from its YouTube thumbnail until its cover is published', () => {
  assert.equal(albumCoverPath(staged), staged.coverUrl);
  assert.equal(albumCoverPath(adopted), '/album-covers/endfield-one_cover.webp');
  // Only YouTube's own art-track thumbnails, and only for Endfield: anything else has no cover.
  assert.equal(albumCoverPath({ ...staged, coverUrl: 'https://example.invalid/cover.jpg' }), null);
  assert.equal(albumCoverPath({ ...staged, game: 'arknights' }), null);
  assert.equal(albumCoverPath({ ...staged, coverUrl: '' }), null);
});
