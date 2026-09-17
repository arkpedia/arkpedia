import { EVENT_EXPANSION } from '../../lib/music-guesser/eventExpansion';
import review from '../../data/music-guesser-review.json';
import { MAIN_STORY_MUSIC } from '../../lib/music-guesser/mainStory';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { creditArtistNames, getSongChoices } from '../../lib/music-guesser/catalogue';
import { getAllSongsFull } from '../../lib/music/albumsData';
import { acceptsTitle, isInstrumentalVersion, buildAnswerIndex, judgeAnswer, getMusicCoverage, searchAnswers, selectMusicPool, clipStage, selectClip, clampClipPosition, randomClipStart, makeAttempt, normalizeTitle, pickSong, searchSongs, CLIP_SECONDS } from '../../lib/music-guesser/game';
import { getReviewedAssociations, EVENT_MUSIC, CC_MUSIC } from '../../lib/music-guesser/associations';
import albums from '../../data/albums.json';
import type { AnswerMode, Round } from '../../lib/music-guesser/game';
import { AudioOnsetDetector, findBufferedOpening } from '../../lib/music-guesser/audioOnset';
import { nextAudioPrefixSize, prepareClip, readAudioPrefix } from '../../lib/music-guesser/prepareClip';
import { SongClipCache } from '../../lib/music-guesser/songClipCache';
import type { SongClip } from '../../lib/music-guesser/songClipCache';
import { confirmedRelease, eventKey, getMusicSelectionCatalogue } from '../../lib/music-guesser/selectionCatalogue';
import { connectionGroupId, DEFAULT_MUSIC_SETTINGS, isGlobalGroup, readMusicSettings, selectMusic } from '../../lib/music-guesser/selection';
import { parseLrc } from '../../lib/music/albumsDataServer';
import { readdirSync, readFileSync } from 'node:fs';

const songs = getSongChoices();
const song = { id: 'test', title: '生命流', altTitle: 'Flow of Life', videoId: 'test' };
const initial = (): Round => ({ song, attempts: [], clipIndex: 0, status: 'playing' });

test('upcoming audio shares in-flight preparation and reuses the exact decoded buffer on selection', async () => {
  let finish!: (clip: SongClip) => void;
  let downloads = 0;
  const cache = new SongClipCache(() => { downloads++; return new Promise((resolve) => { finish = resolve; }); });
  const background = cache.load('next');
  assert.equal(cache.load('next'), background, 'an early Next tap joins preparation rather than starting over');
  const clip = { url: 'https://audio.example/song', buffer: { duration: 10 } as AudioBuffer };
  finish(clip);
  assert.equal(await background, clip);
  assert.equal(await cache.load('next'), clip);
  assert.equal(downloads, 1);
  cache.clear();
});

test('audio cache cancels discarded requests and keeps only current and upcoming songs', async () => {
  const signals = new Map<string, AbortSignal>();
  const cache = new SongClipCache(async (id, signal) => {
    signals.set(id, signal);
    return { url: id, buffer: { duration: 10 } as AudioBuffer };
  });
  await cache.load('previous'); await cache.load('current'); await cache.load('next');
  assert.equal(signals.get('previous')?.aborted, true);
  assert.equal(signals.get('current')?.aborted, false);
  assert.equal(signals.get('next')?.aborted, false);
  cache.retain(['next']);
  assert.equal(signals.get('current')?.aborted, true, 'selection changes release the old song');
  cache.clear();
  assert.equal(signals.get('next')?.aborted, true, 'leaving the page cancels all pending audio');
});

test('a failed or cancelled preload is retryable and cannot discard a newer request', async () => {
  let rejectOld!: (error: Error) => void;
  let requests = 0;
  const cache = new SongClipCache(async () => {
    requests++;
    if (requests === 1) return new Promise((_resolve, reject) => { rejectOld = reject; });
    return { url: 'fresh', buffer: null };
  });
  const old = cache.load('song');
  const rejected = assert.rejects(old, /cancelled/);
  cache.remove('song');
  const fresh = cache.load('song');
  rejectOld(new Error('cancelled'));
  await rejected;
  assert.equal((await fresh).url, 'fresh');
  assert.equal(cache.load('song'), fresh);
  cache.clear();

  let failures = 0;
  const retryable = new SongClipCache(async () => { if (!failures++) throw new Error('offline'); return { url: 'ok', buffer: null }; });
  await assert.rejects(retryable.load('song'), /offline/);
  assert.equal((await retryable.load('song')).url, 'ok');
  retryable.clear();
});

test('idle streamed preloads refresh signed URLs while decoded audio stays reusable', async () => {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  let requests = 0;
  const cache = new SongClipCache(async (id) => ({ url: `${id}/${++requests}`, buffer: id === 'decoded' ? {} as AudioBuffer : null }));
  try {
    const decoded = await cache.load('decoded');
    const streamed = await cache.load('streamed');
    now += 60001;
    assert.equal(await cache.load('decoded'), decoded);
    assert.notEqual((await cache.load('streamed')).url, streamed.url);
    assert.equal(requests, 3);
  } finally { Date.now = originalNow; cache.clear(); }
});

test('WAV preparation budgets enough PCM for the clue, while compressed and malformed files stay bounded', () => {
  const wav = Buffer.alloc(44);
  wav.write('RIFF', 0); wav.write('WAVE', 8); wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt32LE(288000, 28); // stereo, 48 kHz, 24-bit PCM from MSR
  wav.write('data', 36); wav.writeUInt32LE(60000000, 40);
  assert.ok(nextAudioPrefixSize(wav, 2) >= 44 + 288000 * 32, 'include two seconds of silence and the full 30-second clue');
  assert.ok(nextAudioPrefixSize(wav, 2) < 10 * 1024 * 1024, 'fetch only the opening, not the 60 MB song');
  assert.equal(nextAudioPrefixSize(wav, null), 12 * 1024 * 1024, 'an unknown opening still respects the PCM download cap');
  wav.writeUInt32LE(0xffffffff, 28);
  assert.equal(nextAudioPrefixSize(wav, null), 12 * 1024 * 1024);
  assert.equal(nextAudioPrefixSize(wav.subarray(0, 20), 2), 2 * 1024 * 1024);
  assert.equal(nextAudioPrefixSize(new Uint8Array(10), 2), 2 * 1024 * 1024);
  assert.equal(nextAudioPrefixSize(Buffer.from('ID3 compressed MP3'), 2), 2 * 1024 * 1024);
});

test('WAV sizing survives decoders detaching their input buffer', async () => {
  const originalFetch = globalThis.fetch, originalDecoder = globalThis.OfflineAudioContext;
  const requested: number[] = [];
  globalThis.fetch = async (_url, init) => {
    const cap = Number(new Headers(init?.headers).get('Range')!.split('-')[1]) + 1;
    requested.push(cap);
    const bytes = Buffer.alloc(cap);
    bytes.write('RIFF'); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20); bytes.writeUInt32LE(288000, 28); bytes.write('data', 36);
    bytes.writeUInt32LE(60000000, 40);
    return new Response(bytes);
  };
  globalThis.OfflineAudioContext = class {
    async decodeAudioData(bytes: ArrayBuffer) {
      const length = Math.floor((bytes.byteLength - 44) / 288000 * 44100);
      structuredClone(bytes, { transfer: [bytes] });
      const samples = new Float32Array(length).fill(0.1);
      samples.fill(0, 0, 44100);
      return { numberOfChannels: 1, sampleRate: 44100, length, duration: length / 44100, getChannelData: () => samples };
    }
    createBuffer(_channels: number, length: number, rate: number) { return { duration: length / rate, copyToChannel() {} }; }
  } as unknown as typeof OfflineAudioContext;
  try {
    const buffer = await prepareClip('https://audio.example/pcm.wav', new AbortController().signal);
    assert.equal(buffer?.duration, 30);
    assert.equal(requested.length, 2);
    assert.ok(requested[1] >= 44 + 288000 * 31, 'WAV header survives decoding so the retry holds the opening and full clue');
    assert.ok(requested[1] < 10 * 1024 * 1024, 'preparation remains bounded to the needed opening');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDecoder) globalThis.OfflineAudioContext = originalDecoder;
    else Reflect.deleteProperty(globalThis, 'OfflineAudioContext');
  }
});

test('optional preparation falls back when a partial-file decoder stalls and respects cancellation', async () => {
  const originalFetch = globalThis.fetch;
  const originalDecoder = globalThis.OfflineAudioContext;
  let downloadSignal: AbortSignal | undefined;
  globalThis.OfflineAudioContext = class {
    decodeAudioData() { return new Promise<AudioBuffer>(() => {}); }
  } as unknown as typeof OfflineAudioContext;
  globalThis.fetch = async (_input, init) => {
    downloadSignal = init?.signal || undefined;
    return new Response(new Uint8Array(32));
  };
  try {
    const parent = new AbortController();
    assert.equal(await prepareClip('https://audio.example/partial.mp3', parent.signal, 20), null);
    assert.equal(parent.signal.aborted, false, 'optional preload must not abort source loading/playback');
    assert.equal(downloadSignal?.aborted, true, 'stop background downloads when the budget expires');

    const cancelled = new AbortController();
    const pending = prepareClip('https://audio.example/partial.mp3', cancelled.signal, 1000);
    cancelled.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(downloadSignal?.aborted, true, 'changing songs cancels stale preparation');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDecoder) globalThis.OfflineAudioContext = originalDecoder;
    else Reflect.deleteProperty(globalThis, 'OfflineAudioContext');
  }
});

test('every event and vignette album track has a reviewed disposition', () => {
  const associations = getReviewedAssociations();
  const excluded = new Map(Object.entries(review.excludedTracks));
  const catalogueIds = new Set(albums.flatMap((album) => album.songs.map((song) => song.songId)));
  for (const album of albums.filter((album) => album.albumCategory.some((category) => ['Event OST', 'Vignette OST'].includes(category)))) {
    for (const song of album.songs) {
      assert.notEqual(associations.has(song.songId), excluded.has(song.songId), `${album.albumAltName}: ${song.songName} must be included OR explicitly excluded`);
    }
  }
  for (const [id, reason] of excluded) {
    assert.ok(catalogueIds.has(id), `exclusion ${id} must exist in the music library`);
    assert.ok(reason.trim().length > 20);
    assert.ok(!associations.has(id), `excluded recording ${id} must not enter the in-game draw`);
  }
});

test('newer event lobby, battle and boss answers cover the complete event catalogue', () => {
  for (const [id, answer] of [
    ['779405', "Grani and the Knights' Treasure lobby"],
    ['125062', 'Here A People Sows boss'], ['697611', 'Path of Life lobby'],
    ['697601', 'Adventure That Cannot Wait for the Sun boss'], ['461137', 'Delicious On Terra boss'],
    ['306885', 'Ending a Grand Overture boss'], ['779472', 'I Portatori dei Velluti boss'],
    ['125055', 'Exodus from the Pale Sea boss'], ['953962', 'Such is the Joy of Our Reunion boss'],
    ['461132', 'When Elegies Are Ashes boss phase 1'], ['779479', 'When Elegies Are Ashes boss phase 2'],
    ['048780', 'When Elegies Are Ashes battle'], ['880309', 'The Masses Travels boss phase 2'],
    ['048771', 'Act or Die boss'], ['514514', 'Ato boss'], ['880304', 'Somniloquium Serenum boss'],
    ['048767', 'Retracing Our Steps lobby'], ['953943', 'Retracing Our Steps boss phase 1'],
    ['697685', 'Retracing Our Steps boss phase 2'], ['048765', 'Unrealized Realities boss'],
    ['461118', 'Medjehtiqedti Bound lobby'], ['125036', 'Medjehtiqedti Bound battle'],
    ['779456', 'First of A Thousand Autumns boss'], ['461113', 'People A People boss'],
    ['779442', 'Till the Lands Become an Orange boss'],
    ['306865', 'TO-1'], ['514591', 'TO-8'], ['779442', 'TO-9'],
  ]) {
    assert.equal(judge(id, answer, 'events'), 'correct', answer);
    assert.equal(judge(id, answer, 'titles'), 'incorrect', answer);
  }
  assert.equal(judge('125055', 'Thorns alter boss'), 'correct');
  assert.equal(judge('306885', 'Alistair boss'), 'correct');
  assert.equal(judge('697685', 'Enya boss phase 2'), 'correct');
  assert.equal(judge('779442', 'Sleeping Pilot boss'), 'correct');
  assert.equal(judge('306885', 'Eblana boss GO-9'), 'incorrect');
  assert.equal(judge('779442', 'Angelina alter boss', 'events'), 'incorrect');
});

test('mini-event menus and cross-album event music get their actual connections', () => {
  for (const [id, answer] of [
    ['697665', 'Stories of Afternoon lobby'], ['048741', 'Children of Ursus lobby'],
    ['306843', 'Rewinding Breeze lobby'], ['306853', 'Beyond Here lobby'],
    ['953994', 'Pinus Sylvestris lobby'], ['125084', 'A Death in Chunfen lobby'],
    ['232258', 'The Black Forest Wills A Dream lobby'], ['697618', 'To the Grinning Valley lobby'],
    ['461131', 'A Kazdelian Rescue lobby'], ['514526', 'See You Soon lobby'],
    ['232233', 'Fantasy in the Mirage lobby'], ['232227', 'Crossing lobby'],
    ['125021', 'Bolivar Diagnosed lobby'], ['880333', 'The Rides to Lake Silberneherze story'],
  ]) assert.equal(judge(id, answer, 'events'), 'correct', answer);
  assert.equal(judge('125084', 'A Death in Chunfen boss', 'events'), 'incorrect');
  assert.equal(judge('880333', 'So Long Adele lobby', 'events'), 'ambiguous');
  assert.ok(!byId('514536').inGame, 'the Grinning Valley trailer song is not its menu music');
});

test('expanded multi-track character and phase answers remain fair for every hidden song', () => {
  for (const id of ['306830', '461132', '779479', '514563']) {
    const round: Round = { song: byId(id), attempts: [], clipIndex: 0, status: 'playing' };
    for (const answer of ['Eblana boss', 'Necrass boss', 'Kreide boss', 'Retracing Our Steps boss', 'Till the Lands Become an Orange lobby']) {
      assert.equal(judge(id, answer), 'ambiguous', answer);
      assert.equal(makeAttempt(round, answer, indexes.characters), round);
    }
  }
  assert.equal(judge('306830', 'Eblana boss FC-8'), 'correct');
  assert.equal(judge('461132', 'Necrass boss phase 1'), 'correct');
  assert.equal(judge('779479', 'Eblana boss phase 2'), 'correct');
  assert.equal(judge('048739', 'Kreide boss phase 1'), 'correct');
  assert.equal(judge('232294', 'Kreide boss phase 2'), 'correct');
  assert.equal(judge('697685', 'Retracing Our Steps lobby', 'events'), 'incorrect', 'mislinked source entry must not turn the boss song into the lobby song');
});

test('anniversary main-story releases retain chapter and phase identities', () => {
  for (const [id, answer] of [
    ['125060', 'Chapter 14 battle reinforcements'],
    ['880311', 'Chapter 15 boss phase 1'], ['514522', 'Chapter 15 boss phase 2'],
    ['232239', 'Abnormal Spectrum boss'], ['048769', 'Critical Phase Transition boss phase 1'],
    ['514504', 'Critical Phase Transition boss phase 2'],
  ]) assert.equal(judge(id, answer, 'events'), 'correct', answer);
  assert.equal(judge('514504', '17-18', 'events'), 'ambiguous');
  assert.equal(judge('232239', 'Gabrielus boss'), 'correct');
});

test('MSR songs remain playable in the game and keep bilingual titles as player coverage grows', () => {
  assert.equal(songs.length, 901);
  for (const id of ['125056', '125055', '697674', '779442', '514513', '880305', '779424']) {
    assert.ok(byId(id).inGame);
    assert.equal(judge(id, byId(id).title, 'titles'), 'correct');
    if (byId(id).altTitle) assert.equal(judge(id, byId(id).altTitle!, 'titles'), 'correct');
  }
  assert.equal(judge('514513', 'CCB4 lobby'), 'correct');
  assert.equal(judge('514513', 'CC4 lobby'), 'incorrect');
});

test('restored player tracks carry their titles, credits, covers, and lyric references through the shared catalogue', () => {
  const full = getAllSongsFull();
  for (const id of ['125056', '048709', '514513', '514508', '953938', '697674', '461100']) {
    const choice = byId(id);
    const track = full.find((entry) => entry.videoId === choice.videoId);
    assert.ok(track, `missing full-player track for MSR ${id}`);
    assert.equal(track.title, choice.title);
    assert.equal(track.altTitle, choice.altTitle);
    assert.ok(track.coverPath?.startsWith('/album-covers/'));
    assert.ok(track.credits.length > 0);
  }
  const huaYu = full.find((entry) => entry.videoId === '_UQ4mwJZN8s')!;
  assert.equal(huaYu.lyricFilename, 'HUA_YU_lyrics.lrc');
  assert.equal(huaYu.length, '03:46', 'use the studio recording instead of the longer music video');
  assert.equal(huaYu.composer, 'Cassie Wei, Yamato Kasai');
  const instrumental = full.find((entry) => entry.videoId === 'nOHa7MdO-bc')!;
  assert.equal(instrumental.lyricFilename, 'Every_Road_is_a_Yes_lyrics.lrc');
  assert.equal(instrumental.hasLyrics, true);
});

test('buffered detection finds silent intros without playing and handles opposite-phase stereo', () => {
  const sampleRate = 1000;
  for (const silence of [0, 0.5, 2]) {
    const left = Float32Array.from({ length: 4000 }, (_, i) => i < silence * sampleRate ? 0 : Math.sin(i) * 0.1);
    const right = left.map((sample) => -sample);
    assert.equal(findBufferedOpening([left, right], sampleRate), silence);
  }
  assert.equal(findBufferedOpening([new Float32Array(1000)], sampleRate), null);
});

test('preloading caps downloads even when a server ignores Range and cancels the stream', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array([1, 2, 3, 4, 5, 6])); },
    cancel() { cancelled = true; },
  }));
  assert.deepEqual(await readAudioPrefix(response, 8), new Uint8Array([1, 2, 3, 4, 5, 6, 1, 2]));
  assert.equal(cancelled, true);
  assert.deepEqual(await readAudioPrefix(new Response(new Uint8Array([7, 8])), 8), new Uint8Array([7, 8]));
  await assert.rejects(readAudioPrefix(new Response(null, { status: 502 }), 8));
});

test('audible opening detection skips silence/noise and rejects isolated clicks', () => {
  const quiet = new Float32Array(1024).fill(0.001);
  const music = Float32Array.from({ length: 1024 }, (_, i) => Math.sin(i / 10) * 0.05);
  const detector = new AudioOnsetDetector();
  for (const time of [0, 0.5, 1, 1.9]) assert.equal(detector.inspect(quiet, time), null);
  assert.equal(detector.inspect(music, 2), null);
  assert.equal(detector.inspect(quiet, 2.02), null); // a transient isn't the opening
  assert.equal(detector.inspect(music, 2.5), null);
  assert.equal(detector.inspect(music, 2.53), null);
  assert.equal(detector.inspect(music, 2.56), 2.5);
});

test('music beginning immediately remains eligible and a gradual fade waits until audible', () => {
  const music = new Float32Array(1024).fill(0.02);
  const immediate = new AudioOnsetDetector();
  assert.equal(immediate.inspect(music, 0), null);
  assert.equal(immediate.inspect(music, 0.05), 0);
  const fade = new AudioOnsetDetector();
  for (let i = 0; i < 5; i++) assert.equal(fade.inspect(new Float32Array(1024).fill(i * 0.001), i * 0.1), null);
  assert.equal(fade.inspect(music, 0.5), null);
  assert.equal(fade.inspect(music, 0.56), 0.5);
});

test('every catalogue song accepts and can be searched by both of its stored titles', () => {
  assert.ok(songs.length > 800);
  assert.equal(new Set(songs.map((s) => s.id)).size, songs.length);
  for (const song of songs) {
    for (const title of [song.title, song.altTitle].filter((s): s is string => Boolean(s))) {
      assert.ok(acceptsTitle(song, title));
      assert.ok(acceptsTitle(song, `  ${title.toUpperCase()}  `));
      assert.ok(searchSongs(songs, title).some((match) => acceptsTitle(match, title)));
    }
  }
  assert.ok(gzipSync(JSON.stringify(songs)).length < 50000, 'keep the catalogue with artist names under 50 KB gzip');
});

test('normalization accepts translations, punctuation, diacritics and full-width characters without dropping versions', () => {
  assert.ok(acceptsTitle(song, 'flow-of LIFE!'));
  assert.ok(acceptsTitle(song, '生命流'));
  assert.equal(normalizeTitle('Ｃafé’s Song'), normalizeTitle('cafes song'));
  assert.ok(!acceptsTitle(song, 'Life'));
  assert.ok(!acceptsTitle(song, 'Flow of Life (Instrumental)'));
  assert.ok(!acceptsTitle(song, '!!!'));
});

test('unlimited guesses leave each window selected; skipping never spends a guess or ends a round', () => {
  assert.equal(clipStage(null), 0);
  let round = initial();
  for (let window = 0; window < CLIP_SECONDS.length; window++) {
    assert.equal(clipStage(round), window);
    for (let i = 0; i < 20; i++) round = makeAttempt(round, `Wrong song ${window}-${i}`);
    assert.equal(round.status, 'playing');
    assert.equal(clipStage(round), window);
    assert.equal(round.attempts.at(-1)?.seconds, CLIP_SECONDS[window]);
    const skipped = makeAttempt(round, null);
    assert.equal(skipped.attempts, round.attempts);
    round = skipped;
  }
  assert.equal(round.attempts.length, 100);
  assert.equal(round.status, 'playing');
  assert.equal(makeAttempt(round, null), round, 'The last window does not force an answer reveal');
  const won = makeAttempt(round, song.title);
  assert.equal(won.status, 'won');
  assert.equal(won.attempts.length, 101);
  assert.equal(makeAttempt(won, 'Another'), won);
  assert.equal(clipStage(initial()), 0);
});

test('clip windows can be selected directly and revisited without rewriting guess history', () => {
  let round = selectClip(initial(), 4);
  assert.equal(clipStage(round), 4);
  assert.equal(round.attempts.length, 0);
  round = makeAttempt(round, 'Wrong song');
  const shorter = selectClip(round, 1);
  assert.equal(clipStage(shorter), 1);
  assert.equal(shorter.attempts, round.attempts);
  assert.equal(shorter.attempts[0].seconds, 30);
  assert.equal(makeAttempt(shorter, song.title).attempts.at(-1)?.seconds, 2);
  for (const index of [-1, 5, 0.5, NaN]) assert.equal(selectClip(shorter, index), shorter);
  assert.equal(selectClip({ ...shorter, status: 'revealed' }, 0).status, 'revealed');
});

test('seek offsets stay inside the selected audio window', () => {
  for (const duration of CLIP_SECONDS) {
    assert.equal(clampClipPosition(-1, duration), 0);
    assert.equal(clampClipPosition(duration + 10, duration), duration);
    assert.equal(clampClipPosition(duration / 2, duration), duration / 2);
    assert.equal(clampClipPosition(NaN, duration), 0);
  }
  assert.equal(clampClipPosition(10, 0), 0);
});

test('empty and repeated guesses do not cost attempts; recent songs are avoided', () => {
  const empty = initial();
  assert.equal(makeAttempt(empty, ''), empty);
  const wrong = makeAttempt(empty, 'Wrong Song');
  assert.equal(makeAttempt(wrong, 'wrong-song'), wrong);
  assert.equal(pickSong([], []), null);
  const pool = songs.slice(0, 3);
  assert.equal(pickSong(pool, [pool[0].id], () => 0)?.id, pool[1].id);
  assert.notEqual(pickSong(pool, pool.map((s) => s.id), () => .99)?.id, pool[2].id);
});


const byId = (id: string) => {
  const found = songs.find((item) => item.id === id);
  assert.ok(found, `catalogue contains ${id}`);
  return found;
};
const indexes = Object.fromEntries((['titles', 'events', 'characters'] as const).map((mode) => [mode, buildAnswerIndex(songs, mode)])) as Record<AnswerMode, ReturnType<typeof buildAnswerIndex>>;
const judge = (id: string, answer: string, mode: AnswerMode = 'characters') => judgeAnswer(indexes[mode], byId(id), answer);

const selection = getMusicSelectionCatalogue(songs);
const selectionDate = '2026-09-07';

test('every recording is selectable and CN filtering follows confirmed Global releases', () => {
  const groups = new Set(selection.groups.map((group) => group.id));
  for (const song of selection.songs) assert.ok(song.groupIds?.length && song.groupIds.every((id) => groups.has(id)), song.id);
  assert.equal(selectMusic(selection.songs, selection.groups, { ...DEFAULT_MUSIC_SETTINGS, includeCn: true }, selectionDate).length, songs.filter((song) => !isInstrumentalVersion(song)).length);
  const global = selectMusic(selection.songs, selection.groups, DEFAULT_MUSIC_SETTINGS, selectionDate);
  assert.ok(global.length > 700 && global.length < selection.songs.length);
  assert.ok(global.every((song) => !song.connections || song.connections.every((connection) => isGlobalGroup(selection.groups.find((g) => g.id === connectionGroupId(connection))!, selectionDate))));
  const people = selection.groups.find((group) => group.name === 'People, A People')!;
  assert.equal(isGlobalGroup(people, '2026-09-15'), false);
  assert.equal(isGlobalGroup(people, '2026-09-16'), true);
  assert.equal(isGlobalGroup(selection.groups.find((group) => group.name === 'Crossing')!, selectionDate), true);
  assert.equal(isGlobalGroup(selection.groups.find((group) => group.id === 'story:17')!, selectionDate), false);
  assert.ok(gzipSync(JSON.stringify(selection)).length < 65000, 'group metadata must stay small alongside the catalogue');
});

test('calendar parsing rejects estimates, unknown and invalid dates, and handles event prefixes and reruns', () => {
  assert.equal(eventKey('[Intermezzo – Celebration] Lone Trail'), eventKey('Lone Trail'));
  assert.equal(eventKey('[Rerun] IL Siracusano Rerun'), eventKey('Il Siracusano'));
  assert.equal(confirmedRelease({ name: 'Example', global: { dateRange: '2026/8/13–2026/8/20' } }), '2026-08-13');
  for (const note of ['ESTIMATED Global date, not officially confirmed', 'predicted', 'unconfirmed']) {
    assert.equal(confirmedRelease({ name: 'Example', global: { dateRange: '2020/01/01–2020/02/01', note } }), null);
  }
  for (const dateRange of ['To be confirmed', '2026/02/31–2026/03/10', '']) assert.equal(confirmedRelease({ name: 'Example', global: { dateRange } }), null);
});

test('custom selections allow an EP alone and keep disabled event connections out of reused songs', () => {
  const ep = selection.groups.find((group) => group.name === 'Hellagur EP')!;
  const onlyEp = { ...DEFAULT_MUSIC_SETTINGS, excluded: selection.groups.filter((group) => group.id !== ep.id).map((group) => group.id) };
  const hellagur = selectMusic(selection.songs, selection.groups, onlyEp, selectionDate);
  assert.deepEqual(hellagur.map((song) => song.id).sort(), ['514572']);
  assert.equal(judgeAnswer(buildAnswerIndex(hellagur, 'characters'), hellagur.find((song) => song.id === '514572')!, 'Hellagur EP'), 'correct');
  const loneTrail = selection.groups.find((group) => group.name === 'Lone Trail')!;
  const isolated = selectMusic(selection.songs, selection.groups, { ...DEFAULT_MUSIC_SETTINGS, excluded: selection.groups.filter((group) => group.id !== loneTrail.id).map((group) => group.id) }, selectionDate);
  const shared = isolated.find((song) => song.connections?.some((connection) => connection.names[0] === 'Lone Trail') && songs.find((original) => original.id === song.id)!.connections!.some((connection) => connection.names[0] === "Dorothy's Vision"));
  assert.ok(shared, 'reused track remains playable via its selected event');
  assert.ok(shared.connections?.every((connection) => connection.names[0] === 'Lone Trail'));
  assert.equal(searchAnswers(buildAnswerIndex(isolated, 'characters'), 'Dorothy').length, 0);
  assert.equal(selectMusic(selection.songs, selection.groups, { ...onlyEp, excluded: selection.groups.map((group) => group.id) }, selectionDate).length, 0, 'empty selection stays empty');
});

test('CN on/off preserves individual exclusions and never leaks hidden connections', () => {
  const cn = selection.groups.filter((group) => !isGlobalGroup(group, selectionDate));
  const settings = { ...DEFAULT_MUSIC_SETTINGS, excluded: [cn[0].id] };
  const enabled = selectMusic(selection.songs, selection.groups, { ...settings, includeCn: true }, selectionDate);
  assert.ok(enabled.every((song) => !song.connections?.some((connection) => connectionGroupId(connection) === cn[0].id)));
  const disabled = selectMusic(selection.songs, selection.groups, settings, selectionDate);
  const index = buildAnswerIndex(disabled, 'characters');
  assert.equal(searchAnswers(index, 'Critical Phase Transition').length, 0);
  assert.equal(searchAnswers(index, 'People A People').length, 0);
  assert.deepEqual(settings.excluded, [cn[0].id]);
  assert.deepEqual(selectMusic(selection.songs, selection.groups, { ...settings, includeCn: true }, selectionDate), enabled);
  const epInCnEvent = [{ ...song, inGame: true, groupIds: ['events:cn', 'eps:test'], ep: { characters: ['Test'] }, connections: [{ names: ['CN'], characters: [], role: 'story' as const }] }];
  const groups = [{ id: 'events:cn', name: 'CN', kind: 'events' as const, globalRelease: null }, { id: 'eps:test', name: 'Test EP', kind: 'eps' as const }];
  const library = selectMusic(epInCnEvent, groups, DEFAULT_MUSIC_SETTINGS, selectionDate);
  assert.equal(library.length, 1, 'EPs can be selected independently without exposing a CN event');
  assert.equal(library[0].connections, undefined, 'the CN-only event association stays hidden');
});

test('saved selections validate settings and discard stale or malformed IDs', () => {
  const id = selection.groups[0].id;
  assert.deepEqual(readMusicSettings(JSON.stringify({ mode: 'events', pool: 'library', includeCn: true, excluded: [id, id, 'missing', null, 123] }), selection.groups), { mode: 'all', startPosition: 'beginning', includeCn: true, excluded: [id] });
  for (const value of [null, '{bad json', 'null', '42']) assert.deepEqual(readMusicSettings(value, selection.groups), DEFAULT_MUSIC_SETTINGS);
  assert.deepEqual(readMusicSettings('{"mode":"expert","pool":"bad","includeCn":"true","excluded":{}}', selection.groups), DEFAULT_MUSIC_SETTINGS);
});

test('character EP answers distinguish the original and instrumental without depending on capitalization', () => {
  for (const answer of ['Hellagur EP', 'hellagur ep', 'HELLAGUR E.P.']) {
    assert.equal(judge('514572', answer), 'correct');
    assert.equal(judge('232290', answer), 'incorrect');
  }
  for (const answer of ['hellagur ep instrumental', 'Hellagur EP (Instrumental)', 'HELLAGUR INSTRUMENTAL EP']) {
    assert.equal(judge('232290', answer), 'correct');
    assert.equal(judge('514572', answer), 'incorrect');
  }
  for (const mode of ['titles', 'events'] as const) {
    assert.equal(judge('514572', 'Hellagur EP', mode), 'incorrect');
    assert.equal(judge('232290', 'Hellagur EP instrumental', mode), 'incorrect');
  }
  assert.equal(judge('514572', 'Hellagur'), 'incorrect', 'EP is part of the answer');
  const round: Round = { song: byId('232290'), attempts: [], clipIndex: 0, status: 'playing' };
  const wrong = makeAttempt(round, 'Hellagur EP', indexes.characters);
  assert.equal(wrong.status, 'playing');
  assert.equal(wrong.attempts.length, 1);
  assert.equal(makeAttempt(wrong, 'hellagur ep instrumental', indexes.characters).status, 'won');
});

test('EP projection covers explicit operator albums and preserves intro, instrumental and character identities', () => {
  const expected = new Set(albums.filter((album) => album.albumCategory.includes('Operator EP')).flatMap((album) => album.songs.map((song) => song.songId)));
  assert.deepEqual(new Set(songs.filter((song) => song.ep).map((song) => song.id)), expected);
  for (const song of songs.filter((song) => song.ep)) {
    for (const character of song.ep!.characters) {
      assert.equal(judge(song.id, `${character} EP${song.ep!.variant ? ` ${song.ep!.variant}` : ''}`), 'correct', song.id);
    }
  }
  assert.equal(judge('048794', 'Nymph EP'), 'correct');
  assert.equal(judge('779487', 'Nymph EP instrumental'), 'correct', 'Instrument spelling in the source title is supported');
  assert.equal(judge('779487', 'Nymph EP'), 'incorrect', 'an incomplete translated title cannot erase the variant');
  assert.equal(judge('306813', 'Virtuosa EP intro'), 'correct');
  assert.equal(judge('306813', 'Virtuosa EP'), 'incorrect');
  assert.equal(judge('048705', 'Virtuosa EP'), 'correct');
  assert.equal(judge('880331', 'Arturia EP instrumental'), 'correct');
  assert.equal(judge('125053', 'Eblana EP'), 'correct');
  assert.equal(judge('514525', 'Necrass EP instrumental'), 'correct');
  assert.equal(judge('697641', 'Texas alter EP'), 'correct');
  assert.equal(judge('461172', 'Texas alter EP instrumental'), 'correct');
  assert.equal(judge('697641', 'Texas EP'), 'incorrect', 'base operator and alter stay distinct');
  assert.equal(judge('514563', 'Texas alter EP'), 'incorrect', 'event boss music is not an operator EP');
});

test('EP autocomplete displays the variant without disclosing the track title', () => {
  const suggestions = searchAnswers(indexes.characters, 'hellagur ep');
  assert.deepEqual(suggestions.map((item) => item.label), ['Hellagur EP', 'Hellagur EP instrumental']);
  assert.ok(suggestions.every((item) => item.kind === 'connection' && item.detail === 'Character EP'));
  assert.equal(searchAnswers(indexes.events, 'hellagur ep').length, 0);
  assert.equal(searchAnswers(indexes.titles, 'hellagur ep').length, 0);
});

test('in-game pool uses reviewed recordings rather than album tags; original library stays available', () => {
  const reviewed = getReviewedAssociations();
  const ingame = selectMusicPool(songs, 'ingame');
  assert.equal(ingame.length, songs.filter((song) => reviewed.has(song.id)).length);
  assert.ok(ingame.length >= 343);
  assert.equal(selectMusicPool(songs, 'library').length, songs.length);
  const originalIds = new Set(albums.flatMap((album) => album.songs.filter((song) => /^\d+$/.test(song.songId) && song.songName.trim()).map((song) => song.songId)));
  assert.deepEqual(new Set(songs.map((song) => song.id)), originalIds, 'preserve full library eligibility');
  for (const [id, metadata] of reviewed) {
    assert.ok(albums.some((album) => album.songs.some((song) => song.songId === id)), `reviewed ID ${id} exists in source data`);
    const choice = songs.find((song) => song.id === id);
    if (choice) assert.ok(choice.inGame);
    assert.ok(metadata.connections.length);
  }
  for (const event of [...EVENT_MUSIC, ...MAIN_STORY_MUSIC, ...EVENT_EXPANSION]) assert.equal(new Set(event.tracks.map((track) => track.id)).size, event.tracks.length, `no duplicate tracks within ${event.names[0]}`);
  assert.equal(new Set(CC_MUSIC.map((cc) => `${cc.series}:${cc.number}`)).size, CC_MUSIC.length);
  for (const id of ['880355', '514578', '461191', '779491']) {
    assert.ok(!ingame.some((item) => item.id === id), 'unused acoustic/instrumental/PV tracks stay out');
    assert.equal(songs.some((item) => item.id === id), originalIds.has(id), 'preserve full-library eligibility for excluded recordings');
  }
});

test('titles in both languages and legacy track names work in every mode', () => {
  for (const song of songs) {
    for (const title of [song.title, song.altTitle, ...(song.titleAliases || [])].filter((value): value is string => Boolean(value))) {
      for (const mode of ['titles', 'events', 'characters'] as const) assert.equal(judgeAnswer(indexes[mode], song, title), 'correct');
    }
  }
  assert.equal(judge('514563', 'Wlfmster', 'titles'), 'correct');
  assert.equal(judge('514563', 'Il Siracusano boss', 'titles'), 'incorrect');
  assert.equal(judge('306830', 'Necrass boss theme', 'titles'), 'incorrect');
});

test('event mode accepts event and role or stage, but not character shortcuts', () => {
  for (const answer of ['Il Siracusano boss', 'IL SIRACUSANO BOSS THEME!', 'Il Siracusano boss battle music', 'IS-10', 'Il Siracusano stage IS EX 8']) assert.equal(judge('514563', answer, 'events'), 'correct');
  assert.equal(judge('880356', 'Il Siracusano stage theme', 'events'), 'correct');
  assert.equal(judge('880337', 'Lone Trail boss', 'events'), 'correct');
  assert.equal(judge('306830', 'What the Firelight Casts FC-8', 'events'), 'correct');
  assert.equal(judge('514563', 'Texas alter event boss theme', 'events'), 'incorrect');
  assert.equal(judge('306830', 'Eblana boss theme', 'events'), 'incorrect');
  assert.equal(judge('514563', 'Il Siracusano lobby theme', 'events'), 'incorrect');
});

test('character mode accepts banner aliases and boss real names/codenames with alter forms kept distinct', () => {
  for (const answer of ['Texas alter event boss theme', 'Texas the Omertosa boss', 'Texalter boss battle', 'Lavinia boss theme', 'Penance boss theme']) assert.equal(judge('514563', answer), 'correct');
  for (const answer of ['Eblana boss FC-8', 'Necrass boss FC-8', 'Eblana Dublinn boss FC-8', 'Loughshinny boss theme', 'Reed alter event boss theme']) assert.equal(judge('306830', answer), 'correct');
  assert.equal(judge('880337', 'Kristen Wright boss theme'), 'correct');
  assert.equal(judge('880337', 'Muelsyse event boss theme'), 'correct');
  assert.equal(judge('514563', 'Texas boss theme'), 'incorrect');
  assert.equal(judge('880351', 'Eblana lobby theme'), 'incorrect', 'boss aliases do not spread to an entire event');
  assert.equal(judge('306830', 'Necrass boss theme instrumental'), 'incorrect');
});

test('CC operation names and numbered shortcuts obey mode and series boundaries', () => {
  for (const answer of ['Contingency Contract Wild Scales Theme', 'CC Wild Scales Theme', 'Wild Scales theme']) assert.equal(judge('953919', answer, 'events'), 'correct');
  assert.equal(judge('461196', 'CC3 lobby theme'), 'correct');
  assert.equal(judge('461196', 'CC3 theme'), 'ambiguous');
  assert.equal(judge('461196', 'CC 3 theme', 'events'), 'incorrect');
  assert.equal(judge('306847', 'CC9 lobby theme'), 'correct');
  assert.equal(judge('232296', 'Contingency Contract 9 battle theme'), 'correct');
  for (const answer of ['CCB Pyrolysis lobby theme', 'Contingency Contract Battleplan Pyrolysis lobby theme']) assert.equal(judge('048704', answer, 'events'), 'correct');
  for (const answer of ['CCB1 lobby theme', 'CCB #1 lobby theme', 'Contingency Contract Battleplan 1 lobby theme']) assert.equal(judge('048704', answer), 'correct');
  for (const answer of ['CC1 lobby theme', 'CC Pyrolysis lobby theme', 'Pyrolysis lobby theme']) assert.equal(judge('048704', answer), 'incorrect');
  assert.equal(judge('048747', 'CCB1 lobby theme'), 'incorrect');
  assert.equal(judge('048704', 'CCB1 lobby theme', 'events'), 'incorrect');
  assert.equal(judge('048747', 'CC11 lobby theme'), 'incorrect');
});

test('ambiguous contexts never cost an attempt or depend on the hidden answer; versions resolve them', () => {
  for (const id of ['048708', '306816', '514563']) {
    assert.equal(judge(id, 'So Long Adele lobby theme'), 'ambiguous');
    const round: Round = { song: byId(id), attempts: [], clipIndex: 0, status: 'playing' };
    assert.equal(makeAttempt(round, 'So Long Adele lobby theme', indexes.characters), round);
  }
  assert.equal(judge('306847', 'CC9 theme'), 'ambiguous');
  assert.equal(judge('048708', 'So Long Adele day lobby theme'), 'correct');
  assert.equal(judge('306816', 'So Long Adele lobby theme (night)'), 'correct');
  assert.equal(judge('048708', 'Adele night lobby theme'), 'incorrect');
  assert.equal(judge('953981', 'So Long Adele stage SL-1'), 'correct');
  assert.equal(judge('306815', 'So Long Adele stage theme'), 'ambiguous');
  assert.equal(judge('232253', 'CCB2 battle theme'), 'ambiguous');
  assert.equal(judge('232253', 'CCB2 battle 1 theme'), 'correct');
  assert.equal(judge('880325', 'CCB2 battle 2 theme'), 'correct');
});

test('connection autocomplete submits connections without disclosing their track titles', () => {
  const suggestions = searchAnswers(indexes.characters, 'texas alter event boss');
  assert.ok(suggestions.length);
  assert.ok(suggestions.every((item) => item.kind === 'connection' && !item.label.includes('Signore')));
  assert.ok(suggestions.some((item) => judge('514563', item.value) === 'correct'));
  assert.ok(searchAnswers(indexes.characters, 'Necrass boss').length);
  assert.equal(searchAnswers(indexes.events, 'Necrass boss').length, 0);
  const misty = searchAnswers(indexes.characters, 'So Long Adele lobby');
  assert.ok(misty.some((item) => item.label.includes('(day)')));
  assert.ok(misty.some((item) => item.label.includes('(night)')));
  assert.ok(searchAnswers(indexes.titles, 'Wlfmster').length);
});

test('contextual wins count guesses independently of window selection', () => {
  const round: Round = { song: byId('514563'), attempts: [], clipIndex: 0, status: 'playing' };
  const wrong = makeAttempt(round, 'Reed alter boss theme', indexes.characters);
  assert.equal(wrong.status, 'playing'); assert.equal(wrong.attempts.length, 1);
  assert.equal(makeAttempt(wrong, 'Reed alter event boss music!', indexes.characters), wrong);
  const won = makeAttempt(wrong, 'Texas alter event boss theme', indexes.characters);
  assert.equal(won.status, 'won'); assert.equal(clipStage(won), 0);
  assert.equal(won.attempts.length, 2);
  assert.equal(makeAttempt(won, null, indexes.characters), won);
});


test('expanded event recordings accept reviewed stages, banner identities, and boss aliases', () => {
  for (const [id, answer] of [
    ['953908', 'Degenbrecher boss BI-8'], ['953908', 'Gnosis event boss'],
    ['125083', 'Fiammetta boss theme'], ['125083', 'Andoain boss'],
    ['048739', 'Kreide boss phase 1'], ['953902', 'Dorothy boss theme'],
    ['306838', 'Pancho boss theme'], ['461174', 'Gavial alter event boss theme'],
    ['880350', 'Dusk boss theme'], ['306839', 'Ling event boss theme'],
    ['880346', 'Anthony Simon boss theme'], ['880346', 'Mountain event boss theme'],
    ['461169', 'Blemishine boss theme'], ['461185', 'Quintus boss theme'],
    ['048711', "Emperor's Blade boss theme"], ['697620', 'Mudrock boss theme'],
    ['953985', 'Lisa lobby theme'], ['514541', 'Clement Dubois boss theme'],
    ['514541', 'The Gardener boss theme'], ['514541', 'Federico Giallo boss theme'],
  ]) assert.equal(judge(id, answer), 'correct', answer);
  assert.equal(judge('306834', 'Break the Ice battle theme'), 'ambiguous');
  assert.equal(judge('048727', 'BI-5', 'events'), 'correct');
  assert.equal(judge('697644', 'Dossoles Holiday battle 1 theme', 'events'), 'correct');
  assert.equal(judge('953908', 'Gnosis event boss', 'events'), 'incorrect');
  assert.equal(judge('514541', 'Dublinn boss theme'), 'incorrect');
});

test('reused music retains every event and CC connection, without duplicate songs in the draw', () => {
  const reused = byId('048721');
  assert.equal(reused.connections?.length, 2);
  for (const answer of ["Dorothy's Vision battle", 'DV-1', 'Lone Trail CW-1', 'CW-6']) assert.equal(judge(reused.id, answer, 'events'), 'correct');
  assert.equal(judge(reused.id, 'Lone Trail battle', 'events'), 'ambiguous');
  for (const [id, stage, number] of [['461160', 'DM-1', '1'], ['880347', 'DM-MO-1', '2']]) {
    assert.equal(byId(id).connections?.length, 2);
    assert.equal(judge(id, stage, 'events'), 'correct');
    assert.equal(judge(id, `CC3 battle ${number} theme`), 'correct');
    assert.equal(songs.filter((song) => song.id === id).length, 1);
  }
  assert.equal(judge('461160', 'Kazdel', 'titles'), 'correct');
});

test('coverage lists are derived from playable songs and stay current as the selection expands', () => {
  const coverage = getMusicCoverage(songs);
  assert.equal(coverage.events.length, 51);
  assert.equal(coverage.chapters.length, 14);
  assert.equal(coverage.contracts.length, 16);
  assert.ok(coverage.events.includes('Mansfield Break'));
  assert.equal(coverage.vignettes.length, 14);
  assert.ok(coverage.contracts.includes('CCB4: Arclight'), 'MSR playback does not require a YouTube link');
  assert.deepEqual(getMusicCoverage([byId('048721')]).events, ["Dorothy's Vision", 'Lone Trail']);
  assert.deepEqual(getMusicCoverage([]), { events: [], vignettes: [], chapters: [], contracts: [] });
});


test('main-story chapters accept chapter names, numbered aliases, stage codes and boss-stage descriptions', () => {
  for (const answer of ['7-18', 'stage 7 18', 'Chapter 7 boss normal', 'Chapter 07 boss normal', 'Episode 7 boss normal', 'Ch7 boss normal', 'Ep07 boss normal', 'The Birth of Tragedy boss normal', '苦难摇篮 boss normal']) {
    assert.equal(judge('048732', answer, 'events'), 'correct', answer);
    assert.equal(judge('048732', answer, 'titles'), 'incorrect', answer);
  }
  for (const answer of ['Patriot boss 7-18', 'Patriot boss stage 7-18', 'Patriot normal boss theme', "Buldrokkas'tee boss 7-18"]) {
    assert.equal(judge('048732', answer), 'correct', answer);
    assert.equal(judge('048732', answer, 'events'), 'incorrect', answer);
  }
  assert.equal(judge('461180', 'Patriot boss H7-4'), 'correct');
  assert.equal(judge('461180', 'Patriot hell boss theme'), 'correct');
  assert.equal(judge('048732', 'Patriot boss H7-4'), 'incorrect');
  assert.equal(judge('048732', 'Chapter 17 boss normal', 'events'), 'incorrect');
  assert.equal(judge('048732', 'Непоколебимость', 'titles'), 'correct');
  for (const [id, answer] of [
    ['514585', 'FrostNova boss 4-10'], ['306854', 'Yelena boss 6-16'],
    ['232208', 'FrostNova hell boss'], ['306848', 'Mephisto boss active'],
    ['125014', 'Mephisto dormant boss'], ['048731', 'Talulah boss phase 2'],
    ['514554', 'Mandragora boss stage'], ['514553', 'Manfred boss normal'],
    ['306825', 'Manfred boss hell'], ['232279', 'Last Steam Knight boss'],
    ['779406', 'Damazti Cluster boss'], ['048773', "Duq'arael boss"],
    ['779489', 'Kindling Revenant boss'], ['461147', 'Theresa boss 14-21'],
  ]) assert.equal(judge(id, answer), 'correct', answer);
});

test('bosses with multiple tracks prompt for detail without consuming an attempt', () => {
  for (const id of ['048732', '461180', '514563']) {
    for (const answer of ['Patriot boss', 'Patriot boss stage', 'Chapter 7 boss']) {
      assert.equal(judge(id, answer), 'ambiguous', answer);
      const round: Round = {song: byId(id), attempts: [], clipIndex: 0, status: 'playing'};
      assert.equal(makeAttempt(round, answer, indexes.characters), round);
    }
  }
  assert.equal(judge('048731', 'JT8-3', 'events'), 'ambiguous');
  assert.equal(judge('048731', 'Talulah boss phase 2'), 'correct');
  assert.equal(judge('953908', 'Degenbrecher boss'), 'ambiguous');
  assert.equal(judge('953908', 'Degenbrecher boss BI-8'), 'correct');
  assert.equal(judge('461143', 'Degenbrecher boss RS-8'), 'correct');
  const suggestions = searchAnswers(indexes.characters, 'Patriot boss');
  assert.ok(suggestions.some((item) => judge('048732', item.value) === 'correct'));
  assert.ok(suggestions.some((item) => judge('461180', item.value) === 'correct'));
  assert.ok(suggestions.every((item) => item.kind === 'connection' && !item.label.includes('Steadfastness')));
});

test('additional event tracks accept event, banner and boss connections without admitting unused arrangements', () => {
  for (const [id, answer] of [
    ['048729', 'Blood Knight boss'], ['048729', 'Margaret Nearl boss'],
    ['953915', 'Endspeaker boss'], ['953915', 'Laurentina boss'],
    ['048710', 'Chongyue boss'], ['880377', 'Zumama boss'],
    ['880332', 'Jessica alter boss'], ['461143', 'Harold Craigavon boss'],
    ['514547', 'Arturia Giallo lobby'], ['697623', 'Witch King boss phase 1'],
    ['779495', 'Witch King boss imperial'], ['461151', 'Witch King boss variation'],
    ['697614', 'Amiya boss BB-10'], ['953970', 'Ela lobby'],
    ['232254', 'Captain Mateo boss'], ['306855', 'Essence of Evolution boss'],
    ['048749', 'Rat King boss'], ['461192', 'Heart of Surging Flame lobby Alive Until Sunset'],
  ]) assert.equal(judge(id, answer), 'correct', answer);
  assert.equal(judge('953915', 'SN-10', 'events'), 'correct');
  assert.equal(judge('697614', 'BB-10', 'events'), 'ambiguous');
  assert.equal(judge('697614', 'Babel boss BB-10', 'events'), 'correct');
  assert.equal(judge('048749', 'Code of Brawl boss', 'events'), 'correct');
  assert.equal(judge('048749', 'Lin Kojui boss', 'events'), 'incorrect');
  assert.equal(judge('232254', 'Dolly boss'), 'incorrect');
  assert.equal(judge('880377', 'ALIVE', 'titles'), 'incorrect');
  assert.ok(!byId('306852').inGame, 'vocal ALIVE remains separate from the instrumental boss recording');
});

test('reused main-story tracks retain all chapters and do not inflate the draw or event coverage', () => {
  assert.equal(judge('953998', '10-2', 'events'), 'correct');
  assert.equal(judge('953998', '13-5', 'events'), 'correct');
  assert.equal(judge('306826', '10-4', 'events'), 'correct');
  assert.equal(judge('306826', '13-2', 'events'), 'correct');
  assert.equal(songs.filter((song) => song.id === '953998').length, 1);
  const coverage = getMusicCoverage([byId('953998')]);
  assert.deepEqual(coverage.events, []);
  assert.deepEqual(coverage.chapters, ['Episode 10: Shatterpoint', 'Episode 13: The Whirlpool that is Passion']);
});


test('middle excerpts stay in the middle while random excerpts cover every safe start', () => {
  assert.equal(randomClipStart(180, 0, 'middle'), 45);
  assert.equal(randomClipStart(180, 1, 'middle'), 135);
  assert.equal(randomClipStart(180, 0.5, 'middle'), 90);
  assert.equal(randomClipStart(180, 0), 0);
  assert.equal(randomClipStart(180, 1), 150);
  assert.equal(randomClipStart(180, 0.5), 75);
  for (const mode of ['middle', 'random'] as const) {
    for (const duration of [31, 40, 60, 90, 180, 600]) for (const point of [0, 0.3, 0.99, 1]) {
      const start = randomClipStart(duration, point, mode);
      assert.ok(start >= 0 && start + 30 <= duration);
      assert.equal(randomClipStart(duration, point, mode), start, 'replays and windows share the round point');
    }
    for (const duration of [0, 10, 30, NaN, Infinity]) assert.equal(randomClipStart(duration, 0.5, mode), 0);
  }
  assert.equal(randomClipStart(180, -1), 0);
  assert.equal(randomClipStart(180, 2), 150);
  assert.equal(randomClipStart(180, NaN), 0);
});

test('start position persists and old or invalid settings keep the beginning default', () => {
  for (const mode of ['beginning', 'middle', 'random']) assert.equal(readMusicSettings(JSON.stringify({ startPosition: mode }), []).startPosition, mode);
  for (const value of ['{}', '{"startPosition":"bad"}', '{"startPosition":true}']) {
    assert.equal(readMusicSettings(value, []).startPosition, 'beginning');
  }
});

test('random-mode cache requests streams without preparing an opening', async () => {
  const prepared: boolean[] = [];
  const cache = new SongClipCache(async (id, _signal, prepareOpening = true) => {
    prepared.push(prepareOpening);
    return { url: id, buffer: null };
  }, false);
  await cache.load('current'); await cache.load('upcoming'); await cache.load('current');
  assert.deepEqual(prepared, [false, false]);
  cache.clear();
});


test('old music pool settings no longer limit selection while individual exclusions survive', () => {
  const excluded = selection.groups.find((group) => group.kind === 'eps')!.id;
  const settings = readMusicSettings(JSON.stringify({ pool: 'ingame', excluded: [excluded], startPosition: 'random' }), selection.groups);
  assert.deepEqual(settings.excluded, [excluded]);
  assert.equal(settings.startPosition, 'random');
  assert.ok(!('pool' in settings));
  const selected = selectMusic(selection.songs, selection.groups, settings, selectionDate);
  assert.ok(selected.some((song) => song.ep), 'character EPs are available without a pool switch');
  assert.ok(selected.every((song) => !song.groupIds?.includes(excluded)), 'an excluded EP remains excluded');
  assert.deepEqual(selectMusic(selection.songs, selection.groups, readMusicSettings(JSON.stringify({ pool: 'library', excluded: [excluded], startPosition: 'random' }), selection.groups), selectionDate), selected);
});


test('saved answer modes always migrate to all answers', () => {
  for (const mode of ['titles', 'events', 'characters', 'all']) {
    const saved = readMusicSettings(JSON.stringify({ mode, startPosition: 'random', includeCn: true }), selection.groups);
    assert.equal(saved.mode, 'all');
    assert.equal(saved.startPosition, 'random');
    assert.equal(saved.includeCn, true);
  }
});


test('quiz excludes instrumental versions from draws, counts and answer suggestions', () => {
  for (const id of ['232290', '779487', '880377', '125020']) {
    assert.ok(isInstrumentalVersion(byId(id)), id);
    assert.ok(!selection.songs.some((song) => song.id === id), id);
  }
  for (const id of ['514572', '306830']) assert.ok(selection.songs.some((song) => song.id === id), 'original songs and ordinary BGM remain playable');
  assert.ok(selection.songs.every((song) => !isInstrumentalVersion(song)));
  const index = buildAnswerIndex(selection.songs, 'characters');
  assert.deepEqual(searchAnswers(index, 'hellagur ep').map((answer) => answer.label), ['Hellagur EP']);
  assert.deepEqual(searchAnswers(index, 'hellagur ep instrumental'), []);
  for (const title of ['Song (Instrumental)', 'Song（instrumental）', 'Song (Instrument)']) assert.ok(isInstrumentalVersion({ ...song, title }));
  assert.equal(isInstrumentalVersion({ ...song, title: 'Battle Theme' }), false);
});


test('all answers accept shared event and character names, roles, stages and individual artist credits', () => {
  const index = buildAnswerIndex(selection.songs, 'all');
  for (const [id, answers] of [
    ['514572', ['Hellagur', 'Hellagur EP']],
    ['514563', ['Texas alter', 'Il Siracusano', 'Texas alter boss theme']],
    ['048708', ['So Long Adele', 'So Long Adele lobby theme']],
    ['306816', ['So Long Adele', 'So Long Adele lobby theme']],
    ['461196', ['CC3']],
    ['048731', ['JT8-3']],
  ] as const) {
    for (const answer of answers) {
      assert.equal(judgeAnswer(index, byId(id), answer), 'correct', answer);
      assert.equal(makeAttempt({ song: byId(id), attempts: [], clipIndex: 0, status: 'playing' }, answer, index).status, 'won');
    }
  }
  for (const track of selection.songs) {
    for (const artist of track.artists || []) assert.equal(judgeAnswer(index, track, artist), 'correct', `${track.id}: ${artist}`);
  }
  assert.equal(judgeAnswer(index, byId('514572'), 'So Long Adele'), 'incorrect');
  assert.equal(judgeAnswer(index, byId('514572'), 'Not a credited musician'), 'incorrect');
  assert.equal(judgeAnswer(index, byId('514572'), ''), 'incorrect');
});

test('artist names come from individual artist, composer and performer credits only', () => {
  for (const album of albums) for (const track of album.songs) {
    const choice = songs.find((item) => item.id === track.songId);
    if (!choice) continue;
    const expected = [...new Set((track.credits || []).filter((credit) => ['artist', 'composer', 'performer'].includes(credit.role)).flatMap((credit) => credit.names.flatMap(creditArtistNames)))];
    assert.deepEqual(choice.artists || [], expected);
  }
});

test('all answers resolve title/event/artist collisions by any valid association', () => {
  const a = { ...song, altTitle: null, id: 'a', title: 'Echo', artists: ['A Singer'] };
  const b = { ...song, id: 'b', title: 'Another', artists: ['Echo'], connections: [{ names: ['Echo'], characters: ['Hero'], role: 'boss' as const }] };
  const c = { ...song, id: 'c', title: 'Unrelated' };
  const index = buildAnswerIndex([a, b, c], 'all');
  assert.equal(judgeAnswer(index, a, 'Echo'), 'correct');
  assert.equal(judgeAnswer(index, b, 'Echo'), 'correct');
  assert.equal(judgeAnswer(index, c, 'Echo'), 'incorrect');
  assert.equal(judgeAnswer(index, a, 'A SINGER!'), 'correct');
  assert.equal(judgeAnswer(index, b, 'Hero'), 'correct');
});

test('suggestions rank exact, prefix and partial matches, then title, character, event and artist', () => {
  const index = buildAnswerIndex([
    { ...song, altTitle: null, id: 'a', title: 'Echo', artists: ['Echo'], connections: [{ names: ['Echo'], characters: ['Echo'], role: 'boss' as const }] },
    { ...song, altTitle: null, id: 'b', title: 'Echoes' },
    { ...song, altTitle: null, id: 'c', title: 'An Echo' },
    { ...song, id: 'd', title: 'Something', artists: ['Ec'] },
  ], 'all');
  const results = searchAnswers(index, 'echo');
  assert.deepEqual(results.slice(0, 4).map((item) => item.kind), ['title', 'character', 'event', 'artist']);
  assert.ok(results.findIndex((item) => item.label === 'Echoes') < results.findIndex((item) => item.label === 'An Echo'));
  assert.equal(searchAnswers(index, 'ec')[0].kind, 'artist', 'an exact artist outranks partial titles');
  assert.deepEqual(searchAnswers(index, '!!!'), []);
  assert.deepEqual(searchAnswers(index, 'missing name'), []);
});


test('all-answer suggestions still respect disabled and CN-only connections', () => {
  const selected = selectMusic(selection.songs, selection.groups, DEFAULT_MUSIC_SETTINGS, selectionDate);
  const index = buildAnswerIndex(selected, 'all');
  assert.equal(searchAnswers(index, 'Critical Phase Transition').length, 0);
  assert.equal(searchAnswers(index, 'People A People').length, 0);
  const loneTrail = selection.groups.find((group) => group.name === 'Lone Trail')!;
  const isolated = selectMusic(selection.songs, selection.groups, { ...DEFAULT_MUSIC_SETTINGS, excluded: selection.groups.filter((group) => group.id !== loneTrail.id).map((group) => group.id) }, selectionDate);
  assert.equal(searchAnswers(buildAnswerIndex(isolated, 'all'), 'Dorothy').length, 0);
});


test('artist guesses preserve name words when checking repeated attempts', () => {
  const current = { ...song, id: 'current', artists: ['DJ'] };
  const other = { ...song, id: 'other', artists: ['DJ Theme'] };
  const index = buildAnswerIndex([current, other], 'all');
  const wrong = makeAttempt({ song: current, attempts: [], clipIndex: 0, status: 'playing' }, 'DJ Theme', index);
  assert.equal(wrong.status, 'playing');
  const won = makeAttempt(wrong, 'DJ', index);
  assert.equal(won.status, 'won');
  assert.equal(won.attempts.length, 2);
});


test('credit annotations do not become required answer text or standalone artist answers', () => {
  assert.deepEqual(creditArtistNames('Todd Strange (chorus)'), ['Todd Strange']);
  assert.deepEqual(creditArtistNames('James Robert Hayden (credited as "James Hayden")'), ['James Robert Hayden', 'James Hayden']);
  assert.deepEqual(creditArtistNames('Zhang Qiandan (credited as 十音)'), ['Zhang Qiandan', '十音']);
  assert.deepEqual(creditArtistNames('BLACK 0 / SKa2or'), ['BLACK 0', 'SKa2or']);
  assert.deepEqual(creditArtistNames('MYTH & ROID'), ['MYTH & ROID'], 'do not split a group name');
  const index = buildAnswerIndex(selection.songs, 'all');
  for (const answer of ['James Hayden', 'Todd Strange', 'Adam Gubman']) assert.equal(judgeAnswer(index, byId('514572'), answer), 'correct');
  assert.equal(judgeAnswer(index, byId('514572'), 'chorus'), 'incorrect');
});


test('every event-release draw accepts its event even without a reviewed in-game role', () => {
  for (const group of selection.groups.filter((item) => item.kind === 'events' || item.kind === 'mini')) {
    const selected = selectMusic(selection.songs, selection.groups, { ...DEFAULT_MUSIC_SETTINGS, includeCn: true, excluded: selection.groups.filter((item) => item.id !== group.id).map((item) => item.id) }, selectionDate);
    const index = buildAnswerIndex(selected, 'all');
    for (const track of selected) assert.equal(judgeAnswer(index, track, group.name), 'correct', `${group.name}: ${track.id}`);
  }
});

test('lyrics drop the credits block Monster Siren puts in the file, and only that', () => {
  // 59 of the published LRC files open with a credits block -- Chinese, English or
  // both -- so without this the player highlights an engineer's name for the first
  // forty seconds of a song. It is stripped at render time, never from the file:
  // the files stay byte-identical to what the label serves, which is what makes
  // scripts/sync/sync-lyrics.mjs able to verify them.
  const credits = `[00:01.33]音乐设计/监制: MSR Studio
[00:02.47]作曲 Composer: Yocke
[00:03.71]Vocals & Lyrics: Laura Intravia
[00:04.00]Presented by Monster Siren Records
[00:40.23]Clear morning light, your voice so sweet.
[00:45.00]We cry: "March on!"`;
  const parsed = parseLrc(credits);
  assert.deepEqual(parsed.map((line) => line.text),
    ['Clear morning light, your voice so sweet.', 'We cry: "March on!"']);

  // The leading-block restriction is load bearing: a sung line may carry a colon,
  // and a rule that swept the whole file would delete it.
  assert.deepEqual(parseLrc('[00:05.00]We cry: "March on!"\n[00:09.00]作曲 Composer: Yocke')
    .map((line) => line.text), ['We cry: "March on!"', '作曲 Composer: Yocke']);

  // Against the real catalogue: no file may be emptied, and every file must now
  // open on something that is not a credit.
  const emptied = [];
  for (const file of readdirSync('data/lyrics').filter((name) => name.endsWith('.lrc'))) {
    const text = readFileSync(`data/lyrics/${file}`, 'utf8');
    const timed = text.split(/\r?\n/).filter((line) => /^\[\d/.test(line) && line.replace(/\[[^\]]*\]/g, '').trim());
    if (timed.length && !parseLrc(text).length) emptied.push(file);
  }
  assert.deepEqual(emptied, []);
});
