import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { canonicalPublicHref } from '../../lib/nav/publicRoutes';
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
type Redirect = { source: string; destination: string; has?: { type: string; key: string }[] };
const config = require('../../next.config.js')('test') as { redirects: () => Promise<Redirect[]> };

/* Whether a redirect serves `href`: its path, and any query its `has` asks for. The
   site search's `/` + `?s=` rule must not read as "every link home is redirected". A
   condition on something a link cannot carry (a header, a cookie) is taken as met. */
function serves(redirect: Redirect, href: string): boolean {
  if (!pathToRegexp(redirect.source).test(href.split(/[?#]/)[0])) return false;
  const query = new URLSearchParams(href.split('#')[0].split('?')[1] ?? '');
  return (redirect.has ?? []).every((condition) => condition.type !== 'query' || query.has(condition.key));
}

/** The page file a route resolves to, if any. */
function pageFile(href: string): string | null {
  const route = href.split(/[?#]/)[0];
  return [`pages${route}.tsx`, `pages${route}/index.tsx`, `pages${route}.ts`].find(file => fs.existsSync(file)) ?? null;
}

test('every nav href is a page no next.config.js redirect matches', async () => {
  const redirects = await config.redirects();
  const redirected = (href: string) => redirects.filter(r => serves(r, href));
  // Not vacuous: the old Enemies href is exactly what this refuses.
  assert.ok(redirected('/enemies/originium_slug_enemy_1007_slime').length, 'the retired per-enemy path is a redirect');
  const problems: string[] = [];
  for (const link of NAV_ORDER) {
    if (!pageFile(link.href)) problems.push(`${link.label} (${link.href}) has no page under pages/`);
    for (const r of redirected(link.href)) problems.push(`${link.label} (${link.href}) matches the redirect ${r.source} -> ${r.destination}`);
  }
  assert.deepEqual(problems, [], 'A redirected nav link is a full document load that restarts the app and the music player.');
});

/**
 * Every root-relative href a <Link> in pages/ or components/ writes out, each `${...}` in a
 * template taken as one path segment. Static text only: an href held in a variable is not
 * seen here (the nav's are checked above, from the data).
 */
function linkHrefs(): { file: string; href: string }[] {
  const out: { file: string; href: string }[] = [];
  for (const dir of ['pages', 'components']) {
    for (const rel of fs.readdirSync(dir, { recursive: true }) as string[]) {
      if (!rel.endsWith('.tsx')) continue;
      const file = path.join(dir, rel);
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(/<Link\b(?:[^<>]|=>)*?\bhref=\{?(`[^`]*`|"[^"]*"|'[^']*')/g)) {
        const href = m[1].slice(1, -1);
        if (href.startsWith('/')) out.push({ file, href: href.replace(/\$\{[^}]*\}/g, 'x') });
      }
    }
  }
  return out;
}

test('no <Link> on the site points at an address a next.config.js redirect serves', async () => {
  // The same 308 and full document load as the nav's Enemies entry, from links in the
  // pages: an enemy's summons linked /enemies/<slug>, and every card on
  // /stages/content/<id> (and a borrowed map's note) linked /stages/<slug>, the retired
  // per-stage path -- a click fetched /stages/14-1 as a document, then the browse page,
  // and the app restarted (measured 2026-09-26).
  const redirects = await config.redirects();
  const redirected = (href: string) => redirects.filter(r => serves(r, href));
  // Not vacuous: both retired shapes are redirects, and the scan sees the site's links.
  assert.ok(redirected('/enemies/x').length && redirected('/stages/x').length, 'the retired per-enemy and per-stage paths are redirects');
  assert.ok(redirected('/?s=amiya').length && !redirected('/').length && !redirected('/#top').length, 'only a search query sends home to /search');
  const links = linkHrefs();
  assert.ok(links.length > 50, `the scan found ${links.length} links`);
  assert.ok(links.some(({ href }) => href === '/enemies?e=x') && links.some(({ href }) => href === '/stages/browse?s=x'));
  const problems = links.flatMap(({ file, href }) => redirected(href).map(r => `${file}: ${href} matches ${r.source} -> ${r.destination}`));
  assert.deepEqual(problems, [], 'Link to the destination itself: a redirected in-app link is a full document load that restarts the app and the music player.');
});

/**
 * Whether a root-relative path is a page under pages/: each segment a file or folder of that
 * name, or a dynamic one ([slug], [...rest], [[...rest]]) where the folder has one. `x`
 * stands for a `${...}` in a template, which only a dynamic segment can take.
 */
function routeResolves(href: string): boolean {
  const segments = href.split(/[?#]/)[0].split('/').filter(Boolean);
  const page = (base: string) => ['.tsx', '.ts'].some(ext => fs.existsSync(base + ext));
  const entries = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);
  function walk(dir: string, i: number): boolean {
    if (i === segments.length) return page(path.join(dir, 'index'));
    const segment = segments[i];
    const last = i === segments.length - 1;
    if (segment !== 'x') {
      if (last && page(path.join(dir, segment))) return true;
      if (fs.existsSync(path.join(dir, segment)) && walk(path.join(dir, segment), i + 1)) return true;
    }
    for (const entry of entries(dir)) {
      const name = entry.replace(/\.tsx?$/, '');
      if (/^\[\[?\.\.\.[^\]]+\]\]?$/.test(name)) return true;
      if (!/^\[[^.\]][^\]]*\]$/.test(name)) continue;
      if (entry !== name ? last : walk(path.join(dir, entry), i + 1)) return true;
    }
    return false;
  }
  return walk('pages', 0);
}

test('every <Link> on the site points at a page that exists', () => {
  // The whole-base optimizer's link to the per-room one named /base/optimizer, a page there
  // never was (it is /optimizer): a 404 one click from the page, and nothing checked.
  assert.ok(!routeResolves('/base/optimizer') && routeResolves('/optimizer'), 'the old optimizer link is refused, the real one is not');
  assert.ok(routeResolves('/') && routeResolves('/stages/content/x') && routeResolves('/events/x'), 'index and dynamic pages resolve');
  const links = linkHrefs();
  assert.ok(links.length > 50, `the scan found ${links.length} links`);
  const problems = links.filter(({ href }) => !routeResolves(href)).map(({ file, href }) => `${file}: ${href}`);
  assert.deepEqual(problems, [], 'Each <Link> href names a page under pages/.');
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


test('legacy Friends links open the account tab even in an older search index',()=>{
  assert.equal(canonicalPublicHref('/friends'),'/account?panel=friends');
  assert.equal(canonicalPublicHref('/friends?panel=profile#collection'),'/account?panel=friends#collection');
  assert.ok(isActiveLink(NAV_ORDER.find(link=>link.label==='Friends')!,'/account','/account?panel=friends'));
});
