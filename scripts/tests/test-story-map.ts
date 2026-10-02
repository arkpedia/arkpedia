import assert from 'node:assert/strict';
import test from 'node:test';
import { storySections } from '../../lib/story/storyMap';
import { bundledStoryMap } from '../../lib/story/storyMapData';

/*
 * The Story page's List view groups the board's stories by its own labelled frames
 * (lib/story/storyMap.ts storySections). Held against the board as imported, so a change to
 * the board or to the grouping that scatters the stories is caught here, not on a phone.
 */
const map = bundledStoryMap();
const sections = storySections(map);
const pictures = map.elements.filter((element) => element.type === 'picture');

test('every picture on the board is in exactly one section', () => {
  const listed = sections.flatMap((section) => section.stories.map((story) => story.id));
  assert.equal(listed.length, pictures.length);
  assert.equal(new Set(listed).size, pictures.length);
});

test('the main story leads, in its order', () => {
  assert.match(sections[0].name, /First Main Story/);
  assert.equal(sections[0].stories[0].link?.story, 'main_0', 'Evil Time Part 1 first');
  const firstMain = sections[0].stories.map((story) => story.link?.story).filter((id) => id?.startsWith('main_'));
  assert.deepEqual(firstMain, [...firstMain].sort((a, b) => Number(a!.slice(5)) - Number(b!.slice(5))), 'the chapters in order');
});

test('a one-story frame is a section of its own, and a story beside a frame joins its neighbours', () => {
  const of = (story: string) => sections.find((section) => section.stories.some((picture) => picture.link?.story === story))?.name;
  assert.equal(of('act28side'), 'Columbia', 'Come Catastrophes or Wakes of Vultures');
  assert.equal(of('act39side'), 'Iberia', 'Exodus from the Pale Sea');
  assert.equal(of('act4d0'), 'Chernobog (First Main Story)', 'Operational Intelligence, hanging off the main story');
});
