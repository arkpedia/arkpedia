import type { GetStaticProps } from 'next';

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
