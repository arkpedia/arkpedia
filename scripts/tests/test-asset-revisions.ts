import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pinAssetUrl } from '../../lib/assets/revisions';
import revisions from '../../data/assets/revisions.json';

test('pins public media while preserving encoded filenames and template placeholders', () => {
  assert.equal(pinAssetUrl('https://raw.githubusercontent.com/arkpedia/arkpedia-voice-english/main/current/a%20b/{id}.mp3'),
    `https://cdn.jsdelivr.net/gh/arkpedia/arkpedia-voice-english@${revisions['arkpedia-voice-english']}/current/a%20b/{id}.mp3`);
  assert.equal(pinAssetUrl('https://example.com/main/test.mp3'), 'https://example.com/main/test.mp3');
  assert.throws(() => pinAssetUrl('https://raw.githubusercontent.com/arkpedia/unconfigured-assets/main/image.png'), /Missing asset revision/);
});
