import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { browserImports, pageBrowserModules, pages, pathToTarget } from './browser-graph';
// @ts-expect-error Plain Node audit script.
import { dataTables, findTablesInChunks, fingerprints } from '../audits/check-client-chunks.mjs';

/*
 * No browser bundle may compile in a data/ record, except the few
 * scripts/build/client-bundle-guard.cjs allows.
 *
 * Each table here used to be imported by client code, so a page rendered from the live release
 * still read the copy the last deploy compiled into its chunk: a new event landed in the stage
 * browser's raw "other" group with no dates, an operator added after the last regeneration fell
 * back to text heuristics on /base, and so on, until somebody redeployed. The check named
 * twelve tables; eleven more were in chunks because nobody had named them. It denies by
 * default now: the page gets a table through its props (__contentTables, see
 * lib/content/tables.mjs), which the content export fills from the release's own data.
 *
 * The walk reads each page the way Next builds its browser half: getStaticProps and
 * everything only it uses are dropped, every other import is followed, lazy import()s
 * included. scripts/audits/check-client-chunks.mjs confirms the same on what `next build`
 * emitted, after every build, and the webpack guard fails the build itself.
 */
const require = createRequire(import.meta.url);
const { CLIENT_ALLOWED, CLIENT_ALLOWED_EDGES } = require('../build/client-bundle-guard.cjs') as {
  CLIENT_ALLOWED: Record<string, string>; CLIENT_ALLOWED_EDGES: Record<string, { importers: string[]; pages: string[] }>;
};

/** Every data/ JSON a page's browser half reaches, with the module that imports it. */
function dataReached(page: string): { file: string; from: string }[] {
  const clientPages = pageBrowserModules(page);
  const seen = new Set([page]);
  const queue = [page];
  const reached: { file: string; from: string }[] = [];
  while (queue.length) {
    const file = queue.shift()!;
    if (!/\.(tsx?|mjs|js)$/.test(file)) continue;
    for (const next of browserImports(file, clientPages.has(file))) {
      if (/^data\/.+\.json$/.test(next)) reached.push({ file: next, from: file });
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return reached;
}

test('a renamed page forwards browser code while keeping its data functions server-only', () => {
  const route = 'pages/reward-tracker.tsx';
  assert.ok(pageBrowserModules(route).has('pages/free-op.tsx'));
  assert.equal(pathToTarget(route, ['data/pull-first-clears.json']), null);
  assert.equal(pathToTarget(route, ['data/pull-first-clears.json'], { clientOnly: false })?.at(-1), 'data/pull-first-clears.json');
  assert.equal(pathToTarget(route, ['components/pulls/PastRewards.tsx'])?.at(-1), 'components/pulls/PastRewards.tsx');
});

test('the allowed tables exist, and SL-4b\'s is allowed through its one importer only', () => {
  for (const file of [...Object.keys(CLIENT_ALLOWED), ...Object.keys(CLIENT_ALLOWED_EDGES)]) assert.ok(fs.existsSync(file), `${file} is missing`);
  assert.deepEqual(Object.keys(CLIENT_ALLOWED).sort(), ['data/assets/revisions.json', 'data/polls/power-scale-v1.0.json']);
  assert.deepEqual(CLIENT_ALLOWED_EDGES['data/skin-availability-windows.json'], { importers: ['lib/skins/localSkinWindows.ts'], pages: ['/skins'], why: 'SL-4b, pending a maintainer decision' });
});

test('no page compiles a data/ table it is not allowed into its browser bundle', () => {
  // Not vacuous: the server half of these pages does read the tables.
  assert.equal(pathToTarget('pages/obtain-method.tsx', ['data/headhunting_banners.json'], { clientOnly: false })?.at(-1), 'data/headhunting_banners.json');
  assert.equal(pathToTarget('pages/stages/browse.tsx', ['data/story-groups.json'], { clientOnly: false })?.at(-1), 'data/story-groups.json');
  for (const [page, table] of [['pages/base.tsx', 'data/base-skill-slots.json'], ['pages/farming.tsx', 'data/farming-tiers.json'], ['pages/planner.tsx', 'data/material-catalogue.json'], ['pages/schedule.tsx', 'data/headhunting_banners.json'], ['pages/skins.tsx', 'data/skin-shop-rotations.json']]) {
    assert.equal(pathToTarget(page, [table], { clientOnly: false })?.at(-1), table, `${page} should read ${table} on the server`);
  }
  // The browser half of these pages does live work beside that data.
  assert.ok(browserImports('pages/obtain-method.tsx', true).includes('lib/gacha/limitedRerunNotes.ts'));
  assert.ok(browserImports('pages/stages/browse.tsx', true).includes('components/stages/StageList.tsx'));
  assert.ok(browserImports('pages/operators/[name].tsx', true).includes('lib/farming/materialSortOrder.ts'));
  const leaks: string[] = [];
  for (const page of pages()) {
    for (const { file, from } of dataReached(page)) {
      if (Object.hasOwn(CLIENT_ALLOWED, file)) continue;
      const edge = CLIENT_ALLOWED_EDGES[file];
      if (edge?.importers.includes(from) && edge.pages.includes(`/${page.replace(/^pages\//, '').replace(/\.tsx?$/, '').replace(/(^|\/)index$/, '')}`)) continue;
      leaks.push(`${page}: ${from} -> ${file}`);
    }
  }
  assert.deepEqual(leaks, [], 'Browser code must read these tables from the page props, which carry the content release.');
  // And the SL-4b edge is what /skins actually has.
  assert.deepEqual(dataReached('pages/skins.tsx').map(({ file, from }) => `${from} -> ${file}`).filter(edge => !edge.endsWith('revisions.json')), ['lib/skins/localSkinWindows.ts -> data/skin-availability-windows.json']);
});

/* The post-build half: what `next build` emitted. Made-up tables, compiled the way webpack
   compiles a JSON module, in the chunks a made-up build manifest names. */
test('the post-build check finds any data/ table in any chunk but where the allowlist lets it be', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-chunks-'));
  try {
    const table = (seed: string) => ({ [`${seed} Operator|Skill|Base`]: { slot: 0, phase: 0, level: 1 }, [`Another ${seed}|Other Skill|Elite 2`]: { slot: 1, phase: 2, level: 1 },
      [`Third ${seed}|Third Skill|Elite 1`]: { slot: 0, phase: 1, level: 1 } });
    fs.mkdirSync(path.join(root, 'data/nested'), { recursive: true });
    const files = { 'data/nobody-listed-this.json': table('Unlisted'), 'data/nested/allowed.json': table('Allowed'), 'data/edge.json': table('Edge') };
    for (const [file, json] of Object.entries(files)) fs.writeFileSync(path.join(root, file), JSON.stringify(json, null, 2));
    fs.writeFileSync(path.join(root, 'data/tiny.json'), '[1]');
    const compiled = (json: object) => `(self.webpackChunk=self.webpackChunk||[]).push([[1],{1:e=>{e.exports=JSON.parse('${JSON.stringify(json)}')}}]);`;
    const chunks = [
      { file: 'static/chunks/pages/base.js', text: compiled(files['data/nobody-listed-this.json']) },
      { file: 'static/chunks/pages/any.js', text: compiled(files['data/nested/allowed.json']) },
      { file: 'static/chunks/pages/skins.js', text: compiled(files['data/edge.json']) },
      { file: 'static/chunks/42.lazy.js', text: compiled(files['data/edge.json']) },
      { file: 'static/chunks/pages/other.js', text: 'console.log("no tables here")' },
    ];
    const pagesOf = (file: string) => ({ 'static/chunks/pages/base.js': ['/base'], 'static/chunks/pages/any.js': ['/any'], 'static/chunks/pages/skins.js': ['/skins'], 'static/chunks/pages/other.js': ['/other'] } as Record<string, string[]>)[file] ?? [];
    assert.deepEqual(dataTables(root), ['data/edge.json', 'data/nested/allowed.json', 'data/nobody-listed-this.json', 'data/tiny.json']);
    const { leaks, unrecognisable } = findTablesInChunks({ root, chunks, pagesOf, allowed: { 'data/nested/allowed.json': 'test' }, edges: { 'data/edge.json': { importers: [], pages: ['/skins'] } } });
    // Denied by default, though no list names it; the edge table only where its pages are.
    assert.deepEqual(leaks.map((leak: { table: string; file: string }) => `${leak.table} in ${leak.file}`), ['data/edge.json in static/chunks/42.lazy.js', 'data/nobody-listed-this.json in static/chunks/pages/base.js']);
    assert.deepEqual(unrecognisable, ['data/tiny.json']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the tables worth guarding can be recognised in a chunk, and every build runs the check', () => {
  for (const table of ['data/headhunting_banners.json', 'data/base-formulas.json', 'data/material-catalogue.json', 'data/skin-shop-rotations.json', 'data/assets/public-asset-index.json']) {
    assert.ok(fingerprints(JSON.parse(fs.readFileSync(table, 'utf8'))).length >= 8, table);
  }
  const scripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts;
  assert.match(scripts.postbuild, /npm run check:client-chunks/);
  assert.equal(scripts['check:client-chunks'], 'node scripts/audits/check-client-chunks.mjs');
  assert.match(fs.readFileSync('next.config.js', 'utf8'), /new ClientDataGuard\(__dirname\)/);
});
