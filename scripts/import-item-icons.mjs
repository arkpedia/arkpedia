#!/usr/bin/env node
/**
 * Copies the item icons the stage drops reference out of the CN resource repo into
 * public/item-icons/, and writes data/item-icons.json mapping the gamedata item id
 * to the file name.
 *
 * TWO NAMING SCHEMES, and this step must not choose between them. The CN repo's
 * item/ tree names EVENT TOKEN icons after the gamedata item id
 * ("act43side_token_phantom.png"), which is the id a drop record carries. It does
 * NOT hold the core material icons: there is no 2001.png anywhere in it. Those
 * arrived slug-named ("drill_battle_record.png") from a source this repo no longer
 * pulls, and they are committed under public/item-icons/.
 *
 * So this is ADDITIVE. It keeps every mapping whose file is still in the repo and
 * adds whatever it can newly source. Rebuilding the map from scratch is what it
 * used to do, and that silently dropped 129 material icons the moment the old
 * source went away -- a refresh should not be able to delete data it cannot
 * reproduce.
 *
 * Operator drops are not here: those are first-clear operator rewards and use
 * the operator's own portrait, resolved through lib/operators/operatorIcon.ts.
 *
 * Re-run after regenerating the dataset:  node scripts/import-item-icons.mjs
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const upstream = process.env.ARKPEDIA_CN || '.cache/upstream/cn-resource';
// No manifest needed: the resource repo names item icons by the gamedata item id,
// which is the id a drop record already carries.
const outDir = path.join(root, 'public', 'item-icons');
const stagesDir = path.join(root, 'data', 'stages');

const wanted = new Map(); // item id -> display name
for (const file of fs.readdirSync(stagesDir)) {
  if (!file.endsWith('.json')) continue;
  const rec = JSON.parse(fs.readFileSync(path.join(stagesDir, file), 'utf-8'));
  for (const drop of rec.drops || []) {
    const item = drop.item;
    if (item && !item.is_operator) wanted.set(item.id, item.name);
  }
}

fs.mkdirSync(outDir, { recursive: true });

// Start from what is already committed, keeping only entries whose file survives.
const mapFile = path.join(root, 'data', 'item-icons.json');
const existing = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, 'utf-8')) : {};
const map = {};
let kept = 0;
for (const [id, file] of Object.entries(existing)) {
  if (fs.existsSync(path.join(outDir, file))) { map[id] = file; kept++; }
}
const added = [];
const missing = [];
for (const [id, name] of wanted) {
  if (map[id]) continue;                       // already have one; leave it alone
  const src = path.join(upstream, 'item', `${id}.png`);
  if (!fs.existsSync(src)) {
    missing.push(`${id} (${name})`);
    continue;
  }
  added.push(id);
  const base = `${id}.png`;
  fs.copyFileSync(src, path.join(outDir, base));
  map[id] = base;
}

// Sorted, so the file does not churn on iteration order.
const ordered = Object.fromEntries(Object.keys(map).sort().map((id) => [id, map[id]]));
fs.writeFileSync(mapFile, JSON.stringify(ordered, null, 0));
console.log(`${Object.keys(ordered).length} item icons (${kept} already in the repo, ${added.length} newly copied)`);
console.log(`${missing.length} drop items have no icon in either source (furniture and event coins, mostly)`);
if (missing.length) console.log('  e.g. ' + missing.slice(0, 5).join(', '));
