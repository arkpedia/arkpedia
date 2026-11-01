import fs from 'node:fs';
import path from 'node:path';
import type { EventMusic } from '@/lib/music-guesser/associations';
import type { PublishedCatalogueSong } from './musicCatalogue';

export type PageRecording = { names: string[]; videoId: string; title: string; source: string; copyright?: true };
type PageMusicSource = { events: EventMusic[]; recordings?: PageRecording[] };

/** Optional for older snapshots. Present but malformed source must fail publication. */
export function readPageMusicSource(file = path.join(process.cwd(), 'data', 'event-page-music.json')): PageMusicSource {
  let data: PageMusicSource;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')) as PageMusicSource; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { events: [] };
    throw error;
  }
  if (!Array.isArray(data?.events) || (data.recordings !== undefined && !Array.isArray(data.recordings))) throw new Error('Invalid event page music source');
  for (const row of data.recordings ?? []) {
    if (!row || !Array.isArray(row.names) || !row.names.length || row.names.some(name => typeof name !== 'string' || !name.trim()) ||
      typeof row.title !== 'string' || !row.title.trim() || typeof row.videoId !== 'string' || !/^[\w-]{11}$/.test(row.videoId) ||
      row.source !== `https://www.youtube.com/watch?v=${row.videoId}` || (row.copyright !== undefined && row.copyright !== true)) {
      throw new Error('Invalid reviewed page recording');
    }
  }
  return data;
}

/** Publish video-only fallbacks alongside the normal catalogue, without fake MSR ids.
 * Existing catalogue metadata wins when a recording later joins a released album. */
export function withReviewedPageRecordings(songs: PublishedCatalogueSong[], recordings = readPageMusicSource().recordings ?? []): PublishedCatalogueSong[] {
  const seen = new Set(songs.map(song => song.videoId).filter(Boolean));
  return [...songs, ...recordings.filter(row => !seen.has(row.videoId) && Boolean(seen.add(row.videoId))).map(row => ({
    videoId: row.videoId, title: row.title, album: row.names[0], ...(row.copyright ? { copyright: true as const } : {}),
  }))];
}
