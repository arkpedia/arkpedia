import data from '@/data/story-native.json';
import type { NativeStories } from './nativeStory';

/** Statically bundled for old releases and Worker requests without a writable data directory. */
export function nativeStoryData(): NativeStories {
  return data.chapters as NativeStories;
}
