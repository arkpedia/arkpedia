import { getContentPoster } from '@/lib/stages/stageContents';
import type { StoryMap } from './storyMap';

/*
 * Each Story chapter's art for its pop-up (components/story/ChapterDialog.tsx), as the Stages
 * section shows the same content (lib/stages/stageContents.ts getContentPoster). SERVER ONLY: it
 * reads the published asset index and the event records.
 *
 * A main-story chapter's id is its stage content's id (main_0, main_1, ...), so its art is the
 * game's square episode cover (content-art/main_N.webp). Any other chapter (a SideStory, a story
 * collection, a mini story) is an event: its banner is the event poster matched by the chapter's
 * title on the story map, the name the Stages section matches it by. The site owner, 2026-10-06:
 * "use the banners we have in the stages section for the events, and then the square chapter
 * things for the story chapters, but zoomed so that it fits the same space as the banners".
 */

/** A chapter's art: an event's banner (shown whole), or a square cover (cropped to the banner's
 *  shape around its title). `src` is a site path, as the Stages section's cards use. */
export interface ChapterArt {
  src: string;
  kind: 'banner' | 'cover';
}

/** The art of each chapter the story map names, by chapter id; a chapter with none is left out
 *  (the pop-up then shows the map's own picture of it, as a cover). */
export function chapterArt(map: StoryMap, chapterIds: readonly string[]): Record<string, ChapterArt> {
  const titles = new Map(map.elements.flatMap((element) =>
    element.type === 'picture' && element.link?.story && element.link.title ? [[element.link.story, element.link.title] as const] : []));
  const art: Record<string, ChapterArt> = {};
  for (const id of chapterIds) {
    const title = titles.get(id);
    if (!title) continue;
    const src = getContentPoster(id, /^main_\d+$/.test(id) ? 'story' : 'event', title);
    if (src) art[id] = { src, kind: src.startsWith('/event-poster/') ? 'banner' : 'cover' };
  }
  return art;
}
