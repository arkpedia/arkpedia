// Reviewed Main Theme recordings. Sources identify actual stage usage, not just
// the album's release chapter. Shared recordings retain connections to both chapters.
// The chapters are arkpedia-data's record; the aliases a chapter answers to and its
// source URL follow from its number, so they are built here rather than written there.
import type { EventMusic } from './associations';
import record from '@/data/music-guesser-main-story.json';

function chapter(number: number, title: string, chinese: string, tracks: EventMusic['tracks']): EventMusic {
  const padded = String(number).padStart(2, '0');
  return {
    chapter: number,
    names: [`Episode ${padded}: ${title}`, title, chinese,
      ...[...new Set([String(number), padded])].flatMap((n) => [`Chapter ${n}`, `Episode ${n}`, `Ch ${n}`, `Ep ${n}`, `Main Story Chapter ${n}`])],
    characters: [],
    source: number < 5 ? 'https://arknights.wiki.gg/wiki/Soundtrack/BGM/Main_Theme' : `https://arknights.wiki.gg/wiki/Episode_${padded}/BGM`,
    tracks,
  };
}

export const MAIN_STORY_MUSIC: EventMusic[] = record.chapters.map((entry) =>
  chapter(entry.chapter, entry.title, entry.chinese, entry.tracks as EventMusic['tracks']));
