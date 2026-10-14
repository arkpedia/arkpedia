import type { NextApiRequest, NextApiResponse } from 'next';
import { SONG_ID, monsterSirenAudioUrl } from '@/lib/music/monsterSirenAudio';

/**
 * Resolves a Monster Siren song id to its signed audio address, for the song guesser.
 *
 * It takes any song Monster Siren serves. It used to accept only the ids in the deploy's
 * bundled data/albums.json, so a song a content release added was offered by the page and
 * then refused here ("Unknown song") until the next deploy -- 880383, the day it appeared.
 * That list guarded nothing the checks below do not: the id can only be digits, the address
 * asked is fixed, and an answer is passed on only when Monster Siren says it is that song
 * (code 0, the same cid) and its audio is https on Monster Siren's own CDN (*.hycdn.cn),
 * which is exactly what its public API gives anyone. Checking the id against the live
 * content release instead would put the release manifest (about 3 MB) on the cold path of
 * an interactive request, and refuse every song while GitHub was unreachable.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { id } = req.query;
  if (typeof id !== 'string' || !SONG_ID.test(id)) return res.status(404).json({ error: 'Unknown song' });
  try {
    const url = await monsterSirenAudioUrl(id);
    // These CDN URLs are signed and expire. Cache only briefly; never proxy audio bytes.
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    return res.status(200).json({ url: url.href });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'This song could not be loaded. Retry or try another song.' });
  }
}
