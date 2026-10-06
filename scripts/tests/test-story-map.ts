import assert from 'node:assert/strict';
import test from 'node:test';
import { storyListSections, storySections, UNPLACED, UNPLACED_NOTE, withManga } from '../../lib/story/storyMap';
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

/*
 * The official comics (map.manga): placed under their board sections in the List view and in the
 * Manga frame below the board (withManga), the unplaced ones last under UNPLACED.
 */
test('every placed comic names a section the board has, so none is misfiled by a typo', () => {
  const names = new Set(sections.map((section) => section.name.toLowerCase()));
  const wrong = (map.manga ?? []).filter((comic) => comic.section && !names.has(comic.section.toLowerCase())).map((comic) => `${comic.title}: ${comic.section}`);
  assert.deepEqual(wrong, []);
});

test('the List view places each comic once, with the unplaced last under their note', () => {
  const listed = storyListSections(map);
  const comics = listed.flatMap((section) => section.stories.filter((story) => story.manga).map((story) => story.id));
  const offBoard = (map.manga ?? []).filter((comic) => !comic.onBoard);
  assert.equal(comics.length, offBoard.length);
  assert.equal(new Set(comics).size, comics.length);
  const sui = listed.find((section) => section.name === 'Sui');
  assert.ok(sui?.stories.some((story) => story.manga && /Sui's Daily Slices/.test(story.link?.title ?? '')), 'a Sui comic in Sui');
  const last = listed.at(-1)!;
  assert.equal(last.name, UNPLACED);
  assert.equal(last.note, UNPLACED_NOTE);
  assert.ok((map.manga ?? []).filter((comic) => comic.onBoard).every((comic) => !comics.includes(comic.id)), 'a comic that is a board picture is not listed twice');
});

test('the map draws every comic off the board below it, and grows to hold them', () => {
  const drawn = withManga(map);
  const covers = drawn.elements.filter((element) => element.type === 'picture' && element.manga);
  assert.equal(covers.length, (map.manga ?? []).filter((comic) => !comic.onBoard).length);
  assert.ok(drawn.bounds.height > map.bounds.height);
  const boardBottom = map.bounds.y + map.bounds.height;
  assert.ok(covers.every((cover) => cover.type === 'picture' && cover.y > boardBottom), 'below the board');
  assert.ok(drawn.elements.some((element) => element.type === 'text' && element.text === UNPLACED), 'the unplaced group is labelled');
});
