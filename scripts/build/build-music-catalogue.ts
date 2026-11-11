import fs from 'node:fs';
import path from 'node:path';
import { getAllPlayerSongs } from '../../lib/music/albumsData';
import { projectMusicCatalogue } from '../../lib/music/musicCatalogue';
import { withReviewedPageRecordings } from '../../lib/music/pageRecordingsServer';

// The music player's queue, from the same albums.json the release's music pages are built
// from. scripts/content/export.mjs publishes it in the release; prebuild and predev write
// the deployment's own fail-safe copy (lib/music/musicCatalogue.ts). Every song the player can
// play: the ones on YouTube, then the ones only Monster Siren has, played from Monster Siren.
const output = projectMusicCatalogue(getAllPlayerSongs());
if (!output.songs.length) throw new Error('No playable songs in data/albums.json; refusing to write an empty music catalogue');
output.songs = withReviewedPageRecordings(output.songs);

const destination = path.join(process.cwd(), 'public/music-catalogue.json');
fs.writeFileSync(destination, `${JSON.stringify(output)}\n`);
console.log(`Wrote ${output.songs.length} music catalogue songs to ${destination}`);
