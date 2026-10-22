import type { Page, Route } from '@playwright/test';

/*
 * Monster Siren as the music player meets it (lib/music/playbackEngine.ts), so its checks need no
 * network: the player's audio address (/api/music-audio/<cid>, a redirect to the signed file)
 * serves a few seconds of silence this file makes, in byte ranges as Monster Siren's CDN does
 * (and the song guesser's /api/music-guesser/<cid> names an address here that does the same).
 * `resolves` lists the songs whose file was loaded (a load asks from byte 0), `files` each
 * request for a file. The song's art and credits (/api/music-art/<cid>, lib/music/songArt.ts) answer that
 * Monster Siren says nothing more, so the player falls back as it would; `arts` lists those asked.
 * A check that wants art routes that address itself (its route, added later, is matched first).
 * `hangFiles` leaves every file request unanswered, a CDN that never sends a byte.
 * `links` lists the songs whose address was asked for ahead, by HEAD (lib/music/audioPreload.ts):
 * no file is loaded for those. Monster Siren's CDN (https://res01.hycdn.cn/...) serves the file
 * here too, and `cdn` lists the requests that reached it; signedHeads makes those HEADs read as
 * the real route's redirect to it.
 */

/** A mono 8 kHz 8-bit WAV of silence: about a quarter of a megabyte for 30 seconds. */
function silentWav(seconds: number): Buffer {
  const rate = 8000;
  const data = rate * seconds;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate, 28); header.writeUInt16LE(1, 32); header.writeUInt16LE(8, 34);
  header.write('data', 36); header.writeUInt32LE(data, 40);
  return Buffer.concat([header, Buffer.alloc(data, 0x80)]);
}
export const WAV_SECONDS = 30;
const WAV = silentWav(WAV_SECONDS);

export interface Siren {
  resolves: string[]; files: string[]; arts: string[]; refuseNextFile: boolean;
  /** Every file request is left unanswered: the CDN never sends a byte (what an iPhone met as a
   *  song that stayed silent at 0:00 while everything said it played). */
  hangFiles: boolean;
  /** Each file request answered this many milliseconds late: a phone's slow network. */
  delayFilesMs: number;
  /** Requests to the retired music relay: no playback or preload should use it. */
  relays: string[];
  links: string[];
  cdn: { method: string; url: string }[];
}

/**
 * The real route's redirect, as the upcoming song's HEAD meets it: a HEAD of /api/music-audio/<cid>
 * reads as having reached the signed address on Monster Siren's CDN that the route redirects to
 * (expiring three hours on). Playwright does not intercept the request a redirect it answered
 * leads to (that one went to the real CDN, 2026-10-22), so the stub answers the HEAD and only its
 * url is changed; a real browser follows the redirect and reads the same url (the CDN allows any
 * origin). Add before the page loads.
 */
export async function signedHeads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const response = await original(input, init);
      const song = /\/api\/music-audio\/(\d+)$/.exec(String(input));
      if (song && init?.method === 'HEAD') {
        const expiry = Math.floor(Date.now() / 1000 + 3 * 3600).toString(16).toUpperCase();
        Object.defineProperty(response, 'url', { value: `https://res01.hycdn.cn/${'5'.repeat(32)}/${expiry}/siren/audio/${song[1]}.wav` });
      }
      return response;
    };
  });
}

/** Monster Siren as the page meets it: the address route and the file it names. */
export async function stubMonsterSiren(page: Page): Promise<Siren> {
  const siren: Siren = { resolves: [], files: [], arts: [], refuseNextFile: false, hangFiles: false, delayFilesMs: 0, relays: [], links: [], cdn: [] };
  await page.route('**/api/music-art/**', (route) => {
    siren.arts.push(new URL(route.request().url()).pathname.split('/').pop()!);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cover: null, artists: [], albumName: null }) });
  });
  await page.route('**/api/music-guesser/**', (route) => {
    const cid = new URL(route.request().url()).pathname.split('/').pop()!;
    siren.resolves.push(cid);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: `http://127.0.0.1:3192/__siren/${cid}.wav?sig=${siren.resolves.length}` }) });
  });
  // The file, in byte ranges as Monster Siren's CDN serves it.
  const serve = async (route: Route) => {
    siren.files.push(route.request().url());
    if (siren.hangFiles) return new Promise<void>(() => { /* never answered */ });
    if (siren.delayFilesMs) await new Promise((done) => setTimeout(done, siren.delayFilesMs));
    if (siren.refuseNextFile) { siren.refuseNextFile = false; return route.fulfill({ status: 403, body: '' }); }
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? '');
    if (!range) return route.fulfill({ status: 200, contentType: 'audio/wav', body: WAV, headers: { 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' } });
    const from = Number(range[1]);
    const to = range[2] ? Math.min(Number(range[2]), WAV.length - 1) : WAV.length - 1;
    return route.fulfill({ status: 206, contentType: 'audio/wav', body: WAV.subarray(from, to + 1),
      headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${from}-${to}/${WAV.length}`, 'Access-Control-Allow-Origin': '*' } });
  };
  await page.route('**/__siren/**', serve);
  // A HEAD is answered with headers only, at once, as Monster Siren's CDN answers one.
  const headers = (route: Route) => route.fulfill({ status: 200, contentType: 'audio/wav',
    headers: { 'Accept-Ranges': 'bytes', 'Content-Length': String(WAV.length), 'Access-Control-Allow-Origin': '*' } });
  await page.route('https://res01.hycdn.cn/**', (route) => {
    siren.cdn.push({ method: route.request().method(), url: route.request().url() });
    return route.request().method() === 'HEAD' ? headers(route) : serve(route);
  });
  // The player's own address (pages/api/music-audio, a redirect to the signed file): answered
  // with the file itself. A load asks from the start; its later ranges are the same load's. A HEAD
  // is the upcoming song's address asked for ahead (signedHeads).
  await page.route('**/api/music-audio/**', (route) => {
    const cid = new URL(route.request().url()).pathname.split('/').pop()!;
    const head = route.request().method() === 'HEAD';
    const range = /bytes=(\d+)-/.exec(route.request().headers().range ?? '');
    if (head) siren.links.push(cid);
    else if (!range || range[1] === '0') siren.resolves.push(cid);
    return head ? headers(route) : serve(route);
  });
  // Trap obsolete relay requests instead of letting a regression hit a live server.
  await page.route('https://relay.arkpedia.net/msr/**', (route) => {
    const range = /bytes=(\d+)-/.exec(route.request().headers().range ?? '');
    if (!range || range[1] === '0') siren.relays.push(new URL(route.request().url()).pathname.split('/').pop()!);
    return route.fulfill({ status: 410, body: 'Music streams directly from the official CDN.' });
  });
  return siren;
}
