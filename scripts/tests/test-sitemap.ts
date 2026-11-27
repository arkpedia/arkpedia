import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRoute, sitemapRoutes, sitemapXml, STATIC_ROUTES } from '../../lib/seo/sitemap';

test('release pages are listed under their public names, encoded as the links are, less the unlisted', () => {
  const routes = sitemapRoutes(['/', '/pulls', '/friends', '/account', '/search', '/recruitment/popout', '/polls/endfield-pull-or-skip', '/operators/Aak', "/operators/Ch'en the Holungday", '/events/%5BCelebration%5D%201st%20Anniversary', '/stages/content/act10d5', '/gamemodes'], ['ccb', 'dps']);
  assert.ok(routes.includes('/') && routes.includes('/pull-planner') && routes.includes('/game-modes'));
  assert.ok(!routes.includes('/pulls') && !routes.includes('/account?panel=following') && !routes.includes('/account') && !routes.includes('/search') && !routes.includes('/recruitment/popout'));
  assert.ok(!routes.includes('/polls/endfield-pull-or-skip'));
  assert.ok(routes.includes("/operators/Ch'en%20the%20Holungday"), 'a name is encoded as operatorHref encodes it');
  assert.ok(routes.includes('/events/%5BCelebration%5D%201st%20Anniversary'), 'an encoded key stays as it is');
  for (const route of STATIC_ROUTES) assert.ok(routes.includes(route), route);
  assert.deepEqual(routes, [...routes].sort(), 'sorted, so two releases with the same pages give the same file');
  assert.equal(normalizeRoute('/operators/Ch%27en'), '/operators/Ch\'en', 'encodeURIComponent leaves an apostrophe');
});

test('without a release the static pages alone are listed, and the XML is well formed', () => {
  const xml = sitemapXml(sitemapRoutes(null, ['ccb', 'dps']));
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">\n/);
  assert.equal((xml.match(/<url>/g) ?? []).length, STATIC_ROUTES.length);
  assert.match(xml, /<loc>https:\/\/www\.arkpedia\.net\/about<\/loc>/);
  assert.match(sitemapXml(["/operators/Ch'en"]), /<loc>https:\/\/www\.arkpedia\.net\/operators\/Ch&apos;en<\/loc>/, 'an apostrophe is escaped for XML');
});

test('unlisted managed pages are omitted even when a release includes an old route', () => {
  assert.ok(!sitemapRoutes(['/ccb', '/game-modes/ccb']).includes('/game-modes/ccb'));
  assert.ok(sitemapRoutes(null, ['ccb']).includes('/game-modes/ccb'));
  assert.ok(!sitemapRoutes(['/dps-calculator']).includes('/dps-calculator'));
  assert.ok(sitemapRoutes(null, ['dps']).includes('/dps-calculator'));
});
