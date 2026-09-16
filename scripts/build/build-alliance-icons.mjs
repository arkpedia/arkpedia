#!/usr/bin/env node
/**
 * Builds public/alliance-icons/ -- one small webp per Stronghold Protocol alliance,
 * plus the mode's Funds icon.
 *
 * ONE SOURCE: prts.wiki, keyed by the gamedata's own bond id.
 *
 * It used to be two, and the second one was wrong. First choice was
 * arknights.wiki.gg's "<Name> Alliance.png" at 45px, and anything it did not have
 * fell back to the NATION's emblem out of public/faction-icons/. Siracusa and
 * Kazimierz arrived with Alliance Part 2, the wiki had no badge for either, so both
 * shipped wearing their country's coat of arms -- and Kazimierz's mode badge is not
 * its national emblem at all. The nation shows a plumed knight's helm; the mode
 * shows a crossed lance over a banner. Two different symbols, and the page showed
 * the wrong one, in a heavier style than the twenty-one beside it. kukki spotted it.
 *
 * prts.wiki mirrors CN, which has run Part 2 since March, and files every badge as
 * "<mode>_icon_<bondId>.png" at 110-132px -- all 23, keyed by the id the gamedata
 * itself uses, so there is no name to guess and no spelling to drift. For the
 * alliances the EN wiki DID have, the art agrees: Yan's 45px chip and prts's 110px
 * file are the same dragon. So this is the same set, at more than twice the size,
 * from one place.
 *
 * The nation-emblem fallback is GONE rather than demoted. A national emblem standing
 * in for a mode badge is not a degraded version of the right answer, it is a
 * different answer, and it shipped for weeks because nothing said so out loud. An
 * alliance this cannot source is now reported loudly and its file left alone -- the
 * script has never deleted a file it did not write, which is what protects the
 * hand-captures keyed in by scripts/import-alliance-icons.py.
 *
 * Needs curl, dwebp and cwebp on PATH (brew install webp), and python3 with PIL for
 * the letterboxing -- prts's files are not all square (Yan's is 110x98) and cwebp's
 * -resize stretches rather than pads.
 *
 *   node scripts/build/build-alliance-icons.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'public/alliance-icons';
const TMP = join(process.env.TMPDIR || '/tmp', 'arkpedia-alliance-icons');
const API = 'https://arknights.wiki.gg/api.php';
const CN_API = 'https://prts.wiki/api.php';
const CN_MODE = '卫戍协议：盟约';
const UA = 'ArkpediaBot/1.0 (https://arkpedia.net)';
/* One box for all of them, so the set reads as one set. Nothing renders these
   above 32, and prts's sources are 110-132, so 96 is a 3x buffer and still
   smaller than the two 96px strays this replaces. */
const BOX = 96;
const ACTIVITY = '.cache/activity_table.json';

/** ASCII, kebab-case: /_next/image returns 400 on non-ASCII filenames, and "Ægir"
 *  would be exactly that trap. */
const slug = (name) => name
  .toLowerCase()
  .replace(/æ/g, 'ae')
  .replace(/ø/g, 'o')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const curl = (args) => execFileSync('curl', ['-sS', '-A', UA, ...args]);

function api(params) {
  const url = new URL(API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return JSON.parse(curl(['-G', url.toString()]).toString());
}

/** name -> direct file url, for the wiki files that exist. */
function wikiIcons(titles) {
  const found = new Map();
  // The API takes 50 titles per call.
  for (let i = 0; i < titles.length; i += 40) {
    const batch = titles.slice(i, i + 40);
    const res = api({
      action: 'query', prop: 'imageinfo', iiprop: 'url', format: 'json',
      titles: batch.map((t) => `File:${t}`).join('|'),
    });
    for (const page of Object.values(res.query.pages)) {
      if (page.missing !== undefined) continue;
      found.set(page.title.replace(/^File:/, ''), page.imageinfo[0].url);
    }
  }
  return found;
}

/** prts file title -> direct url, in one call. */
function cnIcons(titles) {
  const url = new URL(CN_API);
  for (const [k, v] of Object.entries({
    action: 'query', prop: 'imageinfo', iiprop: 'url', format: 'json',
    titles: titles.map((t) => `File:${t}`).join('|'),
  })) url.searchParams.set(k, v);
  const res = JSON.parse(curl(['-G', url.toString()]).toString());
  const found = new Map();
  for (const page of Object.values(res.query?.pages ?? {})) {
    if (page.missing !== undefined || !page.imageinfo) continue;
    /* prts returns the title with underscores as spaces and a localised File:
       namespace, so match on the bond id rather than on the whole title. */
    const id = String(page.title).split('icon ').pop().replace(/\.png$/, '');
    found.set(id, page.imageinfo[0].url);
  }
  return found;
}

/**
 * Download, letterbox to a square, write webp.
 *
 * Padded rather than stretched: Yan's badge is 110x98 and cwebp's -resize would
 * squash it 12% narrower than the game draws it.
 */
function fetchBadge(url, out, square = true) {
  const png = join(TMP, 'download.png');
  curl(['-o', png, url]);
  /* Funds is not a badge: it is a wide currency glyph, 63x35, and the component
     draws it at 18x10. Padding it into a square and handing that to an 18x10 box
     squashes it by nearly half. Only the 23 alliance badges get letterboxed. */
  if (!square) {
    execFileSync('cwebp', ['-quiet', '-q', '90', png, '-o', out]);
    return true;
  }
  const squarePng = join(TMP, 'square.png');
  execFileSync('python3', ['-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA')
side = max(im.size)
canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)
canvas.resize((${BOX}, ${BOX}), Image.LANCZOS).save(sys.argv[2])
`, png, squarePng], { stdio: 'pipe' });
  execFileSync('cwebp', ['-quiet', '-q', '90', squarePng, '-o', out]);
  return true;
}

// ---------------------------------------------------------------------------

const alliances = JSON.parse(readFileSync('data/gamemodes/stronghold/alliances.json', 'utf8'));
const operators = JSON.parse(readFileSync('data/gamemodes/stronghold/stronghold_operators.json', 'utf8'));

const kind = new Map(alliances.map((a) => [a.alliance, a.alliance_type]));
// Alliances that only show up on operators (Arcane, today) still want an icon.
for (const op of operators) for (const a of op.alliances) if (!kind.has(a)) kind.set(a, 'Add-on');
const names = [...kind.keys()].sort();

/**
 * name -> bond id, from the running season's own bondInfoDict.
 *
 * The id is what prts files these under, and taking it from the gamedata means a
 * new alliance needs no code change here and no name to be spelled twice.
 */
if (!existsSync(ACTIVITY)) {
  throw new Error(`${ACTIVITY} is not cached. Run scripts/build/build-stronghold-data.mjs first.`);
}
const table = JSON.parse(readFileSync(ACTIVITY, 'utf8'));
const seasons = table.activity?.AUTOCHESS_SEASON ?? {};
const now = Math.floor(Date.now() / 1000);
const dated = Object.keys(seasons).map((id) => ({ id, start: table.basicInfo?.[id]?.startTime ?? 0 }));
const running = dated.find((sn) => {
  const b = table.basicInfo?.[sn.id];
  return b && b.startTime <= now && now <= b.endTime;
}) ?? dated.sort((a, b) => b.start - a.start)[0];
const bondOf = new Map(Object.entries(seasons[running.id]?.bondInfoDict ?? {})
  .map(([id, b]) => [b.name, id]));

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });
const before = new Set(readdirSync(OUT));

const cn = cnIcons(names.filter((n) => bondOf.has(n)).map((n) => `${CN_MODE}_icon_${bondOf.get(n)}.png`));
/* Only for Funds, which prts files under a different scheme. */
const wiki = wikiIcons(['Stronghold Protocol Funds.png']);

const written = [];
const missing = [];
for (const name of names) {
  const out = join(OUT, `${slug(name)}.webp`);
  const bond = bondOf.get(name);
  const url = bond ? cn.get(bond) : null;
  if (url && fetchBadge(url, out)) written.push([name, slug(name), `prts ${bond}`]);
  else missing.push(name);
}

const funds = wiki.get('Stronghold Protocol Funds.png');
if (funds) {
  fetchBadge(funds, join(OUT, 'funds.webp'), false);
  written.push(['Funds', 'funds', 'wiki.gg']);
}

rmSync(TMP, { recursive: true, force: true });

for (const [name, s, how] of written) console.log(`  ${name.padEnd(18)} -> ${s}.webp  (${how})`);
console.log(`\n${written.length} icons written to ${OUT}/`);

// Anything already there that this run did not produce -- the hand-keyed captures, or
// an alliance the data dropped. Reported, never removed.
const mine = new Set(written.map(([, s]) => `${s}.webp`));
const others = [...before].filter((f) => !mine.has(f));
if (others.length) console.log(`left alone (not from a source this builds): ${others.join(', ')}`);
if (missing.length) {
  const have = missing.filter((n) => before.has(`${slug(n)}.webp`));
  const gone = missing.filter((n) => !before.has(`${slug(n)}.webp`));
  if (have.length) console.log(`no fetchable source for: ${have.join(', ')} -- already keyed from a capture`);
  if (gone.length) console.log(`NO ICON AT ALL for: ${gone.join(', ')} -- the page falls back to a monogram`);
}
