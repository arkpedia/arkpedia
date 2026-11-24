import { pageCatalogue } from '@/lib/routes/catalogue.cjs';
import { canonicalPublicHref } from '@/lib/nav/publicRoutes';
import { SITE_ORIGIN } from './site';

export const STATIC_ROUTES = pageCatalogue.flatMap(page => page.sitemap === 'static' ? [page.route] : []);
export const UNLISTED_ROUTES = new Set(pageCatalogue.flatMap(page => page.sitemap === 'exclude' ? [page.route] : []));

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
    const normalized = normalizeRoute(key);
    if (UNLISTED_ROUTES.has(normalized)) continue;
    const route = canonicalPublicHref(normalized);
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
