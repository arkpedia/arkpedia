import type { NextApiRequest, NextApiResponse } from 'next';
import { timingSafeEqual } from 'node:crypto';
import { RELEASE_REFRESH_ROUTES } from '@/lib/content/releaseRefresh';
import { canonicalPublicHref } from '@/lib/nav/publicRoutes';

/**
 * Regenerates the pages that wait longest for a content release (lib/content/releaseRefresh.ts),
 * so a release reaches them as soon as it is live. POST, with the shared secret as a bearer
 * token: ARKPEDIA_RELEASE_REFRESH_SECRET on the Vercel project, the GitHub secret of the same
 * name in prepare-content.yml. It takes no input, so the worst a leaked secret can do is these
 * few regenerations.
 */
export function authorized(header: string | undefined, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// A publication can refresh all clock pages, in bounded batches.
export const config = { maxDuration: 300 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }
  if (!authorized(req.headers.authorization, process.env.ARKPEDIA_RELEASE_REFRESH_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const refreshed: Record<string, string> = {};
  for (let start = 0; start < RELEASE_REFRESH_ROUTES.length; start += 3) {
    await Promise.all(RELEASE_REFRESH_ROUTES.slice(start, start + 3).map(async (route) => {
      try {
        // Content keys stay stable; ISR must refresh the page readers actually visit.
        await res.revalidate(canonicalPublicHref(route));
        refreshed[route] = 'regenerated';
      } catch (error) {
        refreshed[route] = `failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    }));
  }
  const failed = Object.values(refreshed).some((result) => result.startsWith('failed'));
  return res.status(failed ? 500 : 200).json({ refreshed });
}
