import storyMapData from '../../data/story-map.json';
import storyChaptersData from '../../data/story-chapters.json';
import storyLibraryData from '../../data/story-library.json';
import type { StoryLibraryEntry } from './storyLibrary';
import type { StoryChapters } from './storyChapters';
import { assertStoryMap, type StoryMap } from './storyMap';
import { storyLibraryArt } from './storyLibraryArt';

/** The map compiled into this deployment, checked. Server code only (the page's builder, the
 *  tests): the browser gets the map in the page's props, so a release can change it. */
export function bundledStoryMap(): StoryMap {
  const map: unknown = storyMapData;
  assertStoryMap(map);
  return map;
}

/** Every library chapter's sections, as Timo's reader numbers them (data/story-chapters.json), compiled
 *  into this deployment like the map. */
export function bundledStoryChapters(): StoryChapters {
  return (storyChaptersData as unknown as { chapters: StoryChapters }).chapters;
}

export function bundledStoryChaptersComplete(): boolean {
  return (storyChaptersData as { completeLibrary?: boolean }).completeLibrary === true;
}

export function bundledStoryLibrary(): StoryLibraryEntry[] {
  return storyLibraryArt(storyLibraryData.entries as StoryLibraryEntry[], bundledStoryMap());
}
