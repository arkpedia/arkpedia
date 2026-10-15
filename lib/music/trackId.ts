/**
 * What a song in the player is called, and where its sound comes from.
 *
 * Every song list, the queue, favourites, playlists and the record a reload resumes from
 * (lib/music/musicResume.ts) name a song by one string. For a song with a YouTube upload that
 * string is the bare YouTube video id, as it always was, so every favourite, playlist and queue
 * saved before Monster Siren playback existed still names the same song. A song nobody has found
 * a YouTube upload for is played from Monster Siren's own audio (its song id, the `cid` of
 * monster-siren.hypergryph.com/api/song/<cid>) and is called `msr:<cid>`: a colon is never in a
 * YouTube id, so the two can never be confused.
 */
export type TrackSource = { kind: 'youtube'; videoId: string } | { kind: 'msr'; cid: string };

const MSR_PREFIX = 'msr:';
/** A YouTube video id, as YouTube issues them (playlists have always stored exactly these). */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
/** A Monster Siren song id: digits (six, so far), the same rule pages/api/music-guesser applies. */
const MSR_CID = /^\d{1,12}$/;

export function msrTrackId(cid: string): string {
  return `${MSR_PREFIX}${cid}`;
}

/** Where the track's sound comes from, or null for a string that names no track. */
export function trackSource(id: string): TrackSource | null {
  if (id.startsWith(MSR_PREFIX)) {
    const cid = id.slice(MSR_PREFIX.length);
    return MSR_CID.test(cid) ? { kind: 'msr', cid } : null;
  }
  return id ? { kind: 'youtube', videoId: id } : null;
}

export function isMsrTrackId(id: string): boolean {
  return trackSource(id)?.kind === 'msr';
}

/** A track id a playlist may store: a YouTube video id, or a Monster Siren one. */
export function isStoredTrackId(id: unknown): id is string {
  return typeof id === 'string' && (YOUTUBE_ID.test(id) || isMsrTrackId(id));
}

/** The song's YouTube page, for a song that has one; null for a Monster Siren song. */
export function youtubeWatchUrl(id: string): string | null {
  const source = id ? trackSource(id) : null;
  return source?.kind === 'youtube' ? `https://www.youtube.com/watch?v=${source.videoId}` : null;
}

/** Where a track's lyric file is published (lib/music/albumsDataServer.ts writes them): one
 *  file per track, named so a Monster Siren id makes a plain filename with no colon in it. */
export function lyricsPath(id: string): string {
  const source = trackSource(id);
  return `/lyrics/${source?.kind === 'msr' ? `msr-${source.cid}` : id}.json`;
}
