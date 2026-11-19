// Where a content page's file is, given the key the release publishes it under.
//
// A page that was renamed keeps its old address as its content-release key
// (scripts/content/pages.json, lib/content/tables.mjs, withContentPage's first argument):
// the release is published under that key and old links redirect from it
// (config/pilot-route-aliases.json). Its file lives under its public name only: the key
// /pulls is pages/pull-planner.tsx, /gamemodes/stronghold-protocol is
// pages/game-modes/stronghold-protocol.tsx. Nothing keeps a second file at the old path.
import fs from 'node:fs';

const aliases = JSON.parse(fs.readFileSync(new URL('../../config/pilot-route-aliases.json', import.meta.url), 'utf8')).routes;

const fileAt = (route) => {
  const stem = `pages${route === '/' ? '/index' : route}`;
  return [`${stem}.tsx`, `${stem}/index.tsx`, `${stem}.ts`]
    .find((file) => fs.existsSync(new URL(`../../${file}`, import.meta.url))) ?? null;
};

/** The page file a release key (or any route) is built from, or null when there is none. */
export function pageSource(route) {
  return fileAt(route) ?? (Object.hasOwn(aliases, route) ? fileAt(aliases[route]) : null);
}

/** The release key of a page's public route: the old name the release lists it under, when
 *  it has one there; otherwise the route itself. */
export function releaseKey(route, released) {
  if (released.includes(route)) return route;
  return Object.keys(aliases).find((old) => aliases[old] === route && released.includes(old)) ?? route;
}
