import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { browserImports, pages, pathToTarget } from './browser-graph';
// @ts-expect-error Plain Node audit script.
import { findTablesInChunks, fingerprints, NO_RELEASE_FALLBACKS, RELEASE_ONLY_TABLES } from '../audits/check-client-chunks.mjs';

/*
 * Game tables the content release carries, which no browser bundle may compile in.
 *
 * Each of these used to be imported by client code, so a page rendered from the live
 * release still read the copy the last deploy compiled into its chunk: a new event
 * landed in the stage browser's raw "other" group with no dates, an operator added
 * after the last regeneration fell back to text heuristics on /base, and so on, until
 * somebody redeployed. The page now gets the table through its props
 * (__contentTables, see lib/content/tables.mjs), which the content export fills from
 * the release's own data and the server fills from its bundle for an older release.
 *
 * The walk reads each page the way Next builds its browser half: getStaticProps and
 * everything only it uses are dropped, every other import is followed, lazy import()s
 * included. scripts/audits/check-client-chunks.mjs confirms the same on what `next build`
 * emitted, after every build.
 */
/* The tables and the one allowed fallback (/schedule's useContentTable copy of the banner
   list) are listed once, in the post-build chunk check, which reads the same list. */
const ALLOWED_EDGES = (Object.values(NO_RELEASE_FALLBACKS) as { edges: string[] }[]).flatMap(fallback => fallback.edges);
const TABLES = RELEASE_ONLY_TABLES as string[];

test('the release-only game tables exist as data, so the release can carry them', () => {
  for (const file of TABLES) assert.ok(fs.existsSync(file), `${file} is missing`);
});

test('no page compiles a release-only game table into its browser bundle', () => {
  const all = pages();
  // Not vacuous: the server half of these pages does read the tables.
  assert.equal(pathToTarget('pages/obtain-method.tsx', ['data/headhunting_banners.json'], { clientOnly: false })?.at(-1), 'data/headhunting_banners.json');
  assert.ok(browserImports('pages/obtain-method.tsx', true).includes('lib/gacha/limitedBannerType.ts'));
  assert.equal(pathToTarget('pages/stages/browse.tsx', ['data/story-groups.json'], { clientOnly: false })?.at(-1), 'data/story-groups.json');
  assert.ok(browserImports('pages/stages/browse.tsx', true).includes('components/stages/StageList.tsx'));
  for (const [page, table] of [['pages/base.tsx', 'data/base-skill-slots.json'], ['pages/base.tsx', 'data/base-group-rosters.json'], ['pages/farming.tsx', 'data/farming-tiers.json'], ['pages/planner.tsx', 'data/item-sort-ids.json'], ['pages/planner.tsx', 'data/import-aliases.json']]) {
    assert.equal(pathToTarget(page, [table], { clientOnly: false })?.at(-1), table, `${page} should read ${table} on the server`);
  }
  assert.ok(browserImports('pages/operators/[name].tsx', true).includes('lib/farming/materialSortOrder.ts'));
  assert.ok(browserImports('pages/base.tsx', true).includes('lib/base/controlCenterSpecialSkills.ts'));
  const leaks = all.flatMap(page => TABLES.flatMap(table => {
    const chain = pathToTarget(page, [table], { allowed: ALLOWED_EDGES });
    return chain ? [chain.join(' -> ')] : [];
  }));
  assert.deepEqual(leaks, [], 'Browser code must read these tables from the page props, which carry the content release.');
});

/* The post-build half: what `next build` emitted. A made-up table, compiled the way
   webpack compiles a JSON module, in the chunks a made-up build manifest names. */
test('the post-build check finds a release-only table in any chunk but its page\'s own fallback', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-chunks-'));
  try {
    const table = { 'Release Operator|Skill|Base': { slot: 0, phase: 0, level: 1 }, 'Another Operator|Other Skill|Elite 2': { slot: 1, phase: 2, level: 1 },
      'Third Operator|Third Skill|Elite 1': { slot: 0, phase: 1, level: 1 } };
    fs.mkdirSync(path.join(root, 'data'));
    fs.writeFileSync(path.join(root, 'data/table.json'), JSON.stringify(table, null, 2));
    const compiled = `(self.webpackChunk=self.webpackChunk||[]).push([[1],{1:e=>{e.exports=JSON.parse('${JSON.stringify(table)}')}}]);`;
    const chunks = [
      { file: 'static/chunks/pages/base.js', text: compiled },
      { file: 'static/chunks/pages/schedule.js', text: compiled },
      { file: 'static/chunks/42.lazy.js', text: compiled },
      { file: 'static/chunks/pages/other.js', text: 'console.log("no tables here")' },
    ];
    const pagesOf = (file: string) => ({ 'static/chunks/pages/base.js': ['/base'], 'static/chunks/pages/schedule.js': ['/schedule'], 'static/chunks/pages/other.js': ['/other'] } as Record<string, string[]>)[file] ?? [];
    const leaks = findTablesInChunks({ root, chunks, pagesOf, tables: ['data/table.json'], fallbacks: { 'data/table.json': { edges: [], pages: ['/schedule'] } } });
    assert.deepEqual(leaks.map((leak: { file: string }) => leak.file), ['static/chunks/pages/base.js', 'static/chunks/42.lazy.js']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('every listed table can be recognised in a chunk, and every build runs the check', () => {
  for (const table of TABLES) assert.ok(fingerprints(JSON.parse(fs.readFileSync(table, 'utf8'))).length >= 8, table);
  const scripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts;
  assert.match(scripts.postbuild, /npm run check:client-chunks/);
  assert.equal(scripts['check:client-chunks'], 'node scripts/audits/check-client-chunks.mjs');
});
