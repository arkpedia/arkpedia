// The music player's audio relay (relay.arkpedia.net/msr/<cid>): a Monster Siren song's file,
// fetched from Monster Siren's CDN through this box and streamed on, for listeners whose own
// route to the CDN's nearest edge does not deliver (an iPhone on a Korean mobile network got the
// file's first bytes and then nothing, 2026-10-14; the same phone over a VPN played). The player
// uses it only after a song made no sound from the CDN directly (lib/music/audioElement.ts).
// Nothing is stored: the bytes pass through, byte ranges and all. No dependencies.
import http from 'node:http';
import fs from 'node:fs';
import { Readable } from 'node:stream';

const SOCKET = process.env.ARKAUDIO_SOCKET || '/run/arkaudio/audio.sock';
const SONG = /^\/msr\/(\d{1,12})$/;
// A signed address lasts about five hours; one is asked for again after half an hour.
const ADDRESS_MS = 30 * 60 * 1000;
const addresses = new Map();

async function signedAddress(cid, fresh) {
  const kept = addresses.get(cid);
  if (!fresh && kept && Date.now() - kept.at < ADDRESS_MS) return kept.url;
  const response = await fetch(`https://monster-siren.hypergryph.com/api/song/${cid}`, { signal: AbortSignal.timeout(8000), redirect: 'error' });
  if (!response.ok) throw new Error(`song ${response.status}`);
  const data = await response.json();
  const url = new URL(data.data?.sourceUrl);
  if (data.code !== 0 || String(data.data?.cid) !== cid || url.protocol !== 'https:' || !url.hostname.endsWith('.hycdn.cn')) throw new Error('not that song');
  if (addresses.size > 2000) addresses.clear();
  addresses.set(cid, { url: url.href, at: Date.now() });
  return url.href;
}

async function upstream(cid, range, signal) {
  for (const fresh of [false, true]) {
    const url = await signedAddress(cid, fresh);
    const headers = { 'user-agent': 'Arkpedia-audio-relay/1.0 (+https://arkpedia.net)' };
    if (range && /^bytes=\d*-\d*$/.test(range)) headers.range = range;
    const response = await fetch(url, { headers, signal, redirect: 'error' });
    // A refused address (expired, or the CDN changed it): asked for afresh once.
    if ((response.status === 403 || response.status === 404) && !fresh) { await response.body?.cancel(); continue; }
    return response;
  }
  throw new Error('unreachable');
}

const server = http.createServer(async (req, res) => {
  const match = SONG.exec(req.url?.split('?')[0] ?? '');
  if (!match || (req.method !== 'GET' && req.method !== 'HEAD')) { res.writeHead(404).end(); return; }
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  try {
    const response = await upstream(match[1], req.headers.range, controller.signal);
    const type = response.headers.get('content-type') ?? '';
    if (![200, 206].includes(response.status) || !/^audio\//.test(type)) {
      await response.body?.cancel();
      res.writeHead(response.status === 416 ? 416 : 502, { 'cache-control': 'no-store' }).end();
      return;
    }
    const headers = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'private, no-store' };
    for (const name of ['content-length', 'content-range', 'last-modified', 'etag']) {
      const value = response.headers.get(name);
      if (value) headers[name] = value;
    }
    res.writeHead(response.status, headers);
    if (req.method === 'HEAD' || !response.body) { await response.body?.cancel(); res.end(); return; }
    Readable.fromWeb(response.body).on('error', () => res.destroy()).pipe(res);
  } catch {
    if (!res.headersSent) res.writeHead(502, { 'cache-control': 'no-store' });
    res.end();
  }
});
server.requestTimeout = 0;
server.headersTimeout = 15_000;

if (SOCKET.startsWith('/')) { try { fs.unlinkSync(SOCKET); } catch { /* none yet */ } }
server.listen(SOCKET.startsWith('/') ? SOCKET : Number(SOCKET), () => console.log(`audio relay on ${SOCKET}`));
