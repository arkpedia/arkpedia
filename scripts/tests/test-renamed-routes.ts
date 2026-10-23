import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import renamedRoutes from '../../config/renamed-routes.json';

/*
 * config/renamed-routes.json drives two things: next.config.js's redirects from each old
 * address, and lib/content/server.ts reading a renamed page's old address from a release
 * that predates the rename. Both only work while the table is true: the new address is a
 * page, the old one is not, and nothing on the site still links the old one (a redirected
 * link is a full document load that restarts the app and the music player).
 */
const require = createRequire(import.meta.url);
const config = require('../../next.config.js')('test') as { redirects: () => Promise<{ source: string; destination: string; permanent?: boolean }[]> };
const ROUTES = renamedRoutes.routes as Record<string, string>;

const pageFile = (route: string) => [`pages${route}.tsx`, `pages${route}/index.tsx`].find((file) => fs.existsSync(file)) ?? null;

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? sources(file) : /\.(tsx?|mjs)$/.test(entry.name) ? [file] : [];
  });
}

test('each renamed page is at its new address and gone from its old one', () => {
  assert.ok(Object.keys(ROUTES).length > 0);
  for (const [now, before] of Object.entries(ROUTES)) {
    assert.ok(pageFile(now), `${now} is a page`);
    assert.equal(pageFile(before), null, `${before} is no longer a page: it redirects to ${now}`);
  }
});

test('each old address redirects, permanently, to its page', async () => {
  const redirects = await config.redirects();
  for (const [now, before] of Object.entries(ROUTES)) {
    assert.ok(redirects.some((r) => r.source === before && r.destination === now && r.permanent), `${before} redirects to ${now}`);
  }
});

test('nothing on the site links an old address', () => {
  const old = Object.values(ROUTES).map((route) => route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // A quoted address, or one in a template literal or an href object's pathname.
  const linked = new RegExp(`["'\`](?:${old.join('|')})(?=["'\`?#])`);
  const hits = ['pages', 'components', 'lib'].flatMap(sources).filter((file) => linked.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(hits, [], 'link the new address (config/renamed-routes.json)');
});
