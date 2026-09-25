import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { LINKS, NAV_ORDER, isActiveLink } from '../../lib/nav/navLinks';

/*
 * Every destination the site nav renders is a page the client router can open in place.
 *
 * The Enemies entry named the first enemy's page, a slug next.config.js read out of
 * public/enemies-index.json at deploy and inlined. That URL shape had been retired into a
 * `/enemies/:slug` redirect, so every click went through a 308 and a full document load:
 * the client router cannot follow a server redirect, the whole app restarted, and the music
 * player's iframe was destroyed mid-song (confirmed live on 2026-09-25). Nothing checked.
 */
const require = createRequire(import.meta.url);
const { pathToRegexp } = require('next/dist/compiled/path-to-regexp') as { pathToRegexp: (source: string) => RegExp };
// A phase other than build or dev, so loading the config does not rebuild the asset index.
const config = require('../../next.config.js')('test') as { redirects: () => Promise<{ source: string; destination: string }[]> };

/** The page file a route resolves to, if any. */
function pageFile(href: string): string | null {
  const route = href.split(/[?#]/)[0];
  return [`pages${route}.tsx`, `pages${route}/index.tsx`, `pages${route}.ts`].find(file => fs.existsSync(file)) ?? null;
}

test('every nav href is a page no next.config.js redirect matches', async () => {
  const redirects = await config.redirects();
  const redirected = (href: string) => redirects.filter(r => pathToRegexp(r.source).test(href.split(/[?#]/)[0]));
  // Not vacuous: the old Enemies href is exactly what this refuses.
  assert.ok(redirected('/enemies/originium_slug_enemy_1007_slime').length, 'the retired per-enemy path is a redirect');
  const problems: string[] = [];
  for (const link of NAV_ORDER) {
    if (!pageFile(link.href)) problems.push(`${link.label} (${link.href}) has no page under pages/`);
    for (const r of redirected(link.href)) problems.push(`${link.label} (${link.href}) matches the redirect ${r.source} -> ${r.destination}`);
  }
  assert.deepEqual(problems, [], 'A redirected nav link is a full document load that restarts the app and the music player.');
});

test('no nav href lands on a page that redirects from its own data function', () => {
  for (const link of NAV_ORDER) {
    const text = fs.readFileSync(pageFile(link.href)!, 'utf8');
    assert.doesNotMatch(text, /\bredirect\s*:\s*\{/, `${link.label} (${link.href}) redirects from getServerSideProps or getStaticProps`);
  }
  // /events is such a page, which is why it stays out of both navs (it only lights Schedule's detail pages).
  assert.ok(LINKS.some(link => link.href === '/events') && !NAV_ORDER.some(link => link.href === '/events'));
});

test('nothing bakes a deploy-time slug into the nav any more', () => {
  const enemies = NAV_ORDER.find(link => link.label === 'Enemies');
  assert.equal(enemies?.href, '/enemies');
  assert.ok(isActiveLink(enemies!, '/enemies'));
  assert.doesNotMatch(fs.readFileSync('next.config.js', 'utf8'), /NEXT_PUBLIC_ENEMY_HANDBOOK_ENTRY|firstEnemySlug/);
  assert.ok(!fs.existsSync(path.join('lib', 'enemies', 'handbookEntry.ts')));
});
