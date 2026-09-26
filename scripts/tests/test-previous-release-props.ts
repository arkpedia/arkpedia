import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { createElement, type ComponentType } from 'react';
import type { GetStaticProps } from 'next';
import './css-modules';
import { renderOnHost } from './host-clock';
import { pageFilePath } from '../../lib/content/pagePaths.mjs';
import { CONTENT_SCHEMA, type ContentManifest, type ContentPointer } from '../../lib/content/types';
import SeasonalPage, { getStaticProps as seasonalProps } from '../../pages/stages/seasonal';
import StageContentPage, { getStaticProps as contentProps } from '../../pages/stages/content/[id]';
import { getSeasonalChallenge, seasonalFromRelease } from '../../lib/stages/terminal';

/*
 * A deploy renders against the live content release, and right after one that release is
 * still the one the PREVIOUS code compiled: the release gate (scripts/content/deploy-gate.mjs)
 * holds the next release until production runs the new code. So every page has to render
 * the previous release's props as well as its own.
 *
 * feat/stages-parity-pipeline moved /stages/seasonal to `challenges` (from `vector` and
 * `trials`) and gave /stages/content/[id] a server-side `scene`. Run against the live
 * release (7f8a8a8d, compiled by fa2bdc22), Deploy's build failed prerendering
 * /stages/seasonal and all 151 content pages -- and with production left on the old code,
 * the gate would have held every release after it, so neither side could move. Found
 * 2026-09-26 by building the branch the way deploy.yml does.
 *
 * The fixtures are those two pages exactly as that release published them. This serves
 * them as a release, runs each page's real getStaticProps against it (as the Deploy
 * build does) and renders the page from what comes back.
 */
const FIXTURES = path.join(__dirname, 'fixtures/previous-release');
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

/** One release per call, each with its own id: the loader keeps the release it read last
 *  (lib/content/server.ts) and would answer from it again under the same id. */
let releases = 0;
async function withRelease<T>(pages: Record<string, string>, run: () => Promise<T>): Promise<T> {
  const documents = new Map<string, string>();
  const label = 'abcdef'[releases++ % 6];
  const revision = label.repeat(40), release = label.repeat(64);
  const manifest: ContentManifest = { schema: CONTENT_SCHEMA, release, generatedAt: '2026-09-25T22:30:00Z', generator: revision,
    assets: { 'arkpedia-image-assets': revision, 'arkpedia-skin-assets': revision }, pages: {}, files: {} };
  for (const [route, file] of Object.entries(pages)) {
    const body = fs.readFileSync(path.join(FIXTURES, file), 'utf8'), at = pageFilePath(route);
    documents.set(`/${revision}/release/${at}`, body);
    manifest.pages[route] = { path: at, bytes: Buffer.byteLength(body), sha256: sha(body) };
  }
  const body = JSON.stringify(manifest);
  documents.set(`/${revision}/release/manifest.json`, body);
  const pointer: ContentPointer = { schema: CONTENT_SCHEMA, release, revision, manifestSha256: sha(body) };
  const server = createServer((request, response) => {
    if (request.url === '/live/current.json') { response.end(JSON.stringify(pointer)); return; }
    const found = documents.get(decodeURIComponent(request.url!));
    if (!found) { response.writeHead(404); response.end(); return; }
    response.end(found);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const keys = ['ARKPEDIA_CONTENT_URL', 'ARKPEDIA_CONTENT_TEST', 'ARKPEDIA_CONTENT_DISABLED', 'ARKPEDIA_EXPORT_CONTENT'] as const;
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { ARKPEDIA_CONTENT_URL: `http://127.0.0.1:${address.port}`, ARKPEDIA_CONTENT_TEST: '1', ARKPEDIA_CONTENT_DISABLED: '0', ARKPEDIA_EXPORT_CONTENT: '0' });
  try {
    return await run();
  } finally {
    for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function render<P extends object>(getStaticProps: GetStaticProps<P>, Page: ComponentType<P>, params?: Record<string, string>) {
  const result = await getStaticProps({ params, revalidateReason: 'build' });
  assert.ok('props' in result, 'getStaticProps returned props');
  const props = await result.props;
  assert.ok((props as { __contentRelease?: unknown }).__contentRelease, 'the props came from the release, not the bundled data');
  return { props, html: renderOnHost('UTC', Date.parse('2026-09-26T12:00:00Z'), createElement(Page, props)) };
}

test('/stages/seasonal renders the previous release\'s props (vector and trials, no challenges)', async () => {
  await withRelease({ '/stages/seasonal': 'stages-seasonal.json' }, async () => {
    const { props, html } = await render(seasonalProps, SeasonalPage);
    assert.deepEqual(props.challenges.map((mode) => [mode.label, mode.cards.length]), [['VEC', 3], ['TN', 6]]);
    assert.ok(!('vector' in props) && !('trials' in props), 'the old keys do not travel on to the browser');
    for (const heading of ['Contingency Contract', 'Vector Breakthrough', 'Trials for Navigator']) {
      assert.match(html, new RegExp(`<h2>${heading}</h2>`), `the ${heading} panel`);
    }
    assert.match(html, /Trial from Misery/, 'the newest Vector Breakthrough season');
  });
});

test('/stages/content/[id] renders the previous release\'s props (no scene)', async () => {
  await withRelease({ '/stages/content/act51side': 'stages-content-act51side.json' }, async () => {
    const { props, html } = await render(contentProps, StageContentPage, { id: 'act51side' });
    assert.equal(props.scene.key, 'score', 'a side story sits in Score');
    assert.match(html, /class="terminal-tab current" aria-current="page" href="\/stages\/score"/, 'the Terminal bar marks Score');
  });
});

test('a release this code compiled passes through unchanged', () => {
  const current = getSeasonalChallenge();
  assert.equal(seasonalFromRelease(current), current);
});
