#!/usr/bin/env node
// Copies pages of the LIVE content release into this folder, for
// scripts/tests/test-previous-release-props.ts. GET requests only.
//
//   node scripts/tests/fixtures/previous-release/refresh.mjs                 the routes release.json lists
//   node scripts/tests/fixtures/previous-release/refresh.mjs /gacha /skins   adds routes to the list
//
// Why: a deploy renders against the live release, and right after one that release is still
// the one the PREVIOUS code compiled (scripts/content/deploy-gate.mjs holds the next until
// production runs the new code). A branch that changes a page's props has to render the live
// release's props too. Refresh this folder on such a branch, before changing the pages, so
// the fixtures are the release production will serve the new code on its first day; list
// every content route whose page or props builder the branch touches.
//
// Each page is stored exactly as the release published it (not compressed: npm test may not
// import zlib, scripts/tests/test-payload-budgets.ts), and release.json records the
// manifest's sha256 and size for it: the test refuses a fixture that is not byte for byte
// the release's file. release.json also lists every route the release publishes (`routes`),
// so the test knows which content routes of this checkout the release lacks: each of those
// renders from bundled data, at build and, only if its page opts in (withContentPage's
// bundledWhenUnpublished), at runtime on Vercel as well. A listed route the release does not
// publish gets no fixture.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentFileUrlPath } from '../../../../lib/content/pagePaths.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(HERE, 'release.json');
const ORIGIN = 'https://raw.githubusercontent.com/arkpedia/arkpedia-data';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

/** The fixture's file name: the route with its slashes as dashes ('/' is index). */
function fixtureName(route) {
  return `${route === '/' ? 'index' : decodeURIComponent(route.slice(1)).replace(/[^A-Za-z0-9_-]+/g, '-')}.json`;
}

const before = fs.existsSync(INDEX) ? JSON.parse(fs.readFileSync(INDEX, 'utf8')) : { pages: {} };
const routes = [...new Set([...Object.keys(before.pages), ...process.argv.slice(2)])].sort();
if (!routes.length) throw new Error('Name at least one content route.');

const pointer = JSON.parse((await get(`${ORIGIN}/live/current.json`)).toString());
const base = `${ORIGIN}/${pointer.revision}/release`;
const manifestBytes = await get(`${base}/manifest.json`);
if (sha256(manifestBytes) !== pointer.manifestSha256) throw new Error('The live manifest does not match its pointer.');
const manifest = JSON.parse(manifestBytes.toString());

const index = { release: pointer.release, revision: pointer.revision, generator: manifest.generator, generatedAt: manifest.generatedAt,
  manifestSha256: pointer.manifestSha256, pages: {}, routes: Object.keys(manifest.pages).sort() };
const unpublished = [];
for (const route of routes) {
  const file = manifest.pages[route];
  if (!file) { unpublished.push(route); continue; }
  const bytes = await get(`${base}/${contentFileUrlPath(file.path)}`);
  if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) throw new Error(`${route}: the page does not match the manifest.`);
  const name = fixtureName(route);
  fs.writeFileSync(path.join(HERE, name), bytes);
  index.pages[route] = { file: name, bytes: file.bytes, sha256: file.sha256 };
}
// A fixture no route names any more goes, so the folder is exactly the list.
const kept = new Set(Object.values(index.pages).map((page) => page.file));
for (const name of fs.readdirSync(HERE)) {
  if (name.endsWith('.json') && name !== 'release.json' && !kept.has(name)) fs.rmSync(path.join(HERE, name));
}
fs.writeFileSync(INDEX, `${JSON.stringify(index, null, 2)}\n`);
console.log(`release ${pointer.release.slice(0, 12)} (revision ${pointer.revision.slice(0, 12)}, compiled by ${String(manifest.generator).slice(0, 12)}): ${Object.keys(index.pages).length} page(s) of ${index.routes.length}${unpublished.length ? `, not published: ${unpublished.join(' ')}` : ''}`);
