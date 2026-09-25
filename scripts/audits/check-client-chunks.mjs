/**
 * No data/ record may be compiled into a browser chunk, except the few
 * scripts/build/client-bundle-guard.cjs allows.
 *
 * A table in a client chunk is only as fresh as the deploy that built it: a page rendered from
 * the live release still answered from the copy the last deploy compiled in -- a new event in
 * the stage browser's raw "other" group, an operator on /base's text heuristics, the whole
 * banner list and the 453 KB asset index shipped to pages that never rendered them -- until
 * somebody redeployed. This check used to name twelve such tables, and eleven others sat in
 * chunks unnoticed because nobody had listed them. It denies by default now: every data/ JSON
 * file is looked for in every chunk.
 *
 * Three checks share the allowlist. The webpack guard (client-bundle-guard.cjs) fails the
 * build on any data/ module in the browser compilation and names the import chain.
 * scripts/tests/test-client-game-tables.ts walks each page's browser imports from the source,
 * in `npm test`. This one reads what `next build` actually emitted (postbuild, so CI and every
 * deploy build run it): webpack writes a JSON module as JSON.parse('<the file's JSON>'), so a
 * chunk that carries a table carries runs of the file's own text, and those are what it looks
 * for. A file too small or too repetitive to yield three distinctive runs cannot be recognised
 * this way; the webpack guard, which sees module paths, is what covers it.
 *
 * Run after a build:  npm run check:client-chunks
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { CLIENT_ALLOWED, CLIENT_ALLOWED_EDGES } = createRequire(import.meta.url)('../build/client-bundle-guard.cjs');

const SAMPLES = 12;
const WIDTH = 48;
const MIN_RUNS = 3;

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

/** Every data/ JSON file under `root`, relative and sorted. */
export function dataTables(root) {
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const at = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(at) : entry.name.endsWith('.json') ? [at] : [];
  });
  return walk(path.join(root, 'data')).map(file => path.relative(root, file).split(path.sep).join('/')).sort();
}

/** The pages a table may appear in: everywhere (null), some pages, or none. */
function allowedPages(table, allowed, edges) {
  if (Object.hasOwn(allowed, table)) return null;
  return edges[table]?.pages ?? [];
}

/**
 * Every (table, chunk) the build emitted that it should not have.
 * `chunks` are { file, text } relative to .next/; `pagesOf(file)` names the pages whose
 * initial load includes that chunk (none for a lazily loaded one). `tables` defaults to every
 * data/ JSON file. Returns the leaks and the tables too small to recognise.
 *
 * Built as one index of runs rather than a search per table: there are thousands of data
 * files, and each chunk is read once, window by window, against all of their runs.
 */
export function findTablesInChunks({ root, chunks, pagesOf, tables = dataTables(root), allowed = CLIENT_ALLOWED, edges = CLIENT_ALLOWED_EDGES }) {
  const owners = new Map(); // run -> tables
  const need = new Map(); // table -> how many of its runs a chunk must hold
  const unrecognisable = [];
  for (const table of tables) {
    const runs = fingerprints(JSON.parse(fs.readFileSync(path.join(root, table), 'utf8')));
    if (runs.length < MIN_RUNS) { unrecognisable.push(table); continue; }
    need.set(table, Math.ceil((runs.length * 2) / 3));
    for (const run of runs) owners.set(run, [...(owners.get(run) ?? []), table]);
  }
  const leaks = [];
  for (const { file, text } of chunks) {
    const seen = new Map(); // table -> runs found
    const found = new Set();
    for (let at = 0; at + WIDTH <= text.length; at++) {
      const run = text.slice(at, at + WIDTH);
      const tablesOf = owners.get(run);
      if (!tablesOf || found.has(run)) continue;
      found.add(run);
      for (const table of tablesOf) seen.set(table, (seen.get(table) ?? 0) + 1);
    }
    for (const [table, count] of seen) {
      if (count < need.get(table)) continue;
      const pagesAllowed = allowedPages(table, allowed, edges);
      if (pagesAllowed === null) continue;
      const pages = pagesOf(file);
      if (pages.length && pages.every((page) => pagesAllowed.includes(page))) continue;
      leaks.push({ table, file, pages });
    }
  }
  return { leaks: leaks.sort((a, b) => a.table.localeCompare(b.table) || a.file.localeCompare(b.file)), unrecognisable };
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
  const tables = dataTables(root);
  return { chunks: chunks.length, tables: tables.length, ...findTablesInChunks({ root, chunks, tables, pagesOf: (file) => owners.get(file) ?? [] }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const { chunks, tables, leaks, unrecognisable } = checkClientChunks(root);
  if (leaks.length) {
    console.error(`${leaks.length} data/ table(s) compiled into browser chunks:`);
    for (const { table, file, pages } of leaks) console.error(`  ${table} in ${file} (${pages.length ? pages.join(', ') : 'loaded lazily'})`);
    console.error('\nRead the table from the page props (lib/content/tables.mjs), not from data/, in browser code. The allowed few are in scripts/build/client-bundle-guard.cjs.');
    process.exit(1);
  }
  console.log(`No data/ table in ${chunks} browser chunks (${tables - unrecognisable.length} of ${tables} tables recognisable; the webpack guard covers the ${unrecognisable.length} too small to fingerprint).`);
}
