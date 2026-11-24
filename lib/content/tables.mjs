import { pageCatalogue } from '../routes/catalogue.cjs';

/**
 * The game tables each route's browser code reads from `__contentTables`.
 *
 * A table the browser needs travels in the page's props, never in its bundle: a copy
 * compiled into a client chunk is only as fresh as the last deploy, and the point of
 * the content release is that game data lands without one. Each route here passes a
 * loader per name to withContentPage (lib/content/server.ts), which then attaches the
 * tables on every path:
 *
 *   - the content export: from the release's own data/, so the release carries them;
 *   - a release published before a table joined this list: from this deployment's
 *     server bundle, with a warning, until the next release (the generator commit is
 *     part of the release id, so the first content run after a deploy re-exports);
 *   - no release at all (local development, the build's prerender): from data/.
 *
 * scripts/content/validate-release.mjs refuses a release whose page lacks one, and
 * scripts/tests/test-client-game-tables.ts fails if browser code imports the file.
 * Read in a component with useReleaseTable (lib/content/context.tsx).
 */
export const PAGE_TABLES = Object.fromEntries(pageCatalogue.flatMap(page =>
  page.key && page.tables ? [[page.key, page.tables]] : []));

export const REGIONAL_ROUTES = pageCatalogue.flatMap(page => page.key && page.regional ? [page.key] : []);

/** Tables every content route carries besides its own, attached by withContentPage itself
 *  (lib/content/server.ts) and so not part of pageTables: the sponsor campaigns the page
 *  header's Sponsored slot reads (components/ui/SponsoredSlot). A release carries them like
 *  any table; one exported before they existed gets this deployment's copy. */
export const SITE_TABLES = ['sponsor-campaigns'];

/** The table names a route carries, in declaration order. */
export function pageTables(route) {
  return [...(Object.prototype.hasOwnProperty.call(PAGE_TABLES, route) ? PAGE_TABLES[route] : []), ...(REGIONAL_ROUTES.includes(route) ? ['regional-schedules'] : [])];
}

/** The declared tables a page's props do not carry: what validate-release refuses. */
export function missingPageTables(route, props) {
  const carried = props && typeof props === 'object' ? props.__contentTables : undefined;
  return pageTables(route).filter(name => !carried || typeof carried !== 'object' || carried[name] == null);
}
