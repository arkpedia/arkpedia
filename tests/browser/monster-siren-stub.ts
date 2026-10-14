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
}

/** Monster Siren as the page meets it: the address route and the file it names. */
export async function stubMonsterSiren(page: Page): Promise<Siren> {
  const siren: Siren = { resolves: [], files: [], arts: [], refuseNextFile: false, hangFiles: false };
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
  const serve = (route: Route) => {
    siren.files.push(route.request().url());
    if (siren.hangFiles) return new Promise<void>(() => { /* never answered */ });
    if (siren.refuseNextFile) { siren.refuseNextFile = false; return route.fulfill({ status: 403, body: '' }); }
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? '');
    if (!range) return route.fulfill({ status: 200, contentType: 'audio/wav', body: WAV, headers: { 'Accept-Ranges': 'bytes' } });
    const from = Number(range[1]);
    const to = range[2] ? Math.min(Number(range[2]), WAV.length - 1) : WAV.length - 1;
    return route.fulfill({ status: 206, contentType: 'audio/wav', body: WAV.subarray(from, to + 1),
      headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${from}-${to}/${WAV.length}` } });
  };
  await page.route('**/__siren/**', serve);
  // The player's own address (pages/api/music-audio, a redirect to the signed file): answered
  // with the file itself. A load asks from the start; its later ranges are the same load's.
  await page.route('**/api/music-audio/**', (route) => {
    const range = /bytes=(\d+)-/.exec(route.request().headers().range ?? '');
    if (!range || range[1] === '0') siren.resolves.push(new URL(route.request().url()).pathname.split('/').pop()!);
    return serve(route);
  });
  return siren;
}
