/**
 * Which files in a checkout are game records: everything under data/ (JSON, and lyrics as
 * LRC) plus a few public/*.json the browser fetches as files. None of them is committed here;
 * scripts/content/pull-data.mjs fills them from arkpedia-data, the content release's stages
 * rewrite them, and scripts/content/export.mjs publishes them. .gitignore lists the same
 * public files (scripts/tests/test-data-records.ts holds the two together).
 */
import fs from 'node:fs';
import path from 'node:path';

/** public/*.json records. A stage that adds one adds it here. */
export const PUBLIC_RECORDS = [
  'public/enemies-index.json',
  'public/medal-catalogue.json',
  'public/operator-deploy.json',
  'public/stages-index.json',
];

/** Files under data/ that are not records: local reports and outputs built from the records. */
export const NOT_RECORDS = new Set([
  'data/README.md',
  'data/stage-report.json',
  'data/optimizer-results.json',
  'data/whole-base-optimizer-results.json',
  'data/selector-catalogue.json',
]);

const walk = dir => !fs.existsSync(dir) ? [] : fs.readdirSync(dir, { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);

/** The record files present under `root`, as repository-relative paths with forward slashes. */
export function recordFiles(root = process.cwd()) {
  const rel = file => path.relative(root, file).split(path.sep).join('/');
  const data = walk(path.join(root, 'data')).map(rel)
    .filter(file => !NOT_RECORDS.has(file) && (file.endsWith('.json') || /^data\/lyrics\/[^/]+\.lrc$/.test(file)));
  return [...data, ...PUBLIC_RECORDS.filter(file => fs.existsSync(path.join(root, file)))].sort();
}
