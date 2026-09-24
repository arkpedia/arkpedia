import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { modifyRouteRegex } from 'next/dist/lib/redirect-status';

/*
 * Asset folders are 307s to the asset commit of the last deploy. Vercel applies header
 * rules to a redirect response as well (next dev and next start send none on one), so
 * the broad image rule in next.config.js matched those redirects by extension and sent
 * them as immutable for a year: a returning browser never followed a later deploy's pin
 * and art published since then 404'd for it. The redirect may only be kept briefly;
 * the commit-pinned target and real static files keep their year.
 */
type Rule = { source: string; headers: { key: string; value: string }[]; has?: unknown; missing?: unknown };
type Redirect = { source: string; destination: string };
const require = createRequire(import.meta.url);
// Any phase but build or dev: the factory then skips the public asset index it writes.
const config = require('../../next.config.js')('phase-test') as { headers(): Promise<Rule[]>; redirects(): Promise<Redirect[]> };

/** The matcher Next's own router builds for a custom route (router-utils/filesystem.js). */
const matcher = (source: string, type: 'header' | 'redirect') => getPathMatch(source, {
  strict: true,
  removeUnnamedParams: true,
  regexModifier: regex => modifyRouteRegex(regex, type === 'redirect' ? ['/_next'] : undefined),
});

/** What a response carries: every matching rule applies in order, the last one winning. */
function cacheControl(rules: Rule[], pathname: string): string | undefined {
  let value: string | undefined;
  for (const rule of rules) {
    if (rule.has || rule.missing || matcher(rule.source, 'header')(pathname) === false) continue;
    for (const header of rule.headers) if (header.key.toLowerCase() === 'cache-control') value = header.value;
  }
  return value;
}

/** A concrete, already-encoded request path for a redirect source. */
function sample(source: string, extension: string): string {
  return source.replace(':format', 'webp').replace(':width', '320').replace(':path*', `Some%20Folder/Wi%C5%A1%27adel%20-%20Base.${extension}`);
}

const maxAge = (value = '') => Number(/max-age=(\d+)/.exec(value)?.[1] ?? NaN);

test('asset redirects are cacheable only briefly, whatever the image extension', async () => {
  const rules = await config.headers();
  const redirects = (await config.redirects()).filter(redirect => /^https:\/\//.test(redirect.destination));
  // Every skin and image folder, plus the originals and responsive variants.
  assert.ok(redirects.length >= 40, `found ${redirects.length} asset redirects`);
  for (const redirect of redirects) {
    for (const extension of ['png', 'webp', 'jpg', 'jpeg', 'svg', 'gif', 'avif']) {
      const pathname = sample(redirect.source, extension);
      assert.notEqual(matcher(redirect.source, 'redirect')(pathname), false, `${pathname} is not redirected`);
      const value = cacheControl(rules, pathname);
      assert.ok(value && !/immutable/.test(value) && maxAge(value) <= 3600, `${pathname}: ${value}`);
    }
  }
});

test('real static files keep their year and data indexes their short window', async () => {
  const rules = await config.headers();
  const redirects = await config.redirects();
  for (const pathname of ['/brand/logo.webp', '/social-card.png']) {
    assert.ok(redirects.every(redirect => matcher(redirect.source, 'redirect')(pathname) === false), pathname);
    assert.equal(cacheControl(rules, pathname), 'public, max-age=31536000, immutable', pathname);
  }
  assert.equal(cacheControl(rules, '/stages-index.json'), 'public, max-age=300, stale-while-revalidate=86400');
  assert.equal(cacheControl(rules, '/operators/Amiya'), undefined);
});
