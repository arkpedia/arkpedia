#!/usr/bin/env node
/**
 * Writes data/item-sort-ids.json: the game's own depot ordering, as a number per
 * material.
 *
 * item_table gives every item a sortId, and that sortId IS the depot screen's order --
 * LMD 10201, Pure Gold 10202, the certificates 10203/4/5, and so on down. It was
 * checked against a transcription of a real depot before this script existed: 96 of
 * the 96 materials that have a sortId came out in exactly the same order. The two the
 * transcription could not show, because the player did not happen to hold them, are
 * placed by it correctly -- Originium Shard at 10003, above LMD, and Recruitment Permit
 * at 40012, between the certificates and the battle records.
 *
 * Only materials the site has art for, which is the same set the depot can hold. That
 * keeps this to a hundred-odd numbers rather than the four thousand items in the table.
 *
 * Re-run after an upstream refresh:  node scripts/build-ingame-order.mjs
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const upstream = process.env.ARKPEDIA_EN || '.cache/upstream/en-gamedata';
const tablePath = path.join(upstream, 'en', 'gamedata', 'excel', 'item_table.json');
if (!fs.existsSync(tablePath)) {
  console.error(
    `Missing ${tablePath}.\nRun scripts/refresh-stage-data.sh to populate .cache/upstream, ` +
    'or point ARKPEDIA_EN at a checkout of ArknightsAssets/ArknightsGamedata.',
  );
  process.exit(1);
}

const items = JSON.parse(fs.readFileSync(tablePath, 'utf-8')).items;

/**
 * Where this repo's name for a material differs from the game's.
 *
 * One entry, and it is a plural: the game calls it "Information Fragments", the site
 * has always called it "Information Fragment", and the icon on disk is filed under the
 * singular. Renaming the material to match would touch the sort order, the groups and
 * a committed image for the sake of an s.
 */
const ALIASES = { 'Information Fragment': 'Information Fragments' };

const sortIdByName = new Map();
for (const item of Object.values(items)) {
  /* First wins. A handful of names are reused by event reprints, and the original is
     the one with the lower id and the real place in the depot. */
  if (typeof item.sortId === 'number' && !sortIdByName.has(item.name)) {
    sortIdByName.set(item.name, item.sortId);
  }
}

const iconDir = path.join(root, 'public', 'material-icons');
const stems = fs.readdirSync(iconDir).map((f) => path.parse(f).name);

const out = {};
const unmatched = [];
for (const stem of stems.sort()) {
  const id = sortIdByName.get(ALIASES[stem] ?? stem);
  if (id === undefined) unmatched.push(stem);
  else out[stem] = id;
}

if (!Object.keys(out).length) {
  console.error('Refusing to write an empty map: no material icon matched an item in item_table.');
  process.exit(1);
}

const dest = path.join(root, 'data', 'item-sort-ids.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${Object.keys(out).length} sort ids -> ${path.relative(root, dest)}`);
/* Reported, not fatal. public/material-icons/ holds furniture and event tokens that
   were never planner materials; a name in there with no item_table entry is expected.
   What matters is that nothing in MATERIAL_SORT_ORDER is missing, which the planner
   asserts at build time where it can see that list. */
if (unmatched.length) {
  console.log(`  ${unmatched.length} icon(s) with no item_table entry, which is normal for furniture and event tokens:`);
  for (const n of unmatched) console.log(`    ${n}`);
}
