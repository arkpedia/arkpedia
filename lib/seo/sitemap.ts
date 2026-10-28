import { canonicalPublicHref } from '@/lib/nav/publicRoutes';
import { SITE_ORIGIN } from './site';

/** Pages a search engine should find that the content release does not list: no data
 *  function, or built outside the release (scripts/tests/test-release-pages.ts). Public names. */
export const STATIC_ROUTES = ['/about', '/games', '/credits', '/privacy', '/cookies', '/support', '/whats-new', '/world/videos', '/world/twitch', '/world/youtube-live', '/community/projects'];

/** Routes the release lists that are not pages for a search engine: not indexed (PageMeta
 *  noindex), or a window of another page. Public names. */
export const UNLISTED_ROUTES = new Set(['/account', '/friends', '/search', '/recruitment/popout']);

/** A route encoded as the site's links encode it: each segment decoded, then encoded again
 *  with encodeURIComponent (operatorHref and the event and stage links do the same), so a
 *  release key written either way lists one address. */
export function normalizeRoute(route: string): string {
  return route.split('/').map((segment) => {
    let plain = segment;
    try { plain = decodeURIComponent(segment); } catch { /* not encoded: keep it */ }
    return encodeURIComponent(plain);
  }).join('/') || '/';
}

/** Every address the sitemap lists, sorted: the live release's pages under their public names,
 *  less the unlisted ones, plus the static pages. Without a release (the content export, a
 *  disabled content channel) the static pages alone. */
export function sitemapRoutes(releasePages: Iterable<string> | null): string[] {
  const routes = new Set<string>(STATIC_ROUTES);
  for (const key of releasePages ?? []) {
    const route = canonicalPublicHref(normalizeRoute(key));
    if (!UNLISTED_ROUTES.has(route)) routes.add(route);
  }
  return [...routes].sort();
}

const escapeXml = (text: string) => text.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

/** No lastmod: the release rebuilds every page nightly, so a date would say nothing true. */
export function sitemapXml(routes: readonly string[]): string {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + routes.map((route) => `  <url><loc>${escapeXml(SITE_ORIGIN + route)}</loc></url>`).join('\n')
    + '\n</urlset>\n';
}
