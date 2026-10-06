import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chapterArt } from '../../lib/story/chapterArt';
import { bundledStoryChapters, bundledStoryMap } from '../../lib/story/storyMapData';

/* Each Story chapter's pop-up art, as the Stages section shows the same content (lib/story/chapterArt.ts):
   an event chapter's banner, a main-story chapter's square cover. */
test('an event chapter gets its banner and a main-story chapter its square cover, the Stages section\'s art', () => {
  const map = bundledStoryMap(), chapters = bundledStoryChapters();
  const art = chapterArt(map, Object.keys(chapters));
  assert.deepEqual(art.act19side, { src: "/event-poster/%5BSide%20Story%5D%20Dorothy's%20Vision.webp", kind: 'banner' });
  assert.deepEqual(art.main_0, { src: '/content-art/main_0.webp', kind: 'cover' });
  // Every main-story chapter with its game cover is a cover; every other chapter's art is a banner.
  for (const [id, entry] of Object.entries(art)) {
    assert.equal(entry.kind, entry.src.startsWith('/event-poster/') ? 'banner' : 'cover', id);
    if (entry.kind === 'cover') assert.match(id, /^main_\d+$/, `${id} is a main-story chapter`);
  }
  // On today's data every chapter has one: the pop-up never falls back to the map's picture.
  assert.deepEqual(Object.keys(chapters).filter((id) => !art[id]), []);
  // A chapter the map does not name has no title to match by, and gets none.
  assert.deepEqual(chapterArt(map, ['nothing_here']), {});
});
