import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pageCatalogue, releaseRoutes } from '../../lib/routes/catalogue.cjs';
import { loadPageCatalogue } from '../content/page-catalogue.cjs';
import { pageSource } from '../content/page-source.mjs';

test('former page addresses resolve to canonical sources and keep their release keys', () => {
  assert.equal(pageSource('/gamemodes'), 'pages/game-modes/index.tsx');
  assert.equal(pageSource('/gamemodes/stronghold-protocol'), 'pages/game-modes/stronghold-protocol.tsx');
  assert.equal(pageSource('/gacha'), 'pages/gacha-simulator.tsx');
  assert.equal(pageSource('/game-modes'), pageSource('/gamemodes'));
  assert.ok(releaseRoutes.includes('/results'));
  assert.ok(releaseRoutes.includes('/community'));
});

test('page declarations match their builders and dynamic paths', () => {
  const problems: string[] = [];
  for (const page of pageCatalogue) {
    const text = fs.readFileSync(page.file, 'utf8');
    const hasBuilder = /export (?:const|async function) get(?:StaticProps|ServerSideProps)\b/.test(text);
    const contentKey = /withContentPage\s*(?:<[^>]*>)?\s*\(\s*['"]([^'"]+)['"]/.exec(text)?.[1];
    // The legacy Friends export deliberately shares Account's props for older releases.
    const legacyFriends = page.key === '/friends' && /export \{ default, getStaticProps \} from '\.\/account'/.test(text);
    if (!legacyFriends && contentKey !== page.key) problems.push(`${page.file}: expected release key ${page.key}, found ${contentKey}`);
    if (hasBuilder && !page.key && !page.outsideRelease) problems.push(`${page.file}: declare why its data is outside the release`);
    if (page.outsideRelease && !hasBuilder) problems.push(`${page.file}: stale outsideRelease exception`);
    if (page.key?.includes('[') && !/export (?:const|async function) getStaticPaths\b/.test(text)) {
      problems.push(`${page.file}: add getStaticPaths for the content export`);
    }
  }
  assert.deepEqual(problems, []);
});

test('new static and data-backed routes are discovered from their own files', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-page-catalogue-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'config'));
  fs.writeFileSync(path.join(root, 'config/pilot-route-aliases.json'), '{"routes":{}}');
  fs.mkdirSync(path.join(root, 'pages', 'example'), { recursive: true });
  fs.writeFileSync(path.join(root, 'pages', 'example.tsx'), 'export default function Example() { return null; }');
  fs.writeFileSync(path.join(root, 'pages', 'example.route.json'), '{"sitemap":"static"}');
  fs.writeFileSync(path.join(root, 'pages', 'example', '[id].tsx'), 'export default function Detail() { return null; }');
  fs.writeFileSync(path.join(root, 'pages', 'example', '[id].route.json'), '{"release":true,"clock":"minute","tables":["example"]}');

  const [index, detail] = loadPageCatalogue(root);
  assert.equal(index.route, '/example');
  assert.equal(index.sitemap, 'static');
  assert.equal(detail.key, '/example/[id]');
  assert.equal(detail.clock, 'minute');
  assert.deepEqual(detail.tables, ['example']);

  fs.writeFileSync(path.join(root, 'pages', 'example', '[id].route.json'), '{"release":"/unrelated"}');
  assert.throws(() => loadPageCatalogue(root), /invalid or duplicate release key/);
});
