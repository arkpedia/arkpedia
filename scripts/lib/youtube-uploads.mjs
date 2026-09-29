/**
 * Monster Siren's own YouTube uploads, for the album stage (scripts/sync/sync-albums.mjs):
 * a song it imported has no videoId, so the music player skips it until one is filled in.
 * Monster Siren's tracks reach YouTube as the distributor's auto-generated uploads ("Provided
 * to YouTube by YOYOROCK"), two to four weeks after the song is on Monster Siren, on the
 * channel below. Its feed lists the newest 15 uploads, so a song is matched on the daily run
 * after its upload appears; on a day with more than 15 new uploads the oldest of them fall
 * off before the next run sees them, and those songs stay flagged for a person.
 *
 * An upload is matched to a song by title, which the distributor writes in Traditional
 * Chinese where Monster Siren writes Simplified, with full-width punctuation as ASCII, its
 * own capitalisation, and "(Instrumental Version)" for "(Instrumental)". Both sides are
 * normalized the same way (normalizeTitle). A single-track album can go up as
 * "<album>: <song> (Original Soundtrack)" (月行水上: 凡常恩典), which matches only its one
 * song and only when the album's name matches too.
 *
 * A match must be unique both ways: one upload for the song, and one song in the whole
 * catalogue for the upload (so a re-upload of an older track with the same name is never
 * given to the new one), and the video must not already belong to another song.
 */
import * as OpenCC from 'opencc-js';

export const MSR_CHANNEL = 'UCzow4LPT9IunlkFdt4Y0-FQ';
export const MSR_FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${MSR_CHANNEL}`;

// Character by character (with Taiwan's variant forms), not phrase by phrase: a title is
// the song's name, and a vocabulary swap would change a word Monster Siren kept.
const simplified = OpenCC.Converter({ from: 'tw', to: 'cn' });

export function normalizeTitle(text) {
  return simplified(String(text ?? '').normalize('NFKC'))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\(\s*instrumental(?: version)?\s*\)/g, '(instrumental)')
    .replace(/\s*\(instrumental\)/g, ' (instrumental)')
    .trim();
}

const albumName = text => normalizeTitle(text).replace(/\s*(?:original soundtrack|ost)$/, '').trim();

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = text => text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, name) =>
  name[0] === '#' ? String.fromCodePoint(Number.parseInt(name.slice(name[1].toLowerCase() === 'x' ? 2 : 1), name[1].toLowerCase() === 'x' ? 16 : 10))
    : ENTITIES[name.toLowerCase()] ?? whole);

/** The feed's uploads, newest first: [{ videoId, title }]. */
export function parseFeed(xml) {
  const uploads = [];
  for (const [entry] of String(xml).matchAll(/<entry>[\s\S]*?<\/entry>/g)) {
    const videoId = entry.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1];
    const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    if (videoId && title) uploads.push({ videoId, title: decode(title).trim() });
  }
  return uploads;
}

/** The channel's latest uploads, or [] when the feed does not load: a missing feed changes
 * nothing, and the songs stay flagged until a run that reads it. */
export async function fetchUploads(fetcher, log = () => {}) {
  try {
    const response = await fetcher(MSR_FEED, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const uploads = parseFeed(await response.text());
    if (!uploads.length) throw new Error('no uploads in the feed');
    return uploads;
  } catch (error) {
    log(`  ! Monster Siren's YouTube feed did not load (${error.message}); no videoId is filled in this run`);
    return [];
  }
}

/** What an upload's title names: the song, and the album when it is the OST single form. */
function uploadKey(title) {
  const single = String(title).normalize('NFKC').match(/^(.+?):\s*(.+?)\s*\(original soundtrack\)$/i);
  return single ? { song: normalizeTitle(single[2]), album: albumName(single[1]) } : { song: normalizeTitle(title), album: null };
}

/**
 * The uploads that belong to the wanted songs: [{ songId, videoId, title }].
 *   songs:  every song in the catalogue, as { songId, songName, videoId, albumName,
 *           albumAltName, albumSize }
 *   wanted: the ids of the songs still without a videoId that may take one
 */
export function matchUploads({ songs, wanted, uploads }) {
  const used = new Set(songs.map(song => song.videoId).filter(Boolean));
  const seen = new Set();
  const keyed = uploads.filter(upload => !seen.has(upload.videoId) && seen.add(upload.videoId))
    .map(upload => ({ ...upload, ...uploadKey(upload.title) }));
  const names = new Map(songs.map(song => [song.songId, normalizeTitle(song.songName)]));
  const fits = (upload, song) => names.get(song.songId) === upload.song && (upload.album === null
    || (song.albumSize === 1 && [song.albumName, song.albumAltName].filter(Boolean).map(albumName).includes(upload.album)));
  const matches = [];
  for (const song of songs) {
    if (song.videoId || !wanted.has(song.songId)) continue;
    const hits = keyed.filter(upload => fits(upload, song));
    if (hits.length !== 1) continue;
    const [upload] = hits;
    if (used.has(upload.videoId)) continue;
    if (songs.filter(other => fits(upload, other)).length !== 1) continue;
    matches.push({ songId: song.songId, videoId: upload.videoId, title: upload.title });
  }
  return matches;
}
