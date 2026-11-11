import type { NextApiRequest, NextApiResponse } from 'next';
import { SONG_ID, monsterSirenAudioUrl } from '@/lib/music/monsterSirenAudio';
import { audioLinkKeepMs, createAudioLinkMemo, workerContext } from '@/lib/music/audioLinkMemo';

/** The Cloudflare Worker's kept addresses (lib/music/audioLinkMemo.ts); unused on Vercel. */
const workerLinks = createAudioLinkMemo();

/**
 * The music player's address for a Monster Siren song's audio: a redirect to Monster Siren's
 * signed address (lib/music/monsterSirenAudio.ts). The player sets this address and plays in
 * the same press. An iPhone starts sound only inside a press, and the player used to fetch the
 * signed address first and play after; on an iPhone (2026-10-14) the song then said it played
 * and stayed silent at 0:00, while the same file opened directly played. Audio bytes never pass
 * through us: the redirect is all we send. `?retry=` (the engine's fresh try) skips the kept copy
 * of the redirect, on Vercel's edge and on the Worker.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { id, retry } = req.query;
  if (typeof id !== 'string' || !SONG_ID.test(id)) return res.status(404).json({ error: 'Unknown song' });
  // Only the Worker keeps its own copy: nothing in front of it does (audioLinkMemo.ts).
  const worker = workerContext();
  try {
    let href = worker && retry === undefined ? await workerLinks.get(id, worker.bucket) : null;
    if (worker) res.setHeader('X-Arkpedia-Audio-Link', href ? 'kept' : retry === undefined ? 'asked' : 'retry');
    if (!href) {
      href = (await monsterSirenAudioUrl(id)).href;
      if (worker) worker.waitUntil(workerLinks.put(id, href, worker.bucket));
    }
    // Keep the same CDN URL for repeat plays, with time left for seeks into the file.
    const ttl = Math.floor(audioLinkKeepMs(href, Date.now()) / 1000);
    res.setHeader('Cache-Control', ttl ? `public, max-age=${ttl}, s-maxage=${ttl}` : 'no-store');
    res.setHeader('Location', href);
    return res.status(302).end();
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'This song could not be loaded. Retry or try another song.' });
  }
}
