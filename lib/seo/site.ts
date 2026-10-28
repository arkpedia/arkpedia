import { canonicalPublicHref } from '@/lib/nav/publicRoutes';

/** The one public origin search engines and share cards should name: the apex redirects
 *  here, Preview and the Worker's own hostnames send noindex (next.config.js headers). */
export const SITE_ORIGIN = 'https://www.arkpedia.net';
export const SITE_NAME = 'Arkpedia';
/** The site's own line, for the home page and as the fallback in pages/_app.tsx. */
export const SITE_DESCRIPTION = 'An Arknights reference: operators, skins, enemies, stages, base planning and the current event schedule.';

/** "Farming Guide — Arkpedia": the form every page's tab title has taken since the first ones. */
export function pageTitle(title: string): string {
  return `${title} — ${SITE_NAME}`;
}

/** The address a page is indexed under: the public name of its route (an old route name
 *  maps to its current one, config/pilot-route-aliases.json) on the canonical origin. The
 *  path arrives already encoded, from the same helper the site's own links use. */
export function canonicalUrl(path: string): string {
  const [pathname] = path.split(/[?#]/, 1);
  return SITE_ORIGIN + canonicalPublicHref(pathname === '' ? '/' : pathname);
}
