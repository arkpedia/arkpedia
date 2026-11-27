import type { GetServerSideProps } from 'next';

/**
 * The sitemap, written per request from the live release's page list (lib/seo/sitemap.ts): a
 * new operator, event or content page is listed the day its release goes live, with no
 * deploy. Discovery also follows the page listing schedule at request time.
 * robots.txt names it. Nothing renders: the response is the XML itself.
 */
export default function Sitemap() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const [{ loadRelease }, { sitemapRoutes, sitemapXml }, { readPublicPageVisibility }] = await Promise.all([
    import('@/lib/content/release'), import('@/lib/seo/sitemap'), import('@/lib/page-visibility/store'),
  ]);
  const [loaded, visibility] = await Promise.all([loadRelease(), readPublicPageVisibility()]);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.write(sitemapXml(sitemapRoutes(loaded ? Object.keys(loaded.manifest.pages) : null, visibility.listed)));
  res.end();
  return { props: {} };
};
