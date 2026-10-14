import type { NextApiRequest, NextApiResponse } from 'next';
import { monsterSirenSongArt } from '@/lib/music/monsterSirenArt';

// Monster Siren song ids are digits: the rule pages/api/music-art and music-guesser apply.
const SONG_ID = /^\d{1,12}$/;
/** An album cover is a 500x500 JPEG of about 150 kB; anything far larger is not one. */
const MAX_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * A Monster Siren song's album cover, served from this site.
 *
 * Monster Siren's image CDN (web.hycdn.cn) refuses a request that comes with another site's
 * Referer: the cover answers 200 to curl, which sends none, and 403 to anything sent from an
 * Arkpedia page (2026-10-14) -- an <img> on the page and the lock screen's artwork fetch alike,
 * which is why an iPhone's lock screen showed the site's icon over a song Monster Siren has a
 * cover for. So the player names this address instead (lib/music/songArt.ts), and the cover is
 * fetched here, server-side, with no Referer. Its audio CDN does not check, and is never proxied.
 *
 * Nothing but a cover Monster Siren vouches for is passed on: the id is digits, the cover's
 * address is the one its API gives for the song's album, https on its own hosts
 * (lib/music/monsterSirenArt.ts), never one taken from the request, and the answer must be an
 * image of a sensible size. Covers do not change, so it is cached for a day at the edge.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { id } = req.query;
  if (typeof id !== 'string' || !SONG_ID.test(id)) return res.status(404).json({ error: 'Unknown song' });
  try {
    const art = await monsterSirenSongArt(id, (url) => fetch(url, { signal: AbortSignal.timeout(8000) }));
    if (!art.cover) {
      res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600');
      return res.status(404).json({ error: 'This song has no cover.' });
    }
    // Never followed elsewhere: the address checked is the one fetched.
    const image = await fetch(art.cover, { signal: AbortSignal.timeout(8000), redirect: 'error' });
    const type = (image.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!image.ok || !IMAGE_TYPES.has(type)) throw new Error('Cover unavailable');
    const body = Buffer.from(await image.arrayBuffer());
    if (!body.length || body.length > MAX_BYTES) throw new Error('Cover is not an album cover');
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Length', String(body.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    // Node sends no body for a HEAD.
    return res.status(200).end(body);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'This song\'s cover could not be loaded.' });
  }
}
