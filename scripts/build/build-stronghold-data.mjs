#!/usr/bin/env node
/**
 * Rebuilds the Stronghold Protocol datasets from the EN gamedata: alliances,
 * operators, items, strategies, enemy groups and the tier price list, for whichever
 * season is running.
 *
 * WHY THIS EXISTS. These files were hand-compiled off arknights.wiki.gg, whose tables
 * belong to "Stronghold Protocol: Alliance" -- the part BEFORE the one running now.
 * Part 2's own page says what that costs: "this update will introduce new Alliances,
 * Strategies, Preset Operators, Equipment, maps, and enemies". Measured against the
 * live gamedata, the wiki-sourced files were wrong in every direction:
 *
 *   - seven strategies missing (Narantuya, Chiave, Mlynar, Shamare, Touch, Ioleta
 *     Russell, Matsukiri), one gone (Eunectes), and twenty with the previous part's
 *     numbers -- Warfarin at 27 Life Points instead of 28;
 *   - alliance bonuses without their new clauses (Yan gained a "with 9 different [Yan]
 *     Operators" tier);
 *   - operator alliances and attributes drifted (Insider also feeds Swift now;
 *     Matterhorn grants 2 stacks, not 3);
 *   - item effects and prices a balance pass behind (Victorian Hammer is ATK +15%,
 *     not +10%), with 17 items carrying no price at all because the wiki had none.
 *
 * activity_table.json has none of that lag: autoChessData plus a block per season
 * under activity.AUTOCHESS_SEASON, in English, as shipped to global.
 *
 *   node scripts/build/build-stronghold-data.mjs
 *
 * WHAT THE GAMEDATA DOES NOT HAVE, and is therefore carried over from the existing
 * files by name:
 *
 *   - `role` on an operator. kukki's editorial judgement of what a unit is FOR, which
 *     the game never states. A new operator gets an empty list to be filled in.
 *   - `initiator` on a strategy. The wiki's note on who actually fronts it -- the
 *     Sarkaz Greatswordsman for Goliath.
 *   - an item's flavour text.
 *
 * NOT REBUILT HERE: tactical_decisions and bounty_decisions. The gamedata's
 * effectChoiceInfoDict describes the 109 kinds of choice the mode offers, not the 134
 * individual decisions those files list, so there is nothing to map them onto. The
 * tactical ones are ENRICHED though -- see `affects` at the bottom.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DIR = 'data/gamemodes/stronghold';
const REPO = path.resolve(import.meta.dirname, '../..');
const CACHE = path.join(REPO, '.cache');
// The stage pipeline's own cache first, so a full refresh and this script agree.
const UPSTREAM = path.join(REPO, '.cache/upstream/en-gamedata/en/gamedata');
const RAW = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/en/gamedata/excel';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

function excel(name) {
  const cached = path.join(UPSTREAM, 'excel', `${name}.json`);
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8'));
  const loose = path.join(CACHE, `${name}.json`);
  if (!existsSync(loose)) {
    // The pipeline's sparse checkout also pulls levels/, which is far bigger than
    // these two tables. One table at a time is the cheap path for a script that
    // wants nothing else.
    console.log(`  fetching ${name}.json`);
    mkdirSync(CACHE, { recursive: true });
    execFileSync('curl', ['-sSL', '-A', 'ArkpediaBot/1.0', '-o', loose, `${RAW}/${name}.json`]);
  }
  return JSON.parse(readFileSync(loose, 'utf8'));
}

/** Colour and emphasis markup only. Angle brackets are also literal game text here --
 *  <In battle>, <When obtained>, <Sargon> -- so this cannot strip every <...>. */
const strip = (text) => String(text ?? '')
  .replace(/<@[^>]*>|<\$[^>]*>|<\/>/g, '')
  .trim();

/** A trailing coloured line is the caveat the game prints in red under an effect:
 *  "Strategy may be flawed when some Yan Operators are missing". */
function splitWarning(desc) {
  const m = /\n<@ba\.vdown>([\s\S]*?)<\/>\s*$/.exec(desc ?? '');
  if (!m) return { effect: strip(desc), warning: null };
  return { effect: strip(desc.slice(0, m.index)), warning: strip(m[1]) };
}

const bare = (name) => String(name).replace(/["'‘’“”]/g, '');

/** For carrying hand-written fields across a spelling correction: the gamedata says
 *  Młynar and SilverAsh the Reignfrost where the wiki-sourced files said Mlynar and
 *  Silverash the Reignfrost. Same fold scripts/build/build-operator-deploy.mjs uses. */
const LETTERS = { 'ł': 'l', 'đ': 'd', 'ƀ': 'b', 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'ð': 'd', 'þ': 'th' };
const fold = (name) => String(name)
  .toLowerCase()
  .replace(/['\u2019\u02bc.]/g, '')
  .replace(/[łđƀøæœßðþ]/g, (c) => LETTERS[c] || c)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

function readIfThere(file) {
  const at = path.join(DIR, file);
  return existsSync(at) ? JSON.parse(readFileSync(at, 'utf8')) : [];
}

/**
 * Writes, then says what moved. A silent rebuild of hand-compiled data is how a
 * regression gets committed.
 *
 * `key` may be a field name or a function of the row, and bosses.json needs the
 * function: three OpFor bosses appear at BOTH round 14 and round 15 with
 * different HP, weight and hidden flags, so keying by name alone put the two
 * entries in one slot and compared each round-14 boss against its round-15
 * twin. It reported "changed: OpFor: Armor, OpFor: Gun, OpFor: Pipe" on every
 * run for ever, with the file on disk byte-identical -- and a refresh that
 * cries wolf on three rows is a refresh whose real findings nobody reads. It
 * cost this session ten minutes of chasing a boss rebalance that never
 * happened.
 */
function report(file, rows, previous, key, compare) {
  writeFileSync(path.join(DIR, file), `${JSON.stringify(rows, null, 2)}\n`);
  const id = typeof key === 'function' ? key : (r) => r[key];
  const label = (r) => (typeof key === 'function' ? id(r) : r[key]);
  const had = new Map(previous.map((r) => [bare(id(r)), r]));
  const now = new Map(rows.map((r) => [bare(id(r)), r]));
  const added = rows.filter((r) => !had.has(bare(id(r))));
  const dropped = previous.filter((r) => !now.has(bare(id(r))));
  const changed = rows.filter((r) => {
    const old = had.get(bare(id(r)));
    return old && compare.some((f) => JSON.stringify(old[f]) !== JSON.stringify(r[f]));
  });
  console.log(`\n${rows.length} -> ${DIR}/${file}`);
  if (added.length) console.log(`  added:   ${added.map(label).join(', ')}`);
  if (dropped.length) console.log(`  dropped: ${dropped.map(label).join(', ')}`);
  if (changed.length) console.log(`  changed: ${changed.map(label).join(', ')}`);
  if (!added.length && !dropped.length && !changed.length) console.log('  no change');
}

// --- the season that is running --------------------------------------------

const table = excel('activity_table');
const seasons = table.activity?.AUTOCHESS_SEASON ?? {};
const now = Math.floor(Date.now() / 1000);
const dated = Object.keys(seasons).map((id) => ({
  id,
  start: table.basicInfo?.[id]?.startTime ?? 0,
  end: table.basicInfo?.[id]?.endTime ?? 0,
  name: table.basicInfo?.[id]?.name ?? id,
}));
const running = dated.find((s) => s.start <= now && now <= s.end)
  ?? dated.sort((a, b) => b.start - a.start)[0];
if (!running) throw new Error('no AUTOCHESS_SEASON in activity_table.json');
const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const live = running.start <= now && now <= running.end;
console.log(`  season ${running.id} -- ${running.name}, ${day(running.start)} to ${day(running.end)}`
  + (live ? ' (running)' : ' (NOT running -- newest known)'));

const season = seasons[running.id];
const global = table.autoChessData ?? {};

// --- alliances -------------------------------------------------------------

const bondName = new Map(Object.entries(season.bondInfoDict).map(([id, b]) => [id, b.name]));
const alliances = Object.entries(season.bondInfoDict)
  .map(([id, bond]) => {
    const meta = global.bondInfoDict?.[id] ?? {};
    const { effect, warning } = splitWarning(bond.desc);
    return {
      // SEASON bonds are the nations this season is built around; REGULAR ones are
      // the mode's own synergies, which the page calls Add-on.
      alliance_type: meta.bondType === 'SEASON' ? 'Core' : 'Add-on',
      alliance: bond.name,
      effect,
      warning,
      operators_to_activate: bond.activeCount ?? null,
    };
  })
  .sort((a, b) => (a.alliance_type === b.alliance_type ? 0 : a.alliance_type === 'Core' ? -1 : 1)
    || a.alliance.localeCompare(b.alliance));

report('alliances.json', alliances, readIfThere('alliances.json'), 'alliance',
  ['alliance_type', 'effect', 'warning', 'operators_to_activate']);

// --- operators -------------------------------------------------------------

const chars = excel('character_table');
const gar = season.garrisonDataDict;
const chess = season.charChessDataDict;
const keptRoles = new Map(readIfThere('stronghold_operators.json').map((o) => [fold(o.operator), o.role]));

const garrisons = (chessId) => (chess[chessId]?.garrisonIds ?? []).filter((g) => gar[g]);
/**
 * An operator can carry several garrison entries that say overlapping things -- Vigil
 * has three, two word-for-word identical and the third a subset of them -- and the game
 * shows one line. So identical lines collapse, and a line wholly contained in another
 * is dropped in favour of the fuller one.
 */
/**
 * Whether every word of `a` appears in `b`, in order.
 *
 * The containment test this replaces was a raw `String.includes`, which only catches a
 * duplicate that is a character-exact substring. Upstream rarely obliges: it repeats an
 * effect with a clause spliced into the middle ("<In battle> +25% ATK and HP; deals
 * Weakness damage..." beside "<In battle> Deals Weakness damage..."), or with the
 * capitalisation moved, and both slipped straight through. Comparing normalised words
 * as a subsequence catches those and still cannot fire on two lines that genuinely
 * differ -- a line with a word the other lacks is never a subsequence of it.
 */
const words = (s) => s.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim().split(' ').filter(Boolean);
function saidWithin(a, b) {
  const A = words(a);
  const B = words(b);
  let i = 0;
  for (const w of B) if (i < A.length && A[i] === w) i += 1;
  return i === A.length;
}

function attribute(chessId) {
  /**
   * Split on newlines FIRST. A garrisonDesc is often two clauses in one string,
   * and deduping whole blobs cannot see inside them: Degenbrecher carries
   * "<When obtained> +8 stacks to own Alliance(s)\n<On deployment> ..." in one
   * entry and "<When obtained> +8 stacks to own Alliance(s) (Alliances do not
   * need to be active)" in another, so neither blob contains the other and the
   * page printed the When-obtained clause twice -- once in the short form the
   * longer one already says. Somebody deleted the duplicate by hand after the
   * last import, which meant every future refresh silently undid the fix. The
   * containment test was already here and already right; it was being handed
   * paragraphs when it needed sentences.
   */
  const lines = [...new Set(garrisons(chessId)
    .flatMap((g) => strip(gar[g].garrisonDesc).split('\n'))
    .map((line) => line.trim())
    .filter(Boolean))];
  /* Strictly longer, so two lines that normalise identically cannot delete each other
     and leave the attribute empty. */
  const kept = lines.filter((line) => !lines.some((other) => other !== line
    && words(other).length > words(line).length
    && saidWithin(line, other)));
  return kept.join('\n') || null;
}

/**
 * Whether this operator can put damage on something flying over it.
 *
 * NOT the same as `position: RANGED`, which was the first answer and the wrong one in
 * both directions. A Medic is ranged and heals -- it cannot kill an aerial. A Lord Guard
 * is MELEE and shoots three tiles: Lappland, Ayerscarpe, SilverAsh and Qiubai all hit
 * air. kukki spotted both.
 *
 * The discriminator is how far FORWARD the attack range goes, not how far it spreads.
 * Range grids are stored facing right, so the largest column is the reach: a Reaper's
 * "1-3" looks wide at Manhattan distance 2 but its furthest column is 1 -- a broad melee
 * arc, still melee. Everything that genuinely shoots reaches column 2 or more.
 */
const ranges = excel('range_table');

/* Archetypes whose ranged attack cannot be aimed upwards. A Fortress Defender lobs its
   shots at the ground -- Ashlock and Horn both reach five tiles and neither one of them
   can touch a flier. kukki caught these sitting in the anti-air list. */
const GROUND_ONLY = new Set(['fortress']);

function hitsAir(char) {
  if (!char || char.profession === 'MEDIC' || char.profession === 'TRAP') return false;
  if (GROUND_ONLY.has(char.subProfessionId)) return false;
  const rangeId = char.phases?.[char.phases.length - 1]?.rangeId;
  const grids = ranges[rangeId]?.grids ?? [];
  return Math.max(...grids.map((g) => g.col), 0) >= 2;
}

const operators = Object.entries(season.charShopChessDatas)
  // DIY slots are the four 6-star seats the player fills from their own roster, so
  // they carry no charId and are not part of the offered pool.
  .filter(([, s]) => !s.isHidden && s.charId && chars[s.charId])
  .map(([chessId, s]) => {
    const name = chars[s.charId].name;
    const base = attribute(chessId);
    const promoted = attribute(s.goldenChessId);
    const first = garrisons(chessId)[0];
    return {
      operator: name,
      tier: ROMAN[s.chessLevel - 1] ?? String(s.chessLevel),
      cls: chars[s.charId].profession ?? null,
      /* The archetype, not just the class: "Marksman sniper" and "Lord guard" are
         subProfessionId, and the anti-air ordering is written in those terms. */
      sub: chars[s.charId].subProfessionId ?? null,
      hits_air: hitsAir(chars[s.charId]),
      alliances: (chess[chessId]?.bondIds ?? []).map((b) => bondName.get(b) ?? b),
      role: keptRoles.get(fold(name)) ?? [],
      in_game_role: first ? gar[first].eventTypeDesc : null,
      base_attribute: base,
      promoted_attribute: promoted && promoted !== base ? promoted : null,
    };
  })
  .sort((a, b) => ROMAN.indexOf(a.tier) - ROMAN.indexOf(b.tier) || a.operator.localeCompare(b.operator));

/* Held for the second pass. The stacks are parsed further down, after the roles and
   attributes are settled, and its report has to compare against what was on DISK before
   this run -- comparing against `operators`, which has no stacks field at all, marked
   all 112 as changed every single time and made the report worth nothing. */
const operatorsBefore = readIfThere('stronghold_operators.json');
report('stronghold_operators.json', operators, operatorsBefore, 'operator',
  ['tier', 'alliances', 'in_game_role', 'base_attribute', 'promoted_attribute', 'cls', 'sub', 'hits_air']);

const unroled = operators.filter((o) => !o.role.length);
if (unroled.length) {
  console.log(`  no editorial role yet: ${unroled.map((o) => o.operator).join(', ')}`);
}

// --- items -----------------------------------------------------------------

const traps = season.trapChessDataDict;
const effects = season.effectInfoDataDict;
const keptItem = new Map(readIfThere('items.json').map((i) => [fold(i.name), i]));

const items = Object.entries(season.trapShopChessDatas)
  .map(([itemId, shop]) => {
    const trap = traps[itemId];
    if (!trap) return null;
    const base = effects[trap.effectId];
    const golden = traps[trap.upgradeChessId] ? effects[traps[trap.upgradeChessId].effectId] : null;
    const name = base?.effectName ?? itemId;
    const was = keptItem.get(fold(name)) ?? {};
    // trap_1041_acarm041 -> acarm041, which is also the game's skill-token icon for
    // the item. scripts/build/build-stronghold-icons.mjs downloads by this name.
    const token = /^trap_\d+_(.+)$/.exec(trap.charId || '')?.[1] ?? null;
    const advanced = golden ? strip(golden.effectDesc) : null;
    const baseText = strip(base?.effectDesc);
    return {
      name,
      type: shop.itemType === 'MAGIC' ? 'Arts' : 'Equipment',
      // Arts are not sold at a shop tier -- they come out of decisions and bounties --
      // so their itemLevel is not a tier the player ever sees.
      tier: shop.itemType === 'MAGIC' ? null : (ROMAN[shop.itemLevel - 1] ?? String(shop.itemLevel)),
      base_effect: baseText || null,
      advanced_effect: advanced && advanced !== baseText ? advanced : null,
      description: was.description ?? null,
      price: trap.purchasePrice ?? null,
      icon: token ? `/stronghold-items/${token}.webp` : null,
    };
  })
  .filter(Boolean)
  .sort((a, b) => (a.type === b.type ? 0 : a.type === 'Equipment' ? -1 : 1)
    || ROMAN.indexOf(a.tier ?? '') - ROMAN.indexOf(b.tier ?? '')
    || a.name.localeCompare(b.name));

report('items.json', items, readIfThere('items.json'), 'name',
  ['type', 'tier', 'base_effect', 'advanced_effect', 'price', 'icon']);

const unpriced = items.filter((i) => i.price == null);
if (unpriced.length) console.log(`  no price: ${unpriced.map((i) => i.name).join(', ')}`);

// --- strategies ------------------------------------------------------------

const bandNames = global.bandDataDict ?? {};
const keptInitiator = new Map(readIfThere('strategies.json')
  .filter((s) => s.initiator && s.initiator !== s.leader)
  .map((s) => [fold(s.leader), s.initiator]));

const strategies = Object.entries(season.bandDataListDict)
  .sort((a, b) => a[1].sortId - b[1].sortId)
  .map(([bandId, band]) => {
    const leader = bandNames[bandId]?.bandName ?? bandId;
    const { effect, warning } = splitWarning(band.bandDesc);
    return {
      leader,
      initiator: keptInitiator.get(fold(leader)) ?? leader,
      life_points: band.totalHp ?? null,
      effect,
      warning,
      how_to_unlock: strip(bandNames[bandId]?.unlockDesc) || 'Initially available',
    };
  });

report('strategies.json', strategies, readIfThere('strategies.json'), 'leader',
  ['life_points', 'effect', 'warning', 'how_to_unlock']);

// --- what a tier costs -----------------------------------------------------

/**
 * The price of an operator, by tier.
 *
 * NOT the tier number, which is what this file used to assume: it is 2, 3, 3, 3, 4, 4
 * for tiers I to VI, so a Tier II Gravel costs 3 and so does a Tier IV Bagpipe. The
 * table is `shopCharChessInfoData`, keyed by tier, and a promoted copy costs the same as
 * a base one. Emitted as data rather than read into a constant so it follows the season
 * like everything else here.
 */
const tierCosts = Object.entries(season.shopCharChessInfoData)
  .map(([tier, rows]) => {
    const base = rows.find((r) => !r.isGolden) ?? rows[0];
    return {
      tier: ROMAN[Number(tier) - 1] ?? tier,
      funds: base?.purchasePrice ?? null,
      sell: base?.chessSoldPrice ?? null,
    };
  })
  .sort((a, b) => ROMAN.indexOf(a.tier) - ROMAN.indexOf(b.tier));

report('tier_costs.json', tierCosts, readIfThere('tier_costs.json'), 'tier', ['funds', 'sell']);

// --- enemy groups ----------------------------------------------------------

/**
 * The seven pools the mode draws its Tactical Training waves from. The gamedata gives
 * the group name and blurb verbatim and lists members by enemy id; the id is turned
 * into the code and name the rest of this site uses by way of enemy_handbook_table,
 * and then into an icon by way of public/enemies-index.json, which the enemy pages
 * already resolved against the filesystem.
 */
const handbook = excel('enemy_handbook_table').enemyData ?? {};
const indexed = new Map(JSON.parse(readFileSync('public/enemies-index.json', 'utf8'))
  .map((e) => [e.index, e]));
const types = global.enemyTypeDatas ?? {};

const unknown = [];
const groups = Object.entries(season.enemyInfoDict)
  .sort((a, b) => (types[a[0]]?.sortId ?? 99) - (types[b[0]]?.sortId ?? 99))
  .map(([type, ids]) => ({
    group: types[type]?.name ?? type,
    description: types[type]?.description ?? null,
    enemies: ids.map((id) => {
      const code = handbook[id]?.enemyIndex ?? null;
      const entry = code ? indexed.get(code) : null;
      if (!entry) unknown.push(id);
      return {
        code,
        name: handbook[id]?.name ?? id,
        icon: entry?.icon ?? null,
      };
    }),
  }));

report('stronghold_enemies.json', groups, readIfThere('stronghold_enemies.json'), 'group',
  ['description', 'enemies']);
const members = groups.reduce((n, g) => n + g.enemies.length, 0);
const withIcon = groups.reduce((n, g) => n + g.enemies.filter((e) => e.icon).length, 0);
console.log(`  ${members} members, ${withIcon} with an icon`);
if (unknown.length) console.log(`  no index entry for: ${unknown.join(', ')}`);


// --- bosses ----------------------------------------------------------------

/**
 * The ten that can turn up at the end, and which one you get is the question the whole
 * run is building an answer to.
 *
 * bossInfoDict gives HP at each difficulty and whether the boss is hidden, but not who
 * it is -- for that each one points at a level, and the level's enemy list has exactly
 * one BOSS-ranked entry. Three are `isHidingBoss`, which is why the mode's own screen
 * shows seven: those three arrive a round later. Note boss_5 is the only one on an
 * ACT2 level; the rest reuse the previous part's.
 */
const LEVELS = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/en/gamedata/levels';

function levelEnemies(levelId) {
  const rel = `${levelId.toLowerCase()}.json`;
  const cached = path.join(UPSTREAM, 'levels', rel);
  const loose = path.join(CACHE, 'levels', rel);
  let file = existsSync(cached) ? cached : loose;
  if (!existsSync(file)) {
    mkdirSync(path.dirname(loose), { recursive: true });
    execFileSync('curl', ['-sSL', '-A', 'ArkpediaBot/1.0', '-o', loose, `${LEVELS}/${rel}`]);
    file = loose;
  }
  try {
    return (JSON.parse(readFileSync(file, 'utf8')).enemyDbRefs ?? []).map((r) => r.id);
  } catch {
    return [];
  }
}

const rounds = season.battleDataDict?.mode_single_normal ?? {};
const bossRounds = Object.entries(rounds)
  .filter(([, list]) => Array.isArray(list) && list.some((e) => e.bossId));
const indexedEnemies = new Map(JSON.parse(readFileSync('public/enemies-index.json', 'utf8'))
  .map((e) => [e.index, e]));

const bosses = [];
for (const [round, list] of bossRounds) {
  for (const entry of list) {
    const info = season.bossInfoDict?.[entry.bossId];
    if (!info) continue;
    const boss = levelEnemies(entry.levelId).find((id) => handbook[id]?.enemyLevel === 'BOSS');
    const code = boss ? handbook[boss]?.enemyIndex ?? null : null;
    const listed = code ? indexedEnemies.get(code) : null;
    bosses.push({
      name: boss ? handbook[boss].name : entry.bossId,
      code,
      icon: listed?.icon ?? null,
      round: Number(round),
      hidden: !!info.isHidingBoss,
      /** Higher shows up more often. The hidden three carry much larger weights. */
      weight: info.weight ?? null,
      hp: {
        standard: info.bloodPointNormal ?? null,
        perilous: info.bloodPointHard ?? null,
        ultimate: info.bloodPointAbyss ?? null,
        training: info.bloodPoint ?? null,
      },
    });
  }
}
bosses.sort((a, b) => Number(a.hidden) - Number(b.hidden) || (season.bossInfoDict ? 0 : 0)
  || a.round - b.round || a.name.localeCompare(b.name));

/* Name AND round: the same boss is a different fight in each. */
report('bosses.json', bosses, readIfThere('bosses.json'), (b) => `${b.name} r${b.round}`, ['hidden', 'weight', 'hp', 'code']);
const noArt = bosses.filter((b) => !b.icon);
if (noArt.length) console.log(`  no portrait for: ${noArt.map((b) => b.name).join(', ')}`);


// --- who a tactical decision lands on ---------------------------------------

/**
 * The mode marks every tactical decision with one of five glyphs, and the difference is
 * real: a single rook for something that only helps YOU, a group of them for something
 * that helps the whole team as well. effectDecoIconId is that mark, and it agrees with
 * the effect text exactly -- every icon_team_buff says "also affects Teammates" and
 * nothing else does, across all 34 that match by name.
 *
 * The art is published nowhere, so this carries the meaning as a word instead. The
 * seven whose wiki name differs from the gamedata's (the wiki writes "Swire the Elegant
 * Wit's Pledge" where the game says "Swire's Pledge") fall back to that same phrase,
 * which decides between the two commonest cases and leaves the rest unmarked rather
 * than guessed.
 */
const AFFECTS = {
  icon_player_buff: 'You',
  icon_team_buff: 'Team',
  icon_stage_buff: 'Stage',
  icon_enemy_debuff: 'Enemies',
  icon_boss_debuff: 'Boss',
};

/**
 * Both decision lists come out of effectInfoDataDict, split by effectType: BUFF_GAIN is
 * the tactical panel, ENEMY_GAIN the bounty one.
 *
 * They were hand-compiled from the wiki until now, and had drifted a full part behind
 * the running season -- the tactical list offered six decisions the game no longer has
 * (Executor's, Eunectes's and Ines's Pledges; Investors', Farsighted and Assisting
 * Support) while missing nine it does, and gave SilverAsh's Pledge the wrong third
 * alliance. Reading them from the season, like every other dataset here, is the fix.
 *
 * effectId is the key, not the name: "Bounty/Flying I" is three different decisions
 * with three different enemies behind it, and keying by name kept one and dropped the
 * rest. The page already renders decisions by position for the same reason.
 */
function decisions(type, extra) {
  return Object.entries(season.effectInfoDataDict ?? {})
    .filter(([, e]) => e.effectType === type)
    .map(([effectId, e]) => {
      const { effect, warning } = splitWarning(e.effectDesc);
      return { effect_id: effectId, name: strip(e.effectName), effect, warning, ...extra(e, effect) };
    });
}

const tactical = decisions('BUFF_GAIN', (e, effect) => ({
  // The glyph is the game's own marking. The fallback reads the sentence, which agrees
  // with it on every decision that has one: each icon_team_buff says "also affects
  // Teammates" and nothing else does.
  affects: AFFECTS[e.effectDecoIconId] ?? (/affects Teammates/i.test(effect) ? 'Team' : null),
}));
report('tactical_decisions.json', tactical, readIfThere('tactical_decisions.json'), 'effect_id',
  ['name', 'effect', 'warning', 'affects']);
const unmarked = tactical.filter((d) => !d.affects);
if (unmarked.length) console.log(`  no category: ${unmarked.map((d) => d.name).join(', ')}`);

/* "Pointing stick" is the risk-for-reward flavour: it adds enemies and pays only on a
   perfect clear, where a plain bounty pays for the kill. The wording is the tell, and it
   agreed with all 105 rows the hand-compiled list and the season had in common. */
const bounty = decisions('ENEMY_GAIN', (e, effect) => ({
  pointing_stick: /perfectly clear/i.test(effect),
}));
report('bounty_decisions.json', bounty, readIfThere('bounty_decisions.json'), 'effect_id',
  ['name', 'effect', 'warning', 'pointing_stick']);


// --- what an operator adds to an alliance -----------------------------------

/**
 * The planner's arithmetic rests on this: which alliance an operator feeds, how much,
 * and how often. None of it is a field -- it is in the attribute sentence -- so this
 * parses that sentence and reports what it could not read, because a silent zero in a
 * planner is worse than a blank.
 *
 * The distinction that matters is PRODUCER vs CONSUMER. "For every 5 stacks added to
 * [Laterano], this Operator gains +1 ASPD" spends stacks; it does not make any. Only a
 * phrase that adds a number of stacks counts, which is why the patterns all anchor on
 * "+N ... stack".
 *
 * Cadence comes from the trigger the sentence opens with, and decides how the planner
 * multiplies it out:
 *   once    <When obtained>, <When sold>            -- counted a single time
 *   round   <When Rest Phase ends>, <When entering> -- once per remaining round
 *   battle  <In battle>, <On deployment>, ...       -- once per remaining round, but a
 *                                                      ceiling rather than a promise
 */
const TRIGGERS = [
  ['<When obtained>', 'obtained', 'once'],
  ['<When sold>', 'sold', 'once'],
  ['<When Rest Phase ends>', 'rest-end', 'round'],
  ['<When entering Rest Phase>', 'rest-start', 'round'],
  ['<At the start of battle>', 'battle-start', 'battle'],
  ['<On deployment>', 'deploy', 'battle'],
  ['<When defeated>', 'defeated', 'battle'],
  ['<In battle>', 'battle', 'battle'],
];

/** Where the stacks land. A bracketed name is an alliance; the rest are the phrases the
 *  game uses when it will not name one, and the planner resolves them at read time. */
function stackTargets(text, fallback) {
  // The "for every ..." tail counts something; it does not receive anything. Mint --
  // "+2 stacks to active [Victoria] Alliance for every [Victoria] Operator of a
  // different Tier" -- named Victoria twice and so paid out twice, and an operator
  // counted by a DIFFERENT alliance would have been credited a share it never gets.
  const head = text.split(/\bfor every\b/i)[0];
  const named = [...new Set([...head.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]))];
  if (named.length) return named;
  // "own active Alliance(s)" is the operator's OWN alliances, not every active one --
  // checked before the looser phrase below, which would otherwise swallow it and make
  // an operator look like it feeds whatever you happen to be building.
  // "of self and of the Operator 1 tile ahead" is its own alliances plus whoever the
  // player parked in the tile it points at. Ahead and behind are different tiles and
  // the planner's grid can tell them apart, so they are different targets -- lumping
  // both into one "neighbour" meant Ayerscarpe and Archetto read as the same skill.
  if (/of self and of the Operator 1 tile behind/.test(text)) return ['own', 'behind'];
  if (/of self and of the Operator/.test(text)) return ['own', 'ahead'];
  if (/of all Operators on Bench/.test(text)) return ['bench'];
  // "own active Alliance(s)" is the operator's OWN alliances, not every active one --
  // checked before the looser phrase below, which would otherwise swallow it and make
  // an operator look like it feeds whatever you happen to be building.
  if (/own\s+(?:active\s+)?Alliance/.test(text)) return ['own'];
  if (/most stacked/.test(text)) return ['most-stacked'];
  if (/Core Alliances/.test(text)) return ['core'];
  if (/active Alliances?/.test(text)) return ['all-active'];
  return [fallback];
}

/**
 * What a contribution is counted PER, when it is not a flat number.
 *
 * "+1 stack to active [Yan] Alliance for every Operator obtained this round" is not +1 a
 * round -- it is +1 per operator you bought, which on a busy round is several. Fourteen
 * of the producers read this way, so taking the bare number is a systematic
 * under-count. The multiplier depends on board state the planner does not model, so it
 * is carried as text and the number it qualifies is shown as a floor rather than a
 * promise.
 */
function scaledBy(text) {
  const m = /for every ([^.;,\n(]*)/i.exec(text);
  if (!m) return null;
  const phrase = m[1].trim();
  // "For every 3 stacks added to [X], this Operator gains ..." is the consumer
  // sentence -- it spends stacks and qualifies nothing.
  if (/^\d+\s+stacks?\s+added/i.test(phrase)) return null;
  return phrase || null;
}

function parseStacks(text) {
  const out = [];
  if (!text) return out;
  for (const part of String(text).split(/(?=<[A-Z])/)) {
    let trigger = 'unknown';
    let cadence = 'battle';
    for (const [mark, t, c] of TRIGGERS) {
      if (part.includes(mark)) { trigger = t; cadence = c; break; }
    }
    const per = scaledBy(part);
    const push = (n, targets) => out.push({ n, trigger, cadence, targets, ...(per ? { per } : {}) });

    // "+3/+2 stacks respectively to active [Victoria]/[Marvel] Alliances" -- the two
    // lists line up in order, so each alliance takes its own number.
    const split = /\+(\d+)\/\+(\d+)\s+stacks?[^.;\n]*/.exec(part);
    if (split) {
      // De-duplicated, in order: Vina Victoria names the same pair twice -- "+3/+2 ... to
      // [Victoria]/[Marvel] Alliances for every [Victoria]/[Marvel] Operator ..." -- and
      // four names failed the pair check, so she parsed to nothing at all.
      const names = [...new Set([...split[0].matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]))];
      if (names.length === 2) { push(Number(split[1]), [names[0]]); push(Number(split[2]), [names[1]]); continue; }
    }
    // "+7 [Laterano] and +3 [Foresight] stacks" -- a number per alliance.
    const paired = [...part.matchAll(/\+(\d+)\s+\[([^\]]+)\]/g)];
    if (paired.length && /stacks?/.test(part)) {
      for (const m of paired) push(Number(m[1]), [m[2]]);
    }
    // "+2 stacks to own Alliance(s)", "+1 stack each to active [Ægir], [Durable] ..."
    // The tail stops at the next "+": "+2 stacks to active [Siracusa] Alliance and +1
    // stack to [Marvel] Alliance" is two contributions of different sizes, and letting
    // the first one run to the end of the sentence gave Marvel the Siracusa number.
    for (const m of part.matchAll(/\+(\d+)\s+(?:additional\s+)?stacks?\s+(?:each\s+)?to\s+([^+.;\n]*)/g)) {
      push(Number(m[1]), stackTargets(m[2], 'other'));
    }
    // "+1 additional stack", with no alliance after it. Civilight Eterna adds to
    // whatever the Operator ahead just added to, so the target is that operator's
    // choice rather than hers -- the lookahead keeps this off the "+N stacks to ..."
    // sentences, which name their own.
    for (const m of part.matchAll(/\+(\d+)\s+additional\s+stacks?(?!\s+to\b)/g)) {
      push(Number(m[1]), ['ahead']);
    }
    // "Gain [Yan] Alliance stacks equivalent to Dispatch Center level"
    if (/stacks? equivalent to Dispatch Center level/.test(part)) {
      push('dispatch', stackTargets(part, 'other'));
    }
  }
  const seen = new Set();
  return out.filter((h) => {
    const key = `${h.n}|${h.trigger}|${h.targets.join(',')}|${h.per ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The other side of the mechanic: who SPENDS stacks rather than making them.
 *
 * "For every 3 stacks added to [Sargon], [Swift] or [Precision] Alliances, this Operator
 * gains +2% ATK" is how a pile of stacks turns into damage, which makes these the ones
 * worth buying late, once the piles exist. Which alliances they read matters -- an
 * operator converting Sargon stacks is worth nothing to a Yan board -- so the names come
 * out rather than a bare flag.
 */
function spendsFrom(text) {
  const m = /for every \d+ stacks? added to ([^,]*)/i.exec(text || '');
  if (!m) return [];
  const named = [...m[1].matchAll(/\[([^\]]+)\]/g)].map((x) => x[1]);
  if (named.length) return named;
  return /Core Alliances/i.test(m[1]) ? ['core'] : [];
}

const withStacks = operators.map((op) => ({
  ...op,
  stacks: parseStacks(op.base_attribute),
  stacks_promoted: parseStacks(op.promoted_attribute),
  spends: spendsFrom(op.base_attribute),
}));
report('stronghold_operators.json', withStacks, operatorsBefore, 'operator', ['stacks', 'stacks_promoted', 'spends']);

const producers = withStacks.filter((o) => o.stacks.length);
/* Case-insensitive: Harold, Rosmontis and Tin Man write it mid-sentence, after "+20%
   ATK and HP; ", so a capital F missed them and they were reported as unreadable when
   they are simply not producers. */
const consumers = withStacks.filter((o) => !o.stacks.length
  && /for every \d+ stacks added/i.test(o.base_attribute || ''));
const unread = withStacks.filter((o) => !o.stacks.length && !consumers.includes(o)
  && /stack/i.test(o.base_attribute || ''));
console.log(`  ${producers.length} add stacks, ${consumers.length} only spend them, `
  + `${withStacks.length - producers.length - consumers.length} neither`);
if (unread.length) console.log(`  says "stack" but could not be read: ${unread.map((o) => o.operator).join(', ')}`);

