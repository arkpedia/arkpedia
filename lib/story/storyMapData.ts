import storyMapData from '../../data/story-map.json';
import storyChaptersData from '../../data/story-chapters.json';
import type { StoryChapters } from './storyChapters';
import { assertStoryMap, type StoryMap } from './storyMap';

/** The map compiled into this deployment, checked. Server code only (the page's builder, the
 *  tests): the browser gets the map in the page's props, so a release can change it. */
export function bundledStoryMap(): StoryMap {
  const map: unknown = storyMapData;
  assertStoryMap(map);
  return map;
}

/** Each map chapter's sections, as Timo's reader numbers them (data/story-chapters.json), compiled
 *  into this deployment like the map. */
export function bundledStoryChapters(): StoryChapters {
  return (storyChaptersData as unknown as { chapters: StoryChapters }).chapters;
}
