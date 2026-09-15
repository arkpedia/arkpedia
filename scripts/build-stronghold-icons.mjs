#!/usr/bin/env node
/**
 * Builds the two folders of Stronghold Protocol art the mode has and this site does not:
 * public/stronghold-stratagems/, the badge beside each Defence Strategy, and
 * public/stronghold-items/, the icon on each piece of equipment.
 *
 * A strategy's leader is not always an operator: half of them are NPCs and enemy
 * commanders (Duck Lord, Goliath, "Damazti Cluster", Sciurus), so an operator portrait
 * cannot cover the list and matching each name against the enemy icons by hand gets
 * things like Quintus wrong. The mode draws its own badge for every one, and the place
 * that has all of them is the CN wiki.
 *
 * WHY prts.wiki AND NOT arknights.wiki.gg. The EN wiki has 30 of the 36 as
 * "File:<leader> stratagem.png" at 75px; the five Alliance Part 2 added are not uploaded
 * there yet, because an editor extracts these from the client by hand and Part 2 only
 * went global days ago. prts.wiki mirrors CN, which ran Part 2 in March, and files them
 * as "<mode>_策略发起人_<CN leader>.png" at 184px -- all 36, higher resolution, one
 * source. The catch is the key: the file is named in Chinese, so the CN leader name has
 * to come from the CN gamedata rather than be guessed. Neither asset mirror is any help
 * here; neither has a ui/ tree.
 *
 * ENEMY TYPES are the seven pools the mode draws its Tactical Training and bounty waves
 * from -- Flying, Frequency, Elements, Continuous, Invisible, Refraction, Special. Every
 * bounty row named after one of them shows that pool's glyph in game, and prts has all
 * seven as "特训敌人_<CN type>.png". The CN word comes out of the CN gamedata's own
 * enemyTypeDatas rather than a list here, so a new pool needs no code change.
 *
 * ITEMS come from the game itself. Every one is a trap whose id ends in a token name --
 * trap_1041_acarm041 -> acarm041 -- and yuanyan3060/ArknightsGameResource carries that
 * token's skill icon, which is the art the game puts on the item. All 59 have one,
 * including the three Arts. The wiki also has item pictures, but only for 43 and
 * without the frame, so mixing the two would look like two different sets.
 * build-stronghold-data.mjs writes the token name into each item's `icon`, so this
 * needs no second lookup.
 *
 * Needs curl and cwebp on PATH (brew install webp).
 *
 *   node scripts/build-stronghold-icons.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CACHE = resolve(import.meta.dirname, '..', '.cache');
const OUT = 'public/stronghold-stratagems';
const ITEMS_OUT = 'public/stronghold-items';
const TYPES_OUT = 'public/stronghold-types';
const TMP = join(process.env.TMPDIR || '/tmp', 'arkpedia-stronghold-icons');
const TOKENS = 'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/skill';
const API = 'https://arknights.wiki.gg/api.php';
const CN_API = 'https://prts.wiki/api.php';
// The mode's CN title, and the section of its file names that means "strategy initiator".
const CN_MODE = '卫戍协议：盟约';
const CN_STRATAGEM = '策略发起人';
const CN_RAW = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/activity_table.json';
const UA = 'ArkpediaBot/1.0 (https://arkpedia.net)';

/** ASCII, kebab-case: /_next/image answers 400 for a non-ASCII filename, and Qalaiša
 *  would be exactly that trap. Mirrored by stratagemSlug() in lib/gamemodes.
 *
 *  NFD alone is not enough. It decomposes an accent off a base letter, but a letter with
 *  a stroke through it is its own codepoint -- Młynar came out "m-ynar" until these were
 *  mapped. */
const LETTERS = { 'ł': 'l', 'đ': 'd', 'ƀ': 'b', 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'ð': 'd', 'þ': 'th' };
export const slug = (name) => name
  .toLowerCase()
  .replace(/[łđƀøæœßðþ]/g, (c) => LETTERS[c] || c)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const curl = (args) => execFileSync('curl', ['-sS', '-A', UA, ...args]);

function api(params) {
  const url = new URL(API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return JSON.parse(curl(['-G', url.toString()]).toString());
}

const strategies = JSON.parse(readFileSync('data/gamemodes/stronghold/strategies.json', 'utf8'));
const leaders = [...new Set(strategies.map((s) => s.leader))];

/** The gamedata quotes a couple of leaders and the wiki quotes them differently:
 *  'Damazti Cluster' there, "Damazti Cluster" in the file name. */
const titlesFor = (name) => [...new Set([
  name,
  name.replace(/['\u2018\u2019]/g, '"'),
  name.replace(/["'\u2018\u2019\u201c\u201d]/g, ''),
])];

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });
for (const f of readdirSync(OUT)) rmSync(join(OUT, f));

// name as the wiki spells it -> url, for every spelling worth trying
const wanted = leaders.flatMap((n) => titlesFor(n).map((t) => [t, n]));
const owner = new Map(wanted);
const found = new Map();
const titles = [...owner.keys()];
for (let i = 0; i < titles.length; i += 40) {
  const res = api({
    action: 'query', prop: 'imageinfo', iiprop: 'url', format: 'json',
    titles: titles.slice(i, i + 40).map((n) => `File:${n} stratagem.png`).join('|'),
  });
  for (const page of Object.values(res.query.pages)) {
    if (page.missing !== undefined) continue;
    const spelt = page.title.replace(/^File:/, '').replace(/ stratagem\.png$/, '');
    found.set(spelt, page.imageinfo[0].url);
  }
}
const urls = new Map();
for (const [spelt, url] of found) {
  const leader = owner.get(spelt);
  if (leader && !urls.has(leader)) urls.set(leader, url);
}

// --- prts.wiki, which has all of them and at more than twice the size ----------

/** EN leader -> CN leader, out of the CN gamedata's own band table. The two tables are
 *  keyed by the same bandId, so this needs no name matching and cannot drift. */
function cnLeaders() {
  const at = join(CACHE, 'cn_activity_table.json');
  if (!existsSync(at)) {
    console.log('  fetching the CN activity_table for the leader names');
    mkdirSync(CACHE, { recursive: true });
    execFileSync('curl', ['-sSL', '-A', UA, '-o', at, CN_RAW]);
  }
  const cn = JSON.parse(readFileSync(at, 'utf8')).autoChessData?.bandDataDict ?? {};
  const en = JSON.parse(readFileSync(join(CACHE, 'activity_table.json'), 'utf8'))
    .autoChessData?.bandDataDict ?? {};
  const byLeader = new Map();
  for (const [bandId, band] of Object.entries(en)) {
    const zh = cn[bandId]?.bandName;
    if (zh) byLeader.set(band.bandName, zh);
  }
  return byLeader;
}

const cnName = cnLeaders();
const cnTitles = new Map();   // prts file title -> leader
for (const leader of leaders) {
  const zh = cnName.get(leader);
  if (zh) cnTitles.set(`${CN_MODE}_${CN_STRATAGEM}_${zh}.png`, leader);
}
const cnTitleList = [...cnTitles.keys()];
for (let i = 0; i < cnTitleList.length; i += 40) {
  const url = new URL(CN_API);
  for (const [k, v] of Object.entries({
    action: 'query', prop: 'imageinfo', iiprop: 'url', format: 'json',
    titles: cnTitleList.slice(i, i + 40).map((t) => `File:${t}`).join('|'),
  })) url.searchParams.set(k, v);
  const res = JSON.parse(curl(['-G', url.toString()]).toString());
  for (const page of Object.values(res.query.pages)) {
    if (page.missing !== undefined) continue;
    // prts returns the title with underscores turned to spaces and a CN namespace.
    const bare = page.title.replace(/^[^:]*:/, '').replace(/ /g, '_');
    const leader = cnTitles.get(bare) ?? cnTitles.get(`${bare}.png`);
    if (leader) urls.set(leader, page.imageinfo[0].url);   // wins over the EN wiki
  }
}

const missing = [];
let bytes = 0;
for (const leader of leaders) {
  const url = urls.get(leader);
  if (!url) { missing.push(leader); continue; }
  const png = join(TMP, 'download.png');
  curl(['-o', png, url]);
  const out = join(OUT, `${slug(leader)}.webp`);
  // 96px: twice the largest box any of these draws in, and a quarter of the weight of
  // the 184px original.
  execFileSync('cwebp', ['-quiet', '-resize', '96', '96', '-q', '88', png, '-o', out]);
  const size = statSync(out).size;
  bytes += size;
  const from = url.includes('prts.wiki') ? 'prts' : 'wiki.gg';
  console.log(`  ${leader.padEnd(20)} -> ${slug(leader)}.webp  ${Math.round(size / 102.4) / 10}KB  (${from})`);
}
rmSync(TMP, { recursive: true, force: true });



console.log(`\n${leaders.length - missing.length} of ${leaders.length} stratagems -> ${OUT}/ (${Math.round(bytes / 1024)}KB)`);
if (missing.length) {
  console.log(`no art anywhere for: ${missing.join(', ')}`);
  console.log('  -- the page falls back to the leader\'s operator portrait, then a monogram');
}

// --- item icons ------------------------------------------------------------

const items = JSON.parse(readFileSync('data/gamemodes/stronghold/items.json', 'utf8'));
mkdirSync(ITEMS_OUT, { recursive: true });
for (const f of readdirSync(ITEMS_OUT)) rmSync(join(ITEMS_OUT, f));
mkdirSync(TMP, { recursive: true });

const noIcon = [];
let itemBytes = 0;
let got = 0;
for (const item of items) {
  if (!item.icon) { noIcon.push(item.name); continue; }
  const token = item.icon.replace(/^.*\//, '').replace(/\.webp$/, '');
  const png = join(TMP, 'token.png');
  // _1 is the base art; _2 is the same picture for the upgraded copy.
  const code = execFileSync('curl', ['-sS', '-A', UA, '-o', png, '-w', '%{http_code}',
    `${TOKENS}/skill_icon_sktok_${token}_1.png`]).toString().trim();
  if (code !== '200') { noIcon.push(`${item.name} (${token}: HTTP ${code})`); continue; }
  const out = join(ITEMS_OUT, `${token}.webp`);
  execFileSync('cwebp', ['-quiet', '-q', '88', png, '-o', out]);
  itemBytes += statSync(out).size;
  got += 1;
}
rmSync(TMP, { recursive: true, force: true });

console.log(`\n${got} of ${items.length} item icons -> ${ITEMS_OUT}/ (${Math.round(itemBytes / 1024)}KB)`);
if (noIcon.length) console.log(`  no token art for: ${noIcon.join(', ')}`);


// --- enemy type glyphs -----------------------------------------------------

/** "Tactical Training/Flying" -> flying. The EN name is the group name the data ships. */
const typeSlug = (name) => slug(name.split('/').pop());

const cnTypes = JSON.parse(readFileSync(join(CACHE, 'cn_activity_table.json'), 'utf8'))
  .autoChessData?.enemyTypeDatas ?? {};
const enTypes = JSON.parse(readFileSync(join(CACHE, 'activity_table.json'), 'utf8'))
  .autoChessData?.enemyTypeDatas ?? {};

mkdirSync(TYPES_OUT, { recursive: true });
for (const f of readdirSync(TYPES_OUT)) rmSync(join(TYPES_OUT, f));
mkdirSync(TMP, { recursive: true });

// 特训敌人·飞行 -> 飞行, which is the half of the file name that varies.
const typeTitles = new Map();
for (const [type, en] of Object.entries(enTypes)) {
  const zh = (cnTypes[type]?.name ?? '').split('·').pop();
  if (zh) typeTitles.set(`特训敌人_${zh}.png`, typeSlug(en.name));
}
const typeUrls = new Map();
{
  const url = new URL(CN_API);
  for (const [k, v] of Object.entries({
    action: 'query', prop: 'imageinfo', iiprop: 'url', format: 'json',
    titles: [...typeTitles.keys()].map((t) => `File:${t}`).join('|'),
  })) url.searchParams.set(k, v);
  const res = JSON.parse(curl(['-G', url.toString()]).toString());
  for (const page of Object.values(res.query.pages)) {
    if (page.missing !== undefined) continue;
    const bare = page.title.replace(/^[^:]*:/, '').replace(/ /g, '_');
    const name = typeTitles.get(bare);
    if (name) typeUrls.set(name, page.imageinfo[0].url);
  }
}
let typeBytes = 0;
for (const [name, url] of typeUrls) {
  const png = join(TMP, 'type.png');
  curl(['-o', png, url]);
  const out = join(TYPES_OUT, `${name}.webp`);
  /* 128, not 64. The setup step draws these at 40px and a 64px source is soft above
     32 on a 2x screen -- which is every screen this is read on. 12KB apiece for the
     seven of them. */
  execFileSync('cwebp', ['-quiet', '-resize', '128', '128', '-q', '88', png, '-o', out]);
  typeBytes += statSync(out).size;
}
rmSync(TMP, { recursive: true, force: true });
console.log(`\n${typeUrls.size} of ${typeTitles.size} enemy-type glyphs -> ${TYPES_OUT}/ (${Math.round(typeBytes / 1024)}KB)`);
const noType = [...typeTitles.values()].filter((n) => !typeUrls.has(n));
if (noType.length) console.log(`  no art for: ${noType.join(', ')}`);
