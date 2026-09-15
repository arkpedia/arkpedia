// ---------------------------------------------------------------------
// The player streams directly from YouTube's own embedded player -- no
// files are downloaded or hosted on this site. Point it at any channel's
// uploads by channel ID (starts with "UC").
// ---------------------------------------------------------------------
export const MUSIC_CHANNEL_ID = 'UCzow4LPT9IunlkFdt4Y0-FQ'; // Monster Siren Records

// Every channel has an "uploads" playlist automatically. Its ID is always
// the channel ID with "UC" swapped for "UU".
export function getUploadsPlaylistId(channelId: string): string {
  return 'UU' + channelId.slice(2);
}