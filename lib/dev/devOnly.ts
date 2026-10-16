import type { GetStaticProps, NextApiHandler } from 'next';

/**
 * getStaticProps for a local tool. Its API routes answer only under `next dev`
 * (pages/api/dev refuses elsewhere, and deployments carry none of the data files they
 * read), so outside development the page is a 404 rather than a public page whose
 * every request fails -- /bases/whole-base-optimizer was the latter (sweep
 * 2026-09-24, §3.11). test-dev-only-pages holds every page that calls pages/api/dev
 * to this.
 */
export const devOnlyStaticProps: GetStaticProps = async () =>
  process.env.NODE_ENV === 'development' ? { props: {} } : { notFound: true };

/** One policy for local APIs. Read-only inspection works without a write passcode. */
export function devOnlyApi(handler: NextApiHandler, { passcode }: { passcode: 'writes' | 'all' }): NextApiHandler {
  return async (req, res) => {
    if (process.env.NODE_ENV !== 'development') return res.status(404).json({ error: 'Not found' });
    const secret = process.env.DEV_CONSOLE_PASSCODE;
    const writes = req.method !== 'GET' && req.method !== 'HEAD';
    if (secret && (passcode === 'all' || writes) && req.headers['x-dev-passcode'] !== secret) {
      return res.status(401).json({ error: 'Invalid passcode' });
    }
    return handler(req, res);
  };
}
