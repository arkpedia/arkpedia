/**
 * Import Monster Siren's album catalogue into data/albums.json: the albums and songs
 * Hypergryph's music label publishes that the catalogue does not have yet, and release
 * dates in the one form the site sorts by. It runs as the release job's `albums` stage,
 * before `lyrics`, so a new song's lyrics arrive the same day it does.
 *
 * Until this stage existed nothing wrote albums.json: the refresh fingerprint already
 * hashed Monster Siren's song list, so a new song started the day's job, and then no stage
 * added it (album 0232 "Rondo in the Clouds" sat missing that way).
 *
 * What it writes:
 *
 * - A new album, appended at the end (the file runs oldest first; Monster Siren lists
 *   newest first), with every field its API supplies: id, name, cover address, and its
 *   songs in the album's own order. The English title, characters, categories and genres
 *   are editorial and start empty. The release date is the day the cover was uploaded,
 *   since Monster Siren publishes none (lib/music/releaseDate.mjs).
 * - A new song, appended to its album, with its id, name and exact length (read from the
 *   WAV header of the audio, as the lyrics sync does for its drafts). Its videoId stays
 *   empty: the YouTube upload is not derivable, and a song without one still plays in the
 *   song guesser, which streams from Monster Siren. It is flagged, not held back.
 * - A cover filename, for an album without one, once the image repository publishes the
 *   file under the catalogue's naming (spaces as underscores, as 286 of 293 are named).
 * - A release date in stored form (YYYY/MM/DD) where the record has it typed some other
 *   way ("October 8, 2025"), or has none and its cover says when it was uploaded.
 *
 * What it will NOT do:
 *
 * - Change anything someone wrote. An English title, a videoId, credits, categories, a
 *   cover filename or a date already in stored form is never touched; a record upstream
 *   no longer lists is kept, the way the lyrics and image syncs keep what a source drops.
 * - Reflow the file. albums.json is hand-formatted -- short arrays inline, and not even
 *   consistently -- so every change is spliced into the text where it belongs, and the
 *   result is checked to be exactly the intended document before it is written.
 *
 * What it reports (data/quarantine.json, stage 'albums'), never failing the release:
 *
 * - album:<cid> / song:<cid>, omitted-new: listed by Monster Siren, still not in the
 *   catalogue after this run (its detail did not load). This is the completeness check:
 *   the run's log also compares the two catalogues' album and song counts.
 * - song:<cid>, published-partial: a song this stage imported that still has no YouTube
 *   videoId, so the music player skips it. The flag stays until someone adds one. Songs
 *   that were in the catalogue before this stage existed are not flagged: the 2026-09-08
 *   review (docs/archive/music-player-catalogue-review-2026-09-08.md) found no verified
 *   upload for them.
 * - album:<cid>, published-partial: an album with no cover in the image repository yet.
 * - song:<cid>, omitted-new: a new track on an album already filed as an Event or Vignette
 *   OST. The song guesser's suite requires every such track to have a disposition (an
 *   in-game use, or an exclusion in data/music-guesser-review.json), so importing it bare
 *   would fail the release's tests; it waits for one instead. An excluded track goes in.
 *
 * Usage: node scripts/sync/sync-albums.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beginStage, defaultNow, readQuarantine } from '../lib/quarantine.mjs';
import { coverUploadDate, normalizeReleaseDate, parseReleaseDate } from '../../lib/music/releaseDate.mjs';

export const API = 'https://monster-siren.hypergryph.com/api';
export const STAGE = 'albums';
const ALBUMS = 'data/albums.json';
// Fewer than this and the listing is truncated or its schema changed: refuse, as the
// lyrics sync refuses a song list under 500.
const MIN_ALBUMS = 200;
const MIN_SONGS = 500;
const WIDTH = 80;
// Album categories whose every track needs a song-guesser disposition
// (scripts/tests/test-music-guesser.ts, 'every event and vignette album track ...').
const REVIEWED_CATEGORIES = ['Event OST', 'Vignette OST'];

async function apiData(fetcher, url) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(30_000), headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  const body = await response.json();
  if (body?.code !== 0) throw new Error(`API code ${body?.code}: ${url}`);
  return body.data;
}

/**
 * Exact track length from the audio itself: 4kB by range request, then the RIFF chunks --
 * byteRate and the data chunk's size give the duration outright. New releases are WAV;
 * anything else returns null and the length is left for a person rather than guessed.
 */
export async function trackLength(sourceUrl, fetcher = fetch) {
  try {
    const response = await fetcher(sourceUrl, { headers: { range: 'bytes=0-4095' }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.subarray(0, 4).toString('latin1') !== 'RIFF' || bytes.subarray(8, 12).toString('latin1') !== 'WAVE') return null;
    let offset = 12, byteRate = null;
    while (offset + 8 <= bytes.length) {
      const id = bytes.subarray(offset, offset + 4).toString('latin1');
      const size = bytes.readUInt32LE(offset + 4);
      if (id === 'fmt ') byteRate = bytes.readUInt32LE(offset + 16);
      if (id === 'data') {
        if (!byteRate) return null;
        const seconds = size / byteRate;
        if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3600) return null;
        const whole = Math.round(seconds);
        return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
      }
      offset += 8 + size + (size % 2);
    }
    return null;
  } catch {
    return null;
  }
}

/** The catalogue's cover filename for an album name: spaces as underscores, and the
 * characters a filename cannot hold (and apostrophes) dropped. */
export function coverFilenameFor(albumName) {
  return `${String(albumName).replace(/[\\/*?:"<>|']/g, '').replace(/ /g, '_')}_cover.webp`;
}

// ---------------------------------------------------------------------------------------
// Editing the text in place.

/** Skips one JSON value starting at `i`; returns the index just past it. */
function skipValue(text, i) {
  if (text[i] === '"') {
    for (i++; text[i] !== '"'; i++) if (text[i] === '\\') i++;
    return i + 1;
  }
  if (text[i] === '{' || text[i] === '[') {
    let depth = 0, inString = false;
    for (; i < text.length; i++) {
      const c = text[i];
      if (inString) { if (c === '\\') i++; else if (c === '"') inString = false; continue; }
      if (c === '"') inString = true;
      else if (c === '{' || c === '[') depth++;
      else if ((c === '}' || c === ']') && --depth === 0) return i + 1;
    }
    throw new Error('Unterminated value in albums.json');
  }
  while (i < text.length && !/[\s,\]}]/.test(text[i])) i++;
  return i;
}
const skipSpace = (text, i) => { while (/\s/.test(text[i] ?? '')) i++; return i; };

/** Each element of the array at `start`, as [start, end) spans of the text. */
function elements(text, start) {
  if (text[start] !== '[') throw new Error('Expected an array in albums.json');
  const spans = [];
  let i = skipSpace(text, start + 1);
  while (text[i] !== ']') {
    const end = skipValue(text, i);
    spans.push({ start: i, end });
    i = skipSpace(text, end);
    if (text[i] === ',') i = skipSpace(text, i + 1);
  }
  return { spans, close: i };
}

/** Each property of the object at `start`: its key and the [start, end) span of its value. */
function properties(text, start) {
  if (text[start] !== '{') throw new Error('Expected an object in albums.json');
  const props = new Map();
  let i = skipSpace(text, start + 1);
  while (text[i] !== '}') {
    const keyEnd = skipValue(text, i);
    const key = JSON.parse(text.slice(i, keyEnd));
    i = skipSpace(text, keyEnd);
    if (text[i] !== ':') throw new Error(`Malformed property ${key} in albums.json`);
    const valueStart = skipSpace(text, i + 1);
    const valueEnd = skipValue(text, valueStart);
    props.set(key, { start: valueStart, end: valueEnd });
    i = skipSpace(text, valueEnd);
    if (text[i] === ',') i = skipSpace(text, i + 1);
  }
  return props;
}

const indentAt = (text, index) => text.slice(text.lastIndexOf('\n', index - 1) + 1, index).match(/^\s*/)[0];

/** A new record in the file's own style: two-space indentation, and an array of plain
 * values on one line when that line fits in 80 columns. */
export function formatRecord(value, indent = '', column = indent.length) {
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    if (value.every(item => item === null || typeof item !== 'object')) {
      const inline = `[${value.map(item => JSON.stringify(item)).join(', ')}]`;
      if (column + inline.length + 1 <= WIDTH) return inline;
      return `[\n${value.map(item => inner + JSON.stringify(item)).join(',\n')}\n${indent}]`;
    }
    return `[\n${value.map(item => inner + formatRecord(item, inner)).join(',\n')}\n${indent}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) return '{}';
    return `{\n${keys.map(key => {
      const prefix = `${inner}${JSON.stringify(key)}: `;
      return prefix + formatRecord(value[key], inner, prefix.length);
    }).join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}

/**
 * The catalogue text with the plan applied, and nothing else changed: new songs appended
 * to their albums, dates rewritten, new albums appended to the file. The result is parsed
 * and compared with the same plan applied to the parsed catalogue, so a splice that went
 * anywhere it should not stops the stage instead of publishing a damaged file.
 */
export function applyPlan(text, { newAlbums = [], newSongs = new Map(), fields = new Map() }) {
  const albums = JSON.parse(text);
  if (!Array.isArray(albums)) throw new Error('Unrecognised albums.json shape');
  const expected = structuredClone(albums);
  const edits = [];
  const { spans, close } = elements(text, text.indexOf('['));
  if (spans.length !== albums.length) throw new Error('albums.json did not scan as its parsed length');
  spans.forEach((span, index) => {
    const id = String(albums[index].albumId);
    const props = properties(text, span.start);
    for (const [key, value] of Object.entries(fields.get(id) ?? {})) {
      const at = props.get(key);
      if (!at) throw new Error(`Album ${id} has no ${key} to rewrite`);
      edits.push({ start: at.start, end: at.end, text: JSON.stringify(value) });
      expected[index][key] = value;
    }
    const songs = newSongs.get(id);
    if (songs?.length) {
      const at = props.get('songs');
      if (!at) throw new Error(`Album ${id} has no songs list`);
      const list = elements(text, at.start);
      const albumIndent = indentAt(text, span.start);
      const songIndent = list.spans.length ? indentAt(text, list.spans[0].start) : `${albumIndent}    `;
      const formatted = songs.map(song => songIndent + formatRecord(song, songIndent)).join(',\n');
      if (list.spans.length) {
        edits.push({ start: list.spans.at(-1).end, end: list.spans.at(-1).end, text: `,\n${formatted}` });
      } else {
        edits.push({ start: at.start, end: at.end, text: `[\n${formatted}\n${albumIndent}  ]` });
      }
      expected[index].songs = [...(expected[index].songs ?? []), ...songs];
    }
  });
  if (newAlbums.length) {
    const albumIndent = spans.length ? indentAt(text, spans[0].start) : '  ';
    const formatted = newAlbums.map(album => albumIndent + formatRecord(album, albumIndent)).join(',\n');
    edits.push(spans.length
      ? { start: spans.at(-1).end, end: spans.at(-1).end, text: `,\n${formatted}` }
      : { start: close, end: close, text: `\n${formatted}\n` });
    expected.push(...newAlbums);
  }
  let out = text;
  for (const edit of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  if (JSON.stringify(JSON.parse(out)) !== JSON.stringify(expected)) throw new Error('albums.json edit produced a different document than planned');
  return out;
}

// ---------------------------------------------------------------------------------------
// Deciding what to write.

/** A song record with what Monster Siren supplies; the editorial fields start empty. */
export function newSongRecord(song, albumId, length = null) {
  return {
    songId: String(song.cid),
    songName: song.name,
    songAltName: '',
    albumId: String(albumId),
    credits: [],
    // The lyrics stage, which runs next, fills both when Monster Siren has lyrics.
    lyricUrl: '',
    lyricFilename: '',
    videoId: '',
    length: length ?? '',
    songCategory: [],
    songGenre: [],
    copyright: '',
  };
}

/** An album record with what Monster Siren supplies; the editorial fields start empty. */
export function newAlbumRecord(detail, songs, assets) {
  const cover = coverFilenameFor(detail.name);
  return {
    albumId: String(detail.cid),
    albumName: detail.name,
    albumAltName: '',
    coverUrl: detail.coverUrl ?? '',
    coverFilename: assets.has(`album-covers/${cover}`) ? cover : '',
    releaseDate: coverUploadDate(detail.coverUrl) ?? '',
    region: '',
    characters: [],
    albumCategory: [],
    albumGenre: [],
    songs,
  };
}

/**
 * The field fixes an existing album gets: a date in stored form (typed some other way, or
 * blank and dated by its cover), and a cover filename once the image repository has the
 * file. Nothing already filled in and valid is touched.
 */
export function albumFieldFixes(album, assets) {
  const fixes = {};
  const date = typeof album.releaseDate === 'string' ? album.releaseDate : '';
  // Only a date the record holds as text is rewritten in place; a record without the field
  // is malformed by hand, and the completeness check names it.
  if (typeof album.releaseDate === 'string' && parseReleaseDate(date) === null) {
    const fixed = date.trim() ? normalizeReleaseDate(date) : coverUploadDate(album.coverUrl);
    if (fixed && fixed !== date) fixes.releaseDate = fixed;
  }
  if (album.coverFilename === '' && typeof album.albumName === 'string') {
    const cover = coverFilenameFor(album.albumName);
    if (assets.has(`album-covers/${cover}`)) fixes.coverFilename = cover;
  }
  return fixes;
}

/**
 * The stage's quarantine entries, from the catalogue as this run leaves it: what Monster
 * Siren lists that is still missing, the imported songs still without a videoId (this
 * run's imports and every song an earlier run flagged), and albums without a cover.
 */
export function reviewAlbumCoverage({ albums, msrAlbums, msrSongs, flagged, awaitingReview = new Set() }) {
  const entries = [];
  const localAlbums = new Map(albums.map(album => [String(album.albumId), album]));
  const localSongs = new Map(albums.flatMap(album => (album.songs ?? []).map(song => [String(song.songId), { song, album }])));
  for (const album of msrAlbums) {
    if (!localAlbums.has(String(album.cid))) {
      entries.push({ key: `album:${album.cid}`, action: 'omitted-new', sourceRef: `${API}/album/${album.cid}/detail`,
        reason: `Monster Siren album ${album.cid} (${album.name}) is not in albums.json yet: its detail did not load` });
    }
  }
  for (const song of msrSongs) {
    if (localSongs.has(String(song.cid)) || !localAlbums.has(String(song.albumCid))) continue;
    entries.push({ key: `song:${song.cid}`, action: 'omitted-new', sourceRef: `${API}/album/${song.albumCid}/detail`,
      reason: awaitingReview.has(String(song.cid))
        ? `Monster Siren song ${song.cid} (${song.name}) waits for a song-guesser disposition before it joins album ${song.albumCid}, an Event or Vignette OST`
        : `Monster Siren song ${song.cid} (${song.name}) is not in albums.json yet (album ${song.albumCid})` });
  }
  for (const id of [...flagged].sort()) {
    const found = localSongs.get(id);
    if (!found || found.song.videoId) continue;
    entries.push({ key: `song:${id}`, action: 'published-partial', sourceRef: `https://monster-siren.hypergryph.com/music/${id}`,
      reason: `${found.song.songName} (album ${found.album.albumId}) has no YouTube videoId yet: the song guesser plays it, the music player skips it` });
  }
  for (const album of albums) {
    if (album.coverFilename) continue;
    entries.push({ key: `album:${album.albumId}`, action: 'published-partial', sourceRef: album.coverUrl || undefined,
      reason: `${album.albumAltName || album.albumName}: no cover in arkpedia-image-assets yet (album-covers/${coverFilenameFor(album.albumName)})` });
  }
  return entries;
}

function readAssets(root) {
  for (const file of ['data/assets/external-asset-index.json', 'data/public-asset-index.json']) {
    const at = path.join(root, file);
    if (fs.existsSync(at)) return new Set(JSON.parse(fs.readFileSync(at, 'utf8')).files ?? []);
  }
  return new Set();
}

/** One run of the stage. Returns what it found; writes nothing when dryRun is set. */
export async function syncAlbums({ root = process.cwd(), fetcher = fetch, now = defaultNow(), dryRun = false, log = console.log, minimum = { albums: MIN_ALBUMS, songs: MIN_SONGS } } = {}) {
  const file = path.join(root, ALBUMS);
  const text = fs.readFileSync(file, 'utf8');
  const albums = JSON.parse(text);
  if (!Array.isArray(albums) || !albums.length) throw new Error('Unrecognised albums.json shape');
  const assets = readAssets(root);
  const reviewFile = path.join(root, 'data/music-guesser-review.json');
  const excluded = new Set(Object.keys(fs.existsSync(reviewFile) ? JSON.parse(fs.readFileSync(reviewFile, 'utf8')).excludedTracks ?? {} : {}));

  const msrAlbums = await apiData(fetcher, `${API}/albums`);
  if (!Array.isArray(msrAlbums) || msrAlbums.length < minimum.albums) throw new Error('Incomplete Monster Siren album list; refusing refresh');
  const msrSongs = (await apiData(fetcher, `${API}/songs`))?.list;
  if (!Array.isArray(msrSongs) || msrSongs.length < minimum.songs) throw new Error('Incomplete Monster Siren song list; refusing refresh');

  const localAlbums = new Map(albums.map(album => [String(album.albumId), album]));
  const localSongs = new Set(albums.flatMap(album => (album.songs ?? []).map(song => String(song.songId))));
  const missingByAlbum = new Map();
  for (const song of msrSongs) {
    if (localSongs.has(String(song.cid))) continue;
    const list = missingByAlbum.get(String(song.albumCid)) ?? [];
    list.push(String(song.cid));
    missingByAlbum.set(String(song.albumCid), list);
  }

  // Oldest first, the file's own order: Monster Siren lists its newest album first.
  const newAlbums = [], newSongs = new Map(), imported = new Set(), awaitingReview = new Set();
  for (const listed of [...msrAlbums].reverse()) {
    const cid = String(listed.cid);
    const local = localAlbums.get(cid);
    if (local && !missingByAlbum.has(cid)) continue;
    let detail;
    try { detail = await apiData(fetcher, `${API}/album/${cid}/detail`); } catch (error) { log(`  ! album ${cid} (${listed.name}): ${error.message}`); continue; }
    if (!detail || !Array.isArray(detail.songs)) { log(`  ! album ${cid} (${listed.name}): detail has no song list`); continue; }
    const reviewed = Boolean(local) && REVIEWED_CATEGORIES.some(category => (local.albumCategory ?? []).includes(category));
    const wanted = detail.songs.filter(song => !localSongs.has(String(song.cid)));
    const records = [];
    for (const song of wanted) {
      if (reviewed && !excluded.has(String(song.cid))) { awaitingReview.add(String(song.cid)); continue; }
      let length = null;
      try {
        const info = await apiData(fetcher, `${API}/song/${song.cid}`);
        if (info?.sourceUrl) length = await trackLength(info.sourceUrl, fetcher);
      } catch { /* the length is left for a person */ }
      records.push(newSongRecord(song, cid, length));
      imported.add(String(song.cid));
      localSongs.add(String(song.cid));
    }
    if (local) { if (records.length) newSongs.set(cid, records); } else newAlbums.push(newAlbumRecord({ ...detail, coverUrl: detail.coverUrl ?? listed.coverUrl }, records, assets));
  }

  const fields = new Map();
  for (const album of albums) {
    const fixes = albumFieldFixes(album, assets);
    if (Object.keys(fixes).length) fields.set(String(album.albumId), fixes);
  }
  const out = applyPlan(text, { newAlbums, newSongs, fields });
  const after = JSON.parse(out);

  const flagged = new Set([...imported, ...readQuarantine(root).entries
    .filter(entry => entry.stage === STAGE && entry.action === 'published-partial' && entry.key.startsWith('song:'))
    .map(entry => entry.key.slice('song:'.length))]);
  const entries = reviewAlbumCoverage({ albums: after, msrAlbums, msrSongs, flagged, awaitingReview });

  const songCount = after.reduce((total, album) => total + (album.songs ?? []).length, 0);
  log(`Monster Siren lists ${msrAlbums.length} albums and ${msrSongs.length} songs; albums.json now holds ${after.length} and ${songCount}.`);
  for (const album of newAlbums) log(`  + album ${album.albumId} ${album.albumName} (${album.songs.length} song(s), dated ${album.releaseDate || 'unknown'})`);
  for (const [id, songs] of newSongs) for (const song of songs) log(`  + song ${song.songId} ${song.songName} in album ${id}`);
  for (const [id, fixes] of fields) for (const [key, value] of Object.entries(fixes)) log(`  ~ album ${id} ${key}: ${JSON.stringify(localAlbums.get(id)[key])} -> ${JSON.stringify(value)}`);

  if (dryRun) {
    log('Dry run: nothing written.');
    return { newAlbums, newSongs, fields, entries, text: out };
  }
  if (out !== text) fs.writeFileSync(file, out);
  const stage = beginStage(root, STAGE, now);
  for (const entry of entries) stage.add(entry);
  const written = stage.commit();
  if (written.length) log(`${written.length} record(s) flagged (${path.join('data', 'quarantine.json')}):\n${written.map(entry => `  ! ${entry.key} (${entry.action}): ${entry.reason}`).join('\n')}`);
  return { newAlbums, newSongs, fields, entries, text: out };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  syncAlbums({ dryRun: process.argv.includes('--dry-run') }).catch(error => { console.error(error); process.exitCode = 1; });
}
