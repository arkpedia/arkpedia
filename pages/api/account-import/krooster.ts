import type { NextApiRequest, NextApiResponse } from 'next';
import { KROOSTER_LOOKUP, KROOSTER_USER, parseKroosterPage } from '@/lib/account-import/krooster';

/** A Krooster profile's roster for a tester's account (lib/account-import/krooster.ts). Preview only: the
 * production build has no such route. The browser cannot read krooster.com across origins, so the site fetches
 * the public page and passes on the roster and a few profile fields, nothing else the page carries. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.ARKPEDIA_KROOSTER_IMPORT !== '1') return res.status(404).end();
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  const { user } = req.query;
  if (typeof user !== 'string' || !KROOSTER_USER.test(user) || Object.keys(req.query).some(key => key !== 'user')) return res.status(400).json({ error: 'A Krooster username is letters, digits, dots, dashes and underscores.' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const url = `${KROOSTER_LOOKUP}${encodeURIComponent(user)}`;
    const page = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Arkpedia Preview (https://preview.arkpedia.net)', Accept: 'text/html' } });
    if (page.status === 404) return res.status(404).json({ error: 'Krooster has no profile by that name.' });
    if (!page.ok) return res.status(502).json({ error: `Krooster answered ${page.status}.` });
    const profile = parseKroosterPage(await page.text());
    if (!profile) return res.status(404).json({ error: 'Krooster has no public profile by that name.' });
    // Several testers trying one profile need not fetch it from Krooster each time.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    return res.status(200).json(profile);
  } catch {
    return res.status(503).json({ error: 'Krooster could not be reached.' });
  } finally {
    clearTimeout(timer);
  }
}
