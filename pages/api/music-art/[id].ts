import type { NextApiRequest, NextApiResponse } from 'next';
import { monsterSirenSongArt } from '@/lib/music/monsterSirenArt';

// Monster Siren song ids are digits (six, so far): the rule pages/api/music-guesser applies.
const SONG_ID = /^\d{1,12}$/;

/**
 * A Monster Siren song's album art, artists and album name, for the player: the lock screen's
 * artwork (lib/music/useMsrMediaSession.ts) and the player's cover and artist when the catalogue
 * has none for the song. `{ cover, artists, albumName }`, each null or empty when Monster Siren
 * does not say.
 *
 * A route of its own, beside pages/api/music-guesser/[id] rather than in it: that one is asked on
 * every song start for the audio's signed address, which expires, so it is cached for a minute;
 * this asks Monster Siren twice (the song, then its album) for things that do not change, so it is
 * cached for a day, and a song start never waits for the album. The same checks: the id is digits,
 * the addresses asked are fixed, and an answer is passed on only when Monster Siren says it is
 * that song and that album (code 0, the same cid), with the cover https on Monster Siren's own
 * hosts (lib/music/monsterSirenArt.ts).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { id } = req.query;
  if (typeof id !== 'string' || !SONG_ID.test(id)) return res.status(404).json({ error: 'Unknown song' });
  try {
    const art = await monsterSirenSongArt(id, (url) => fetch(url, { signal: AbortSignal.timeout(8000) }));
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json(art);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'This song\'s details could not be loaded.' });
  }
}
