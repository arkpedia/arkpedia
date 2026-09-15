// Server-only projection: include answer names, leaving full credits, album metadata and lyrics out of the game bundle.
import albums from '@/data/albums.json';
import type { SongChoice } from './game';
import { getReviewedAssociations } from './associations';
import { characterEp } from './eps';

/** Credit annotations describe roles or versions, not part of the artist name. */
export function creditArtistNames(name: string): string[] {
  return name.normalize('NFKC').split(' / ').flatMap((part) => {
    const credited = part.match(/\(credited as ["“]?([^)"]+?)["”]?\)/i)?.[1];
    const plain = part.replace(/\([^)]*\)/g, '').trim();
    return [plain, credited?.trim()].filter((value): value is string => Boolean(value));
  });
}

export function getSongChoices(): SongChoice[] {
  const unique = new Map<string, SongChoice>();
  const associations = getReviewedAssociations();
  for (const album of albums) {
    for (const song of album.songs || []) {
      // Clues use the MSR ID; the optional video ID opens the full track in Arkpedia's player.
      if (!/^\d+$/.test(song.songId) || !song.songName.trim()) continue;
      const ep = characterEp(album, song);
      const artists = [...new Set((song.credits || []).filter((credit) => ['artist', 'composer', 'performer'].includes(credit.role)).flatMap((credit) => credit.names.flatMap(creditArtistNames)))];
      unique.set(song.songId, { id: song.songId, title: song.songName, altTitle: song.songAltName || null, videoId: song.videoId, ...(artists.length ? { artists } : {}), ...associations.get(song.songId), ...(ep ? { ep } : {}) });
    }
  }
  return [...unique.values()];
}
