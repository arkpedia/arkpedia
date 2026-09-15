#!/usr/bin/env node
/**
 * Writes data/supply-stages.json: which permanent supply stage drops which material.
 *
 * The farming guide next door is a curated list of BUILD materials with the efficient
 * stage for each, and it deliberately stops there. It has no entry for a Purchase
 * Certificate, a Skill Summary or a battle record -- none of those is a material an
 * operator costs, and two of them are currencies -- so the planner had nothing to say
 * about where they come from beyond "no listed source".
 *
 * They all come from the permanent supply stages, and data/stages.json already records
 * exactly which. So this derives the map rather than restating it: no hand-typed stage
 * code to transpose, and it narrows per material instead of per family, which matters.
 * CA-1 through CA-5 all drop a Skill Summary, but only CA-4 and CA-5 drop a volume 3 --
 * a hand-written "CA-1 to CA-5" against Skill Summary - 3 would have sent a reader to a
 * stage that cannot give them one.
 *
 * Only GUARANTEED drops count. A supply stage's whole point is that it always pays, and
 * a rare side drop is not a reason to run one.
 *
 * Re-run after the stage dataset changes:  node scripts/build-supply-stages.mjs
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();

/**
 * The permanent supply families, and nothing else.
 *
 * Not every stage that drops a thing -- that would be the whole game, and a list of
 * ninety places to find an Orirock is not advice. These five are the stages that exist
 * precisely to hand out one resource: LS for EXP, CE for LMD, AP for certificates, CA
 * for skill summaries, SK for building materials.
 */
const FAMILIES = /^(LS|CE|AP|CA|SK)-([A-Z0-9]+)$/;

const stages = JSON.parse(fs.readFileSync(path.join(root, 'data', 'stages.json'), 'utf-8'));

const byMaterial = new Map();
for (const stage of stages) {
  if (!stage || typeof stage !== 'object') continue;
  const code = stage.code;
  if (typeof code !== 'string' || !FAMILIES.test(code)) continue;
  const regular = stage.drops?.regular;
  if (!Array.isArray(regular)) continue;
  for (const drop of regular) {
    if (!drop || drop.kind !== 'item' || drop.badge !== 'Guaranteed') continue;
    const list = byMaterial.get(drop.name);
    if (list) list.push(code);
    else byMaterial.set(drop.name, [code]);
  }
}

/* Best first. Within a family the later stage is the efficient one -- CA-5 gives more
   summaries per run than CA-1 -- so the codes go in descending order and a UI showing
   only the first two or three shows the two or three worth running. */
const rank = (code) => {
  const [, , suffix] = FAMILIES.exec(code);
  const n = Number(suffix);
  return Number.isFinite(n) ? n : suffix.charCodeAt(0);
};

const out = {};
for (const name of [...byMaterial.keys()].sort()) {
  out[name] = byMaterial.get(name).sort((a, b) => rank(b) - rank(a) || a.localeCompare(b));
}

if (!Object.keys(out).length) {
  console.error('Refusing to write an empty map: no supply stage in data/stages.json had a guaranteed item drop.');
  process.exit(1);
}

const dest = path.join(root, 'data', 'supply-stages.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
console.log(
  `Wrote ${Object.keys(out).length} materials from the supply stages -> ${path.relative(root, dest)}`,
);
for (const [name, codes] of Object.entries(out)) console.log(`  ${name.padEnd(26)} ${codes.join(', ')}`);
