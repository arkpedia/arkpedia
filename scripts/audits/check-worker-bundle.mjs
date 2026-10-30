import fs from 'node:fs';
import path from 'node:path';

/*
 * The Worker's server bundle, after `npm run cf:build` (docs/development/cloudflare-workers.md).
 * OpenNext puts every page, API route and table the server build compiles into one file,
 * handler.mjs, and a fresh isolate loads all of it before it answers: 0.4-0.9 s of a slow first
 * byte on 2026-10-23, at 36.6 MB. 26.7 MB of that was data tables, 9 MB of those a second copy
 * the API routes' build held for dev-only fallbacks, and 2 MB was the browser-only account-import
 * transport. Without those, the voice lines and /operators/[name]'s tables it is 17.4 MB.
 */
// 17.03 MB on 2026-10-30, once regional-schedules.json (3.45 MB) moved to the Worker's static
// files (lib/content/shippedTable.ts). Builds bundle the live release's records (#883), which grow
// with every release: a table that pushes past this moves to the static files the same way rather
// than the ceiling rising. Kept narrow around the measurement.
const BUDGET_BYTES = 18_000_000;
/** Browser-only packages: next.config.js keeps them out of the server build. */
const BROWSER_ONLY = [/\/node_modules\/libcurl\.js\//];

const root = process.cwd();
const dir = path.join(root, '.open-next/server-functions/default');
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'handler.mjs.meta.json'), 'utf8'));
const output = meta.outputs['.open-next/server-functions/default/handler.mjs'];
if (!output) throw new Error('handler.mjs.meta.json has no handler.mjs output');

const inputs = Object.entries(output.inputs).map(([file, { bytesInOutput }]) => ({ file, bytes: bytesInOutput }));
const mb = bytes => `${(bytes / 1e6).toFixed(2)} MB`;
const largest = inputs.sort((a, b) => b.bytes - a.bytes).slice(0, 12)
  .map(({ file, bytes }) => `  ${mb(bytes).padStart(9)}  ${file.replace('.open-next/server-functions/default/', '')}`).join('\n');

const problems = [];
if (output.bytes > BUDGET_BYTES) problems.push(`handler.mjs is ${mb(output.bytes)}, over its ${mb(BUDGET_BYTES)} budget.`);
for (const { file } of inputs) {
  if (BROWSER_ONLY.some(pattern => pattern.test(file))) problems.push(`${file} is browser-only and is in the server bundle.`);
}
if (problems.length) {
  console.error(`${problems.join('\n')}\nLargest parts (a table a page imports is in its chunk):\n${largest}`);
  process.exit(1);
}
console.log(`Worker bundle: handler.mjs is ${mb(output.bytes)} (budget ${mb(BUDGET_BYTES)}).`);
