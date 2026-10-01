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
export const PAGE_TABLES = {
  // The home page's announcement ticker: the SSS cycle it counts down to (lib/schedule/sssCycle.ts).
  '/': ['sss-cycle'],
  '/planner': ['base-formulas', 'battle-records', 'supply-stages', 'operatorLevelExpLmd', 'import-aliases', 'item-sort-ids', 'farming-tiers', 'material-catalogue'],
  // The game import (lib/account/importAccount.ts): the id map, and the planner's depot vocabulary.
  '/account': ['game-account-map', 'import-aliases', 'material-catalogue'],
  '/farming': ['farming-tiers'],
  '/base': ['base-skill-slots', 'base-group-rosters'],
  '/schedule': ['event_colors', 'event_materials', 'headhunting_banners'],
  '/stages/browse': ['stage-tile-legend', 'stages-content', 'content-windows', 'story-groups'],
};

/** The table names a route carries, in declaration order. */
export function pageTables(route) {
  return Object.prototype.hasOwnProperty.call(PAGE_TABLES, route) ? PAGE_TABLES[route] : [];
}

/** The declared tables a page's props do not carry: what validate-release refuses. */
export function missingPageTables(route, props) {
  const carried = props && typeof props === 'object' ? props.__contentTables : undefined;
  return pageTables(route).filter(name => !carried || typeof carried !== 'object' || carried[name] == null);
}
