import albums from '../../data/albums.json';
import review from '../../data/music-guesser-review.json';
import { getReviewedAssociations } from '../../lib/music-guesser/associations';
import { getSongChoices } from '../../lib/music-guesser/catalogue';
import { getMusicCoverage, selectMusicPool } from '../../lib/music-guesser/game';

const associations = getReviewedAssociations();
const excluded = new Map(Object.entries(review.excludedTracks));
const eventAlbums = albums.filter((album) => album.albumCategory.some((category) => category === 'Event OST' || category === 'Vignette OST'));
let missing = 0;
for (const album of eventAlbums) {
  const included = album.songs.filter((song) => associations.has(song.songId));
  const omitted = album.songs.filter((song) => excluded.has(song.songId));
  const unchecked = album.songs.filter((song) => !associations.has(song.songId) && !excluded.has(song.songId));
  console.log(`${album.albumAltName || album.albumName}: ${included.length} in-game, ${omitted.length} excluded, ${unchecked.length} unchecked`);
  for (const song of unchecked) console.error(`  Review needed: ${song.songId} ${song.songName}`);
  missing += unchecked.length;
}
const songs = getSongChoices();
const coverage = getMusicCoverage(songs);
console.log(`\n${eventAlbums.length} event/vignette albums audited; ${missing} unchecked tracks.`);
console.log(`${selectMusicPool(songs, 'ingame').length} in-game songs / ${songs.length} library songs.`);
console.log(`${coverage.events.length} events, ${coverage.vignettes.length} mini-events, ${coverage.chapters.length} chapters, ${coverage.contracts.length} CC operations.`);
for (const event of review.unavailableEvents) console.log(`Unavailable: ${event.name} — ${event.reason}`);
if (missing) process.exitCode = 1;
