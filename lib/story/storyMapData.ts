import storyMapData from '../../data/story-map.json';
import { assertStoryMap, type StoryMap } from './storyMap';

/** The map compiled into this deployment, checked. Server code only (the page's builder, the
 *  tests): the browser gets the map in the page's props, so a release can change it. */
export function bundledStoryMap(): StoryMap {
  const map: unknown = storyMapData;
  assertStoryMap(map);
  return map;
}
