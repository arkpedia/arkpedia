import type { GetServerSideProps } from 'next';

/**
 * The sitemap, written per request from the live release's page list (lib/seo/sitemap.ts): a
 * new operator, event or content page is listed the day its release goes live, with no
 * deploy. Cached for an hour at the edge and served stale for a day while it refreshes.
 * robots.txt names it. Nothing renders: the response is the XML itself.
 */
export default function Sitemap() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const [{ loadRelease }, { sitemapRoutes, sitemapXml }] = await Promise.all([import('@/lib/content/release'), import('@/lib/seo/sitemap')]);
  const loaded = await loadRelease();
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400');
  res.write(sitemapXml(sitemapRoutes(loaded ? Object.keys(loaded.manifest.pages) : null)));
  res.end();
  return { props: {} };
};
