import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeRoute, sitemapRoutes, sitemapXml, STATIC_ROUTES, UNLISTED_ROUTES } from '../../lib/seo/sitemap';

test('release pages are listed under their public names, encoded as the links are, less the unlisted', () => {
  const routes = sitemapRoutes(['/', '/pulls', '/account', '/search', '/recruitment/popout', '/operators/Aak', "/operators/Ch'en the Holungday", '/events/%5BCelebration%5D%201st%20Anniversary', '/stages/content/act10d5', '/gamemodes']);
  assert.ok(routes.includes('/') && routes.includes('/pull-planner') && routes.includes('/game-modes'));
  assert.ok(!routes.includes('/pulls') && !routes.includes('/account') && !routes.includes('/search') && !routes.includes('/recruitment/popout'));
  assert.ok(routes.includes("/operators/Ch'en%20the%20Holungday"), 'a name is encoded as operatorHref encodes it');
  assert.ok(routes.includes('/events/%5BCelebration%5D%201st%20Anniversary'), 'an encoded key stays as it is');
  for (const route of STATIC_ROUTES) assert.ok(routes.includes(route), route);
  assert.deepEqual(routes, [...routes].sort(), 'sorted, so two releases with the same pages give the same file');
  assert.equal(normalizeRoute('/operators/Ch%27en'), '/operators/Ch\'en', 'encodeURIComponent leaves an apostrophe');
});

test('without a release the static pages alone are listed, and the XML is well formed', () => {
  const xml = sitemapXml(sitemapRoutes(null));
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">\n/);
  assert.equal((xml.match(/<url>/g) ?? []).length, STATIC_ROUTES.length);
  assert.match(xml, /<loc>https:\/\/www\.arkpedia\.net\/about<\/loc>/);
  assert.match(sitemapXml(["/operators/Ch'en"]), /<loc>https:\/\/www\.arkpedia\.net\/operators\/Ch&apos;en<\/loc>/, 'an apostrophe is escaped for XML');
});

/* Every static page is accounted for: in the release (scripts/content/pages.json), in STATIC_ROUTES, in
 * UNLISTED_ROUTES, or here with why it is not for a search engine. */
const NOT_FOR_SEARCH: Record<string, string> = {
  '/ccb': 'Preview-only historical helper, excluded from production discovery until promotion.',
  '/game-modes/integrated-strategies': 'Preview-only reference, intentionally excluded from production discovery until promotion.',
  '/404': 'the error page', '/500': 'the error page', '/home': 'a redirect', '/events': 'a redirect', '/sitemap.xml': 'the sitemap itself',
  '/optimizer': 'development only', '/bases/whole-base-optimizer': 'development only',
  '/music/[albumId]': 'a redirect', '/world': 'listed by the release under its old name, /community',
 '/pull-planner': 'the release lists /pulls', '/operator-planner': 'the release lists /planner',
  '/reward-tracker': 'the release lists /free-op', '/gacha-simulator': 'the release lists /gacha', '/game-modes': 'the release lists /gamemodes',
  '/game-modes/stronghold-protocol': 'the release lists it under /gamemodes', '/game-modes/stronghold-protocol/stronghold-companion': 'the release lists it under /gamemodes',
  '/polls/power-scale': 'the release lists /results',
  '/community/videos': 'listed as /world/videos', '/community/twitch': 'listed as /world/twitch', '/community/youtube-live': 'listed as /world/youtube-live', '/changelog': 'listed as /whats-new',
};
test('every page file is in the release, the static list, the unlisted set, or named here', () => {
  const released = new Set(JSON.parse(fs.readFileSync('scripts/content/pages.json', 'utf8')) as string[]);
  const files = (function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === 'api' || entry.name === 'dev' ? [] : walk(file);
      return /\.tsx$/.test(entry.name) && !/^_/.test(entry.name) ? [file] : [];
    });
  })('pages');
  const unaccounted = files.map((file) => '/' + file.replace(/^pages\//, '').replace(/\.tsx$/, '').replace(/(^|\/)index$/, '')).map((route) => route || '/')
    .filter((route) => !released.has(route) && !STATIC_ROUTES.includes(route) && !UNLISTED_ROUTES.has(route) && !(route in NOT_FOR_SEARCH));
  assert.deepEqual(unaccounted, []);
  for (const route of Object.keys(NOT_FOR_SEARCH)) assert.ok(!STATIC_ROUTES.includes(route), `${route} is both static and not for search`);
});
