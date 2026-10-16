#!/usr/bin/env node
/**
 * Fills gaps in public/branch-icons/ -- one small webp per operator branch.
 *
 * WHY THIS EXISTS. The folder had 71 of the 72 branches the site's own operator
 * data uses, and the missing one was Supportive Ranger: Pedro's branch, which
 * showed a broken-image square in the roster's branch filter. Nothing reported
 * it, because `getBranchIconPath` builds a path out of a name and returns it
 * whether the file is there or not -- a miss is a 404 that renders as a blank
 * box. And there was no script: the 71 arrived in one undated batch with no
 * record of where from, so the only way to add the 72nd was to work it out
 * again. The next CN-only branch would have cost the same hunt.
 *
 * WHERE THE ART COMES FROM. prts.wiki, which mirrors CN and files all 72 as
 * "职业分支图标_<CN branch name>.png" at 60-70px. Neither asset mirror has a
 * ui/ tree, and arknights.wiki.gg cannot help for a branch global has not
 * shipped -- Supportive Ranger is absent from the EN uniequip_table entirely,
 * which is exactly why it was the one missing.
 *
 * NOTHING IS HAND-MAPPED. The chain from our English branch name to a Chinese
 * filename is derived end to end:
 *
 *   operator record -> internalName (the charId)
 *     -> CN character_table[charId].subProfessionId       ("supportiveranger")
 *     -> CN uniequip_table.subProfDict[id].subProfessionName   ("游击手")
 *     -> prts "职业分支图标_游击手.png"
 *
 * so a branch that does not exist upstream cannot be invented here, and a
 * renamed one fails loudly instead of silently fetching the wrong glyph.
 *
 * ONLY THE MISSING ONES, by default. Branch icon URLs carry no content stamp,
 * and next.config.js serves every image under /public as `immutable` for a
 * year -- so re-encoding a file that already exists would change its bytes
 * under a URL no browser will ask about again. Pass --all to redo the lot, and
 * only when you mean it.
 *
 * Needs curl and cwebp on PATH (brew install webp), and python3 with PIL.
 *
 *   node scripts/build/build-branch-icons.mjs [--all]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import path from 'node:path';

const OUT = 'public/branch-icons';
const TMP = join(process.env.TMPDIR || '/tmp', 'arkpedia-branch-icons');
const CACHE = path.resolve(import.meta.dirname, '../..', '.cache');
const CN_API = 'https://prts.wiki/api.php';
const CN_PREFIX = '职业分支图标';
const UA = 'ArkpediaBot/1.0 (https://arkpedia.net)';
/** The larger side, matching the 71 already here: 47 are 48 tall, 46 are 48 wide. */
const BOX = 48;

const all = process.argv.includes('--all');
const curl = (args) => execFileSync('curl', ['-sS', '--max-time', '60', '-A', UA, ...args]);

function cached(name, url) {
  const at = join(CACHE, name);
  if (!existsSync(at)) {
    console.log(`  fetching ${name}`);
    mkdirSync(CACHE, { recursive: true });
    curl(['-L', '-o', at, url]);
  }
  return JSON.parse(readFileSync(at, 'utf8'));
}

// --- our own branches, and the operator that carries each ------------------

const operators = [];
for (const dir of readdirSync('data').filter((d) => /^operators-\d?star$|^operators-\dstar$/.test(d))) {
  for (const f of readdirSync(join('data', dir)).filter((f) => f.endsWith('.json'))) {
    operators.push(JSON.parse(readFileSync(join('data', dir, f), 'utf8')));
  }
}
/** branch -> the charId of one operator in it, which is the key to everything. */
const carrier = new Map();
for (const op of operators) {
  if (op.branch && op.internalName && !carrier.has(op.branch)) carrier.set(op.branch, op.internalName);
}
const branches = [...carrier.keys()].sort();

// --- branch -> CN name, entirely derived ----------------------------------

const cnChars = cached('cn_character_table.json',
  'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/character_table.json');
/**
 * Amiya's class forms are in NEITHER character_table, CN or EN.
 *
 * They live in char_patch_table's `patchChars`, shaped like a character_table
 * entry, and Incantation Medic is carried by exactly one operator on this site:
 * char_1037_amiya3, her Medic form. So the branch resolved to nothing and the
 * run exited 1 over a branch whose icon was already on disk. Merged in rather
 * than special-cased, because the patch table is where the game keeps every
 * class form and there will be more of them.
 */
const cnPatch = cached('cn_char_patch_table.json',
  'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/char_patch_table.json');
Object.assign(cnChars, cnPatch.patchChars ?? {});
const cnEquip = cached('cn_uniequip_table.json',
  'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/uniequip_table.json');
const subProf = cnEquip.subProfDict ?? {};

const cnNameOf = new Map();
const unresolved = [];
for (const branch of branches) {
  const charId = carrier.get(branch);
  const subId = cnChars[charId]?.subProfessionId;
  const cn = subId ? subProf[subId]?.subProfessionName : null;
  if (cn) cnNameOf.set(branch, cn);
  else unresolved.push(`${branch} (via ${charId}${subId ? ` -> ${subId}` : ''})`);
}

// --- fetch ----------------------------------------------------------------

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const wanted = branches.filter((b) => all || !existsSync(join(OUT, `${b}.webp`)));
console.log(`${branches.length} branches, ${wanted.length} to fetch${all ? ' (--all)' : ' (missing only)'}`);

const titles = wanted.filter((b) => cnNameOf.has(b)).map((b) => `File:${CN_PREFIX}_${cnNameOf.get(b)}.png`);
const urls = new Map();
for (let i = 0; i < titles.length; i += 40) {
  if (!titles.length) break;
  const url = new URL(CN_API);
  for (const [k, v] of Object.entries({
    action: 'query', prop: 'imageinfo', iiprop: 'url', format: 'json',
    titles: titles.slice(i, i + 40).join('|'),
  })) url.searchParams.set(k, v);
  const res = JSON.parse(curl(['-G', url.toString()]).toString());
  for (const page of Object.values(res.query?.pages ?? {})) {
    if (page.missing !== undefined || !page.imageinfo) continue;
    /* prts hands back the title with underscores as spaces and a localised
       namespace, so key on the CN name rather than on the whole title. */
    urls.set(String(page.title).split(' ').pop().replace(/\.png$/, ''), page.imageinfo[0].url);
  }
}

const written = [];
const missing = [];
for (const branch of wanted) {
  const cn = cnNameOf.get(branch);
  const url = cn ? urls.get(cn) : null;
  if (!url) { missing.push(branch); continue; }
  const png = join(TMP, 'download.png');
  curl(['-o', png, url]);
  const out = join(TMP, 'scaled.png');
  /* Scaled on the LARGER side and never padded, which is what the 71 already
     here do: these sit inline beside a label, so a square canvas round a wide
     glyph would indent it away from its own text. */
  execFileSync('python3', ['-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA')
scale = ${BOX} / max(im.size)
im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS).save(sys.argv[2])
`, png, out], { stdio: 'pipe' });
  const dest = join(OUT, `${branch}.webp`);
  execFileSync('cwebp', ['-quiet', '-q', '90', out, '-o', dest]);
  written.push([branch, cn]);
}

rmSync(TMP, { recursive: true, force: true });

for (const [branch, cn] of written) console.log(`  ${branch.padEnd(22)} <- ${CN_PREFIX}_${cn}.png`);
if (unresolved.length) console.log(`\nno CN branch name for: ${unresolved.join(', ')}`);
if (missing.length) console.log(`\nprts has no file for: ${missing.join(', ')}`);
console.log(`\n${readdirSync(OUT).length} icons in ${OUT}/`);

/* Loud, because the whole point is that a gap here renders as a broken square
   and says nothing. */
if (unresolved.length || missing.length) process.exitCode = 1;
