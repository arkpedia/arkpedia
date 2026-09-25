import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error Node import scripts are plain JavaScript.
import { API, applyPlan, COPYRIGHT_DEFAULT, exclusionsOutsideLibrary, formatRecord, newSongRecord, syncAlbums } from '../sync/sync-albums.mjs';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { readQuarantine } from '../lib/quarantine.mjs';

/* A made-up catalogue in the file's own hand-formatted style -- one names list expanded,
   the category lists inline -- with an album dated in prose, one dated blank, and a song
   that has never had a videoId. Frozen here so nothing depends on the day's albums.json. */
const CATALOGUE = `[
  {
    "albumId": "1001",
    "albumName": "测试OST",
    "albumAltName": "Test OST",
    "coverUrl": "https://web.hycdn.cn/siren/pic/20240210/aaaa.jpg",
    "coverFilename": "测试OST_cover.webp",
    "releaseDate": "Febuary 16, 2024",
    "region": "",
    "characters": [],
    "albumCategory": ["Event OST"],
    "albumGenre": [],
    "songs": [
      {
        "songId": "100001",
        "songName": "测试",
        "songAltName": "Test",
        "albumId": "1001",
        "credits": [
          {
            "role": "artist",
            "names": [
              "Someone"
            ]
          }
        ],
        "lyricUrl": "",
        "lyricFilename": "",
        "videoId": "abcdefghijk",
        "length": "03:00",
        "songCategory": ["Event OST"],
        "songGenre": [],
        "copyright": "no"
      }
    ]
  },
  {
    "albumId": "1002",
    "albumName": "Blank Date",
    "albumAltName": "Blank Date",
    "coverUrl": "https://web.hycdn.cn/siren/pic/20260516/bbbb.jpg",
    "coverFilename": "Blank_Date_cover.webp",
    "releaseDate": "",
    "region": "",
    "characters": [],
    "albumCategory": ["EP"],
    "albumGenre": [],
    "songs": [
      {
        "songId": "100002",
        "songName": "Old Without Video",
        "songAltName": "",
        "albumId": "1002",
        "credits": [],
        "lyricUrl": "",
        "lyricFilename": "",
        "videoId": "",
        "length": "02:00",
        "songCategory": ["EP"],
        "songGenre": [],
        "copyright": "no"
      }
    ]
  }
]
`;

const LATE_SONG = `,
      {
        "songId": "100004",
        "songName": "Late Addition",
        "songAltName": "",
        "albumId": "1002",
        "credits": [],
        "lyricUrl": "",
        "lyricFilename": "",
        "videoId": "",
        "length": "",
        "songCategory": [],
        "songGenre": [],
        "copyright": "no"
      }`;
const NEW_ALBUM = `,
  {
    "albumId": "1003",
    "albumName": "新专辑",
    "albumAltName": "",
    "coverUrl": "https://web.hycdn.cn/siren/pic/20260921/cccc.jpg",
    "coverFilename": "",
    "releaseDate": "2026/09/21",
    "region": "",
    "characters": [],
    "albumCategory": [],
    "albumGenre": [],
    "songs": [
      {
        "songId": "100003",
        "songName": "Rondo in the Clouds",
        "songAltName": "",
        "albumId": "1003",
        "credits": [],
        "lyricUrl": "",
        "lyricFilename": "",
        "videoId": "",
        "length": "02:52",
        "songCategory": [],
        "songGenre": [],
        "copyright": "no"
      }
    ]
  }`;

/** A 44-byte WAV header for `seconds` of 16-bit stereo at 44.1 kHz: all trackLength reads. */
function wavHeader(seconds: number) {
  const bytes = Buffer.alloc(44);
  bytes.write('RIFF', 0, 'latin1'); bytes.writeUInt32LE(36 + 176400 * seconds, 4); bytes.write('WAVE', 8, 'latin1');
  bytes.write('fmt ', 12, 'latin1'); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(44100, 24); bytes.writeUInt32LE(176400, 28); bytes.writeUInt16LE(4, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36, 'latin1'); bytes.writeUInt32LE(176400 * seconds, 40);
  return bytes;
}

type Upstream = { albums: object[]; songs: object[]; details: Record<string, object | null>; info: Record<string, object> };
function monsterSiren(): Upstream {
  return {
    // Newest first, as Monster Siren lists them.
    albums: [
      { cid: '1003', name: '新专辑', coverUrl: 'https://web.hycdn.cn/siren/pic/20260921/cccc.jpg' },
      { cid: '1002', name: 'Blank Date', coverUrl: 'https://web.hycdn.cn/siren/pic/20260516/bbbb.jpg' },
      { cid: '1001', name: '测试OST', coverUrl: 'https://web.hycdn.cn/siren/pic/20240210/aaaa.jpg' },
    ],
    songs: [
      { cid: '100003', name: 'Rondo in the Clouds', albumCid: '1003' },
      { cid: '100004', name: 'Late Addition', albumCid: '1002' },
      { cid: '100002', name: 'Old Without Video', albumCid: '1002' },
      { cid: '100001', name: '测试', albumCid: '1001' },
    ],
    details: {
      1003: { cid: '1003', name: '新专辑', coverUrl: 'https://web.hycdn.cn/siren/pic/20260921/cccc.jpg', songs: [{ cid: '100003', name: 'Rondo in the Clouds' }] },
      1002: { cid: '1002', name: 'Blank Date', coverUrl: 'https://web.hycdn.cn/siren/pic/20260516/bbbb.jpg',
        songs: [{ cid: '100002', name: 'Old Without Video' }, { cid: '100004', name: 'Late Addition' }] },
    },
    info: {
      100003: { cid: '100003', sourceUrl: 'https://res01.hycdn.cn/sig/100003.wav' },
      // Not WAV: its length is left blank for a person rather than guessed.
      100004: { cid: '100004', sourceUrl: 'https://res01.hycdn.cn/sig/100004.mp3' },
    },
  };
}
function fetcherFor(upstream: Upstream) {
  const json = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => ({ code: 0, msg: '', data }), arrayBuffer: async () => new ArrayBuffer(0) });
  return async (url: string) => {
    if (url === `${API}/albums`) return json(upstream.albums);
    if (url === `${API}/songs`) return json({ list: upstream.songs });
    let match = url.match(/\/album\/(\d+)\/detail$/);
    if (match) return upstream.details[match[1]] ? json(upstream.details[match[1]]) : json(null, 502);
    match = url.match(/\/song\/(\d+)$/);
    if (match) return json(upstream.info[match[1]] ?? null, upstream.info[match[1]] ? 200 : 404);
    if (url.endsWith('.wav')) {
      const bytes = wavHeader(172);
      return { ok: true, status: 206, json: async () => ({}), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) };
    }
    return { ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => Buffer.from('ID3not a wav file at all').buffer };
  };
}
function tree(assets: string[] = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-albums-'));
  fs.mkdirSync(path.join(root, 'data/assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data/albums.json'), CATALOGUE);
  const setAssets = (files: string[]) => fs.writeFileSync(path.join(root, 'data/assets/external-asset-index.json'), JSON.stringify({ files }));
  setAssets(assets);
  // A quarantine file on record, as arkpedia-data carries one, with another stage's entry.
  fs.writeFileSync(path.join(root, 'data/quarantine.json'), `${JSON.stringify({ version: 1, entries: [
    { key: 'banner:X', stage: 'catalogue', reason: 'no art', action: 'published-partial', firstSeen: '2026-09-01' }] }, null, 2)}\n`);
  return {
    root, setAssets,
    albums: () => fs.readFileSync(path.join(root, 'data/albums.json'), 'utf8'),
    held: () => JSON.parse(fs.readFileSync(path.join(root, 'data/quarantine.json'), 'utf8')).entries
      .filter((entry: { stage: string }) => entry.stage === 'albums')
      .map(({ key, action, firstSeen }: { key: string; action: string; firstSeen: string }) => `${key} ${action} ${firstSeen}`),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
const quiet = () => {};
const run = (root: string, upstream: Upstream, day: string, extra: object = {}) =>
  syncAlbums({ root, fetcher: fetcherFor(upstream), now: new Date(`${day}T20:00:00Z`), log: quiet, minimum: { albums: 1, songs: 1 }, ...extra });

test('new Monster Siren albums and songs are spliced in, dates are stored as YYYY/MM/DD, and nothing else moves', async () => {
  const t = tree();
  try {
    await run(t.root, monsterSiren(), '2026-09-25');
    const expected = CATALOGUE
      .replace('"releaseDate": "Febuary 16, 2024"', '"releaseDate": "2024/02/16"')
      // Blank, so dated by the day its cover was uploaded.
      .replace('"releaseDate": ""', '"releaseDate": "2026/05/16"')
      .replace(`        "copyright": "no"
      }
    ]
  }
]`, `        "copyright": "no"
      }${LATE_SONG}
    ]
  }${NEW_ALBUM}
]`);
    assert.equal(t.albums(), expected);
    // The imported songs are flagged until someone adds a videoId; the song that was in the
    // catalogue before (100002) is not. The new album has no cover in the image repository.
    assert.deepEqual(t.held(), [
      'album:1003 published-partial 2026-09-25',
      'song:100003 published-partial 2026-09-25',
      'song:100004 published-partial 2026-09-25',
    ]);
    const all = JSON.parse(fs.readFileSync(path.join(t.root, 'data/quarantine.json'), 'utf8')).entries;
    assert.ok(all.some((entry: { key: string }) => entry.key === 'banner:X'), "another stage's entry is left alone");

    // A day later: the image repository has the cover, an editor added one videoId. The
    // flags follow the records, and a repeat run changes nothing else.
    t.setAssets(['album-covers/新专辑_cover.webp']);
    fs.writeFileSync(path.join(t.root, 'data/albums.json'), t.albums().replace(/("songId": "100004",[\s\S]*?"videoId": )""/, '$1"LateVideo01"'));
    await run(t.root, monsterSiren(), '2026-09-26');
    assert.match(t.albums(), /"albumId": "1003",\n {4}"albumName": "新专辑",\n {4}"albumAltName": "",\n {4}"coverUrl": "[^"]+",\n {4}"coverFilename": "新专辑_cover\.webp",/);
    assert.deepEqual(t.held(), ['song:100003 published-partial 2026-09-25']);
    const settled = t.albums();
    await run(t.root, monsterSiren(), '2026-09-27');
    assert.equal(t.albums(), settled, 'a repeat run rewrites nothing');
  } finally {
    t.cleanup();
  }
});

test('an album whose detail does not load is quarantined, and the rest of the catalogue still updates', async () => {
  const t = tree();
  try {
    const upstream = monsterSiren();
    upstream.details[1003] = null;
    await run(t.root, upstream, '2026-09-25');
    const after = JSON.parse(t.albums());
    assert.deepEqual(after.map((album: { albumId: string }) => album.albumId), ['1001', '1002']);
    assert.equal(after[1].songs.length, 2, 'the late song on a loading album still arrives');
    assert.deepEqual(t.held(), ['album:1003 omitted-new 2026-09-25', 'song:100004 published-partial 2026-09-25']);
  } finally {
    t.cleanup();
  }
});

test('a new track on an Event OST album waits for its song-guesser disposition instead of failing the release', async () => {
  // The guesser's suite requires a disposition for every Event and Vignette OST track, and the
  // release job runs it after this stage: importing the track bare would stop the release.
  const withTrack = () => {
    const upstream = monsterSiren();
    upstream.songs.push({ cid: '100005', name: 'Encore', albumCid: '1001' });
    upstream.details[1001] = { cid: '1001', name: '测试OST', coverUrl: 'https://web.hycdn.cn/siren/pic/20240210/aaaa.jpg',
      songs: [{ cid: '100001', name: '测试' }, { cid: '100005', name: 'Encore' }] };
    return upstream;
  };
  const t = tree();
  try {
    await run(t.root, withTrack(), '2026-09-25');
    assert.deepEqual(JSON.parse(t.albums())[0].songs.map((song: { songId: string }) => song.songId), ['100001']);
    const held = JSON.parse(fs.readFileSync(path.join(t.root, 'data/quarantine.json'), 'utf8')).entries.find((entry: { key: string }) => entry.key === 'song:100005');
    assert.equal(held.action, 'omitted-new');
    assert.match(held.reason, /waits for a song-guesser disposition before it joins album 1001/);
    // Once it is excluded from the guesser, it is imported like any other track.
    fs.writeFileSync(path.join(t.root, 'data/music-guesser-review.json'), JSON.stringify({ excludedTracks: { 100005: 'An encore track that plays nowhere in the game.' } }));
    await run(t.root, withTrack(), '2026-09-26');
    assert.deepEqual(JSON.parse(t.albums())[0].songs.map((song: { songId: string }) => song.songId), ['100001', '100005']);
    // Same key, so the entry keeps the day it was first held.
    assert.ok(t.held().includes('song:100005 published-partial 2026-09-25'), 'now flagged for its videoId instead');
  } finally {
    t.cleanup();
  }
});

test('a truncated Monster Siren listing refuses the refresh and writes nothing', async () => {
  const t = tree();
  try {
    await assert.rejects(() => run(t.root, monsterSiren(), '2026-09-25', { minimum: { albums: 10, songs: 1 } }), /Incomplete Monster Siren album list/);
    assert.equal(t.albums(), CATALOGUE);
    assert.deepEqual(t.held(), []);
  } finally {
    t.cleanup();
  }
});

test('a splice that would change anything but the plan stops the stage', () => {
  assert.throws(() => applyPlan(CATALOGUE, { fields: new Map([['1001', { notAField: 'x' }]]) }), /has no notAField/);
  // The formatter keeps a short list on one line and breaks a long one, like the file.
  assert.equal(formatRecord({ names: ['A', 'B'] }), '{\n  "names": ["A", "B"]\n}');
  assert.equal(formatRecord({ names: ['x'.repeat(40), 'y'.repeat(40)] }), `{\n  "names": [\n    "${'x'.repeat(40)}",\n    "${'y'.repeat(40)}"\n  ]\n}`);
});

/* The planned-exclusion path, on a day Monster Siren is down. A new track on an Event OST
   album waits (omitted-new) until an editor excludes it from the song guesser; the stage then
   imports it. If the stage cannot reach Monster Siren that day, the exclusion names a song
   albums.json does not have yet, and the guesser suite's "every exclusion exists" check --
   which the release job runs -- failed the release over the outage. */
test('an exclusion written for a waiting track holds through a Monster Siren outage, and only such a track', async () => {
  const upstream = monsterSiren();
  upstream.songs.push({ cid: '100005', name: 'Encore', albumCid: '1001' });
  upstream.details[1001] = { cid: '1001', name: '测试OST', coverUrl: 'https://web.hycdn.cn/siren/pic/20240210/aaaa.jpg',
    songs: [{ cid: '100001', name: '测试' }, { cid: '100005', name: 'Encore' }] };
  const t = tree();
  const outside = (excluded: string[]) => exclusionsOutsideLibrary({ excluded, albums: JSON.parse(t.albums()), quarantine: readQuarantine(t.root) });
  try {
    await run(t.root, upstream, '2026-09-25');
    assert.ok(t.held().includes('song:100005 omitted-new 2026-09-25'), 'the track waits for its disposition');
    // The editor excludes it (and, by mistake, a song Monster Siren never listed).
    fs.writeFileSync(path.join(t.root, 'data/music-guesser-review.json'), JSON.stringify({ excludedTracks: { 100005: 'An encore track that plays nowhere in the game.' } }));
    // Monster Siren is down: the stage fails before writing anything, so its entries stand.
    const down = async () => { throw new TypeError('fetch failed'); };
    await assert.rejects(() => syncAlbums({ root: t.root, fetcher: down, now: new Date('2026-09-26T20:00:00Z'), log: quiet }), /fetch failed/);
    assert.ok(!JSON.parse(t.albums())[0].songs.some((song: { songId: string }) => song.songId === '100005'), 'not vacuous: the excluded song is still missing');
    assert.deepEqual(outside(['100001', '100005']), [], 'the waiting track is accepted, so the release is not failed over the outage');
    assert.deepEqual(outside(['100005', '999999']), ['999999'], 'an exclusion naming nothing Monster Siren lists still fails');
    // Monster Siren is back: the track comes in and no longer needs the entry.
    await run(t.root, upstream, '2026-09-27');
    assert.ok(JSON.parse(t.albums())[0].songs.some((song: { songId: string }) => song.songId === '100005'));
    assert.ok(!t.held().some((entry: string) => entry.startsWith('song:100005 omitted-new')));
    assert.deepEqual(outside(['100005']), []);
  } finally {
    t.cleanup();
  }
});

test('an imported song\'s copyright flag is the catalogue\'s own "no", which the site reads, and the flag says to check it', async () => {
  const record = newSongRecord({ cid: 100009, name: 'Imported' }, '1001', '03:00');
  assert.equal(record.copyright, 'no');
  assert.equal(COPYRIGHT_DEFAULT, 'no');
  // The lyrics sync's drafts, which an editor may paste in, use the same default.
  const lyrics = fs.readFileSync('scripts/sync/sync-lyrics.mjs', 'utf8');
  assert.match(lyrics, /copyright: COPYRIGHT_DEFAULT/);
  assert.doesNotMatch(lyrics, /copyright: ''/);
  const t = tree();
  try {
    await run(t.root, monsterSiren(), '2026-09-25');
    const flag = readQuarantine(t.root).entries.find((entry: { key: string }) => entry.key === 'song:100003');
    assert.match(flag.reason, /Its copyright flag is the default "no"; check it when adding the videoId/);
  } finally {
    t.cleanup();
  }
});
