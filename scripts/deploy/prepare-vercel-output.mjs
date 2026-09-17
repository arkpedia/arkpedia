import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, '.vercel/output');
const functions = path.join(output, 'functions');
const staticRoot = path.join(output, 'static');

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const at = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(at) : [at];
  });
}

function isInvalidFunctionMapping(source) {
  if (source === '.env.example' || source === 'data/survey/poll_raw_export_clean.csv') return true;
  if (!source.startsWith('public/')) return false;
  return fs.existsSync(path.join(staticRoot, source.slice('public/'.length)));
}

const configs = walk(functions).filter(file => file.endsWith('.vc-config.json'));
if (!configs.length) throw new Error('No Vercel function configs found; run `vercel build` first.');

let removed = 0;
for (const file of configs) {
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!config.filePathMap) continue;
  let changed = false;
  for (const source of Object.keys(config.filePathMap)) {
    if (!isInvalidFunctionMapping(source)) continue;
    delete config.filePathMap[source];
    removed += 1;
    changed = true;
  }
  if (changed) fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}

console.log(`Prepared Vercel output: removed ${removed} invalid function file mappings; static files remain intact.`);
