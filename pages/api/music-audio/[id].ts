import type { NextApiRequest, NextApiResponse } from 'next';
import { SONG_ID, monsterSirenAudioUrl } from '@/lib/music/monsterSirenAudio';

/**
 * The music player's address for a Monster Siren song's audio: a redirect to Monster Siren's
 * signed address (lib/music/monsterSirenAudio.ts). The player sets this address and plays in
 * the same press. An iPhone starts sound only inside a press, and the player used to fetch the
 * signed address first and play after; on an iPhone (2026-10-14) the song then said it played
 * and stayed silent at 0:00, while the same file opened directly played. Audio bytes never pass
 * through us: the redirect is all we send. `?retry=` (the engine's fresh try) skips the edge's
 * copy of the redirect.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { id } = req.query;
  if (typeof id !== 'string' || !SONG_ID.test(id)) return res.status(404).json({ error: 'Unknown song' });
  try {
    const url = await monsterSirenAudioUrl(id);
    // Signed addresses last about five hours: the edge keeps the redirect half an hour, so a press
    // is not kept waiting on Monster Siren's API (the first load took about seven seconds on an
    // iPhone over 5G, 2026-10-14); a browser keeps it a minute.
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=1800');
    res.setHeader('Location', url.href);
    return res.status(302).end();
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'This song could not be loaded. Retry or try another song.' });
  }
}
