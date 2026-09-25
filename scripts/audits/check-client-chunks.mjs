/**
 * No game table the content release carries may be compiled into a browser chunk.
 *
 * Each of these used to be imported by client code, so a page rendered from the live
 * release still answered from the copy the last deploy compiled in -- a new event in
 * the stage browser's raw "other" group, an operator on /base's text heuristics, the
 * whole banner list and the 453 KB asset index shipped to pages that never rendered
 * them -- until somebody redeployed. The pages now get them through their props
 * (__contentTables, lib/content/tables.mjs).
 *
 * Two checks read this list. scripts/tests/test-client-game-tables.ts walks each page's
 * browser imports from the source, in `npm test`. This one reads what `next build`
 * actually emitted (postbuild, so CI and every deploy build run it): webpack writes a
 * JSON module as JSON.parse('<the file's JSON>'), so a chunk that carries a table
 * carries runs of the file's own text, and those are what it looks for.
 *
 * Run after a build:  npm run check:client-chunks
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RELEASE_ONLY_TABLES = [
  // /stages/browse: the filter's headings (components/stages/StageList.tsx).
  'data/stages-content.json',
  'data/content-windows.json',
  'data/story-groups.json',
  // /base: slot chains from building_data and the group rosters (lib/base/baseGroupRosters.ts).
  'data/base-skill-slots.json',
  'data/base-group-rosters.json',
  // /farming and the planner's "where it comes from" groups.
  'data/farming-tiers.json',
  // /planner: level costs, other planners' item ids, the depot's in-game order.
  'data/operatorLevelExpLmd.json',
  'data/import-aliases.json',
  'data/item-sort-ids.json',
  // Every asset path, 453 KB: availability is resolved at export, not in the browser.
  'data/assets/public-asset-index.json',
  // The banner list and its art versions (lib/gacha/headhuntingBannerData.ts).
  'data/headhunting_banners.json',
  'data/assets/banner_art_sources.json',
];

/* The one bundled copy that stays: /schedule's no-release fallback for the table the
   release hands it (useContentTable in pages/schedule.tsx). As import edges for the
   source walk, and as the pages whose chunks may carry it for this one. */
export const NO_RELEASE_FALLBACKS = {
  'data/headhunting_banners.json': { edges: ['pages/schedule.tsx -> data/headhunting_banners.json'], pages: ['/schedule'] },
};

const SAMPLES = 12;
const WIDTH = 48;

/**
 * Twelve runs of a table's own JSON text, spread evenly across it. Webpack emits a JSON
 * module as JSON.parse('<JSON.stringify of the file>'), so a chunk that carries the
 * table carries these runs verbatim. Each is 48 characters of printable ASCII with no
 * quote or backslash that the JS string would escape -- long enough that no other code
 * or data could hold one by chance.
 */
export function fingerprints(json) {
  const text = JSON.stringify(json);
  const clean = (at) => /^[\x20-\x7e]+$/.test(text.slice(at, at + WIDTH)) && !/['\\]/.test(text.slice(at, at + WIDTH));
  const runs = new Set();
  for (let i = 0; i < SAMPLES; i++) {
    let at = Math.floor((i * Math.max(0, text.length - WIDTH)) / SAMPLES);
    while (at + WIDTH <= text.length && !clean(at)) at++;
    if (at + WIDTH <= text.length) runs.add(text.slice(at, at + WIDTH));
  }
  return [...runs];
}

/** A chunk carries the table when it holds at least two thirds of the runs. */
export function carries(text, runs) {
  if (!runs.length) return false;
  return runs.filter((run) => text.includes(run)).length >= Math.ceil((runs.length * 2) / 3);
}

/**
 * Every (table, chunk) the build emitted that it should not have.
 * `chunks` are { file, text } relative to .next/; `pagesOf(file)` names the pages whose
 * initial load includes that chunk (none for a lazily loaded one).
 */
export function findTablesInChunks({ root, chunks, pagesOf, tables = RELEASE_ONLY_TABLES, fallbacks = NO_RELEASE_FALLBACKS }) {
  const leaks = [];
  for (const table of tables) {
    const runs = fingerprints(JSON.parse(fs.readFileSync(path.join(root, table), 'utf8')));
    if (runs.length < 3) throw new Error(`${table}: too few distinctive runs to recognise it in a chunk`);
    const allowed = fallbacks[table]?.pages ?? [];
    for (const { file, text } of chunks) {
      if (!carries(text, runs)) continue;
      const pages = pagesOf(file);
      if (pages.length && pages.every((page) => allowed.includes(page))) continue;
      leaks.push({ table, file, pages });
    }
  }
  return leaks;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const at = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(at) : [at];
  });
}

/** Reads a finished build under `root`/.next. */
export function checkClientChunks(root) {
  const next = path.join(root, '.next');
  const manifest = JSON.parse(fs.readFileSync(path.join(next, 'build-manifest.json'), 'utf8'));
  const owners = new Map();
  for (const [page, files] of Object.entries(manifest.pages)) {
    for (const file of files) owners.set(file, [...(owners.get(file) ?? []), page]);
  }
  const chunks = walk(path.join(next, 'static/chunks')).filter((file) => file.endsWith('.js'))
    .map((file) => ({ file: path.relative(next, file).split(path.sep).join('/'), text: fs.readFileSync(file, 'utf8') }));
  return { chunks: chunks.length, leaks: findTablesInChunks({ root, chunks, pagesOf: (file) => owners.get(file) ?? [] }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const { chunks, leaks } = checkClientChunks(root);
  if (leaks.length) {
    console.error(`${leaks.length} release-only game table(s) compiled into browser chunks:`);
    for (const { table, file, pages } of leaks) console.error(`  ${table} in ${file} (${pages.length ? pages.join(', ') : 'loaded lazily'})`);
    console.error('\nRead the table from the page props (lib/content/tables.mjs), not from data/, in browser code.');
    process.exit(1);
  }
  console.log(`No release-only game table in ${chunks} browser chunks (${RELEASE_ONLY_TABLES.length} tables checked).`);
}
