import fs from 'fs';
import path from 'path';
import { publicFileExists, publicFileVersion } from '@/lib/assets/publicAssets';
import { TierCost, allianceSlug, foldName, stratagemSlug } from './strongholdPrice';
import { getEnemySummaries } from '../enemies/enemies';

/**
 * A public URL with eight hex of the file's own bytes on it.
 *
 * next.config.js serves every image under /public with
 * `max-age=31536000, immutable`, and its comment states the invariant that makes
 * that safe: these assets "get a new filename whenever the underlying image
 * actually changes, rather than being overwritten in place under the same URL".
 *
 * The icon builders below break that invariant by construction. An alliance
 * badge is keyed by the alliance's name and a stratagem badge by its leader, so
 * a CORRECTED symbol necessarily lands on the URL the wrong one had. And
 * `immutable` does not mean "revalidate later" -- it means a browser holding the
 * old bytes will not ask again at all, for a year. Kazimierz's national emblem
 * was replaced with its real badge and every reader who had already loaded the
 * page kept the wrong one; that is what this exists to stop.
 *
 * Same bytes, same URL, still cached for a year. New bytes, new URL, fetched
 * once. Build-time only, and memoised, so the cost is one read per file per
 * build. The extension stays last in the path, so next.config.js's
 * extension-matched header rule still applies.
 */
const stamps = new Map<string, string>();
function stamped(publicPath: string): string {
  const cached = stamps.get(publicPath);
  if (cached) return cached;
  let out = publicPath;
  const hash = publicFileVersion(publicPath);
  if (hash) out = `${publicPath}?v=${hash}`;
  stamps.set(publicPath, out);
  return out;
}

/**
 * Stronghold Protocol's seven datasets, read at build time.
 *
 * Four of the seven are built by scripts/build/build-stronghold-data.mjs from the running
 * season's block in the EN gamedata -- alliances, operators, items, strategies -- which
 * is the only source that keeps up: the wiki's tables still describe the part before
 * this one. The decision pools and the enemy groups are still hand-compiled, as is the
 * `role` field on an operator, which is an editorial judgement rather than something
 * the game states.
 *
 * Read off disk rather than imported so the 132 kB lands in the props of the one page
 * that draws it instead of in every page's bundle.
 */
export interface StrongholdOperator {
  operator: string;
  /** Derived, not in the source file: the roster's portrait, resolved against
   *  operator-deploy.json by folded name. Null if nothing matched. */
  icon?: string | null;
  /** Roman numeral, I to VI. The mode's dispatch tiers. */
  tier: string;
  alliances: string[];
  /** Editorial: what the operator is FOR. Several may apply. */
  role: string[];
  /** The game's own classification: Combat, Prep, One-time, Can stack, Specialized. */
  in_game_role: string;
  base_attribute: string;
  promoted_attribute: string | null;
  /** The game's profession id -- MEDIC, TANK, SNIPER and so on. */
  cls?: string | null;
  /** The archetype under it -- fastshot is Marksman, lord is Lord Guard. */
  sub?: string | null;
  /** Can put damage on a flying enemy. Not the same as being ranged: a Medic is ranged
   *  and heals, a Lord Guard is melee and shoots. See hitsAir() in the build script. */
  hits_air?: boolean;
  /** Derived by scripts/build/build-stronghold-data.mjs from the attribute sentence: what this
   *  operator adds to an alliance, how much and how often. The planner multiplies it. */
  /** Alliances whose stacks this operator converts into its own damage, or ['core'].
   *  Empty for everyone who only makes stacks or ignores them. */
  spends?: string[];
  stacks?: StrongholdStack[];
  stacks_promoted?: StrongholdStack[];
}

/** One clause of an attribute sentence, as the build script read it. */
export interface StrongholdStack {
  n: number | 'dispatch';
  trigger: string;
  cadence: string;
  targets: string[];
  /** Present when the sentence counts the number PER something -- "for every Operator
   *  obtained this round". The multiplier is board state, so the number is a floor. */
  per?: string;
}

export interface StrongholdAlliance {
  /** Core or Add-on. */
  alliance_type: string;
  alliance: string;
  effect: string;
  warning: string | null;
  /** How many DIFFERENT operators of the alliance have to be on the field. */
  operators_to_activate: number | null;
  /**
   * Derived: the "<With N different [X] Operators on field>" clause of the effect,
   * ascending. Not in the source file, but the number the whole run is actually played
   * towards -- every Core activates at 3 and then pays again at 5 (Ægir) or 6 (all the
   * rest, and Yan a third time at 9), and that second payment is the one worth a squad
   * slot. Read off the text rather than curated because it IS the text: a season that
   * moves Kazimierz to 5 would move this with it.
   */
  milestones?: number[];
}

export interface StrongholdStrategy {
  leader: string;
  /** Derived: the mode's own stratagem badge, from public/stronghold-stratagems/. */
  icon?: string | null;
  initiator: string;
  life_points: number | null;
  effect: string;
  warning: string | null;
  how_to_unlock: string | null;
}

export interface StrongholdDecision {
  /** The season's own effectId. The key, because the name is not unique -- three
   *  different decisions are all called "Bounty/Flying I". */
  effect_id: string;
  name: string;
  effect: string;
  warning: string | null;
  /** Bounty decisions only: whether the decision is a "pointing stick" pick. */
  pointing_stick?: boolean;
  /** Tactical only: who it lands on -- You, Team, Stage, Enemies or Boss. The mode
   *  marks this with a glyph (one rook for you, a group of them for the team). */
  affects?: string | null;
  /** Derived: what the decision is ABOUT, which is what the game draws beside it --
   *  an enemy pool's glyph, the enemy itself, the operator who pledges, or the
   *  alliance being supported. Null when it is none of those. */
  icon?: string | null;
  /** Derived: the creature the decision fields, when its name does not say. Three
   *  separate decisions are called "Bounty/Flying I" and the enemy is the difference. */
  enemy?: string | null;
  /** Derived: the handbook record for the creature this decision puts on the field, so
   *  the row can open the same stats an enemy pool's faces do. Separate from `enemy`
   *  above, which exists only to tell same-named decisions apart and is null on the
   *  123 rows whose own name already says which creature it is.
   *
   *  Null where no ONE creature is named: the six "Multi-Round Bounties/OpFor: ..."
   *  rows field a faction rather than a creature, and a name the handbook holds twice
   *  is left alone rather than guessed at. */
  handbookEnemy?: { slug: string; name: string } | null;
}

export interface StrongholdItem {
  name: string;
  type: string;
  tier: string | null;
  base_effect: string | null;
  advanced_effect: string | null;
  description: string | null;
  price: number | null;
  /** The game's own icon for the item, under public/stronghold-items/. */
  icon: string | null;
}

export interface StrongholdEnemyGroup {
  group: string;
  description: string | null;
  /** Derived: the pool's own glyph, which is what the game's selector shows. */
  icon?: string | null;
  enemies: {
    /** The site-wide enemy code -- O2, LT1, RO05. */
    code: string | null;
    name: string;
    icon: string | null;
    /** Derived: this creature's key in the enemy handbook, so the page can open the
     *  handbook's own record for it from /enemy-detail/<slug>.json. */
    slug?: string | null;
  }[];
}

export interface StrongholdBoss {
  name: string;
  /** The site-wide enemy code. */
  code: string | null;
  icon: string | null;
  /** Derived: this creature's key in the enemy handbook, so the page can open the
   *  handbook's own record for it the way an enemy pool's faces do. All ten resolve
   *  today; null means the boss list and the handbook have drifted, and the row stays
   *  unopenable rather than opening someone else's stat block. */
  slug?: string | null;
  /** Which round it arrives on -- the hidden three come a round after the rest. */
  round: number;
  hidden: boolean;
  /** How often it is drawn. The hidden three carry much larger weights. */
  weight: number | null;
  hp: {
    standard: number | null;
    perilous: number | null;
    ultimate: number | null;
    training: number | null;
  };
}

export interface StrongholdData {
  operators: StrongholdOperator[];
  /** What each dispatch tier costs, from the game's own shop table. */
  tierCosts: TierCost[];
  alliances: StrongholdAlliance[];
  strategies: StrongholdStrategy[];
  tacticalDecisions: StrongholdDecision[];
  bountyDecisions: StrongholdDecision[];
  items: StrongholdItem[];
  enemyGroups: StrongholdEnemyGroup[];
  bosses: StrongholdBoss[];
  /** Tiers in the order the mode dispatches them, taken from the data rather than
   *  assumed: the sketch said five and the data holds six. */
  tiers: string[];
}

const TIER_ORDER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

function load<T>(file: string): T[] {
  const at = path.join(process.cwd(), 'data', 'gamemodes', 'stronghold', file);
  if (!fs.existsSync(at)) return [];
  return JSON.parse(fs.readFileSync(at, 'utf8')) as T[];
}

/**
 * Bounty decisions get a picture of what they put on the field. Tactical ones get
 * nothing, on purpose.
 *
 * The mode does mark a tactical decision, with one of five rook glyphs saying who it
 * lands on -- and that art is published nowhere. Searched: all 37 of the mode's pages on
 * prts (569 distinct images), the EN wiki's Stronghold Protocol category (140 files),
 * and both asset mirrors by the exact ids (icon_team_buff and its four siblings, zero
 * hits in either). Half a panel of portraits with the other half blank looked worse than
 * a panel with none, so the meaning is carried by the `affects` word instead.
 */
function withIcons(rows: StrongholdDecision[], alliances: StrongholdAlliance[], art: boolean): StrongholdDecision[] {
  if (!art) return rows;
  const picker = alliances.map((a) => ({ alliance: a.alliance, icon: allianceIcon(a.alliance) }));
  const shared = new Set(rows.map((d) => d.name)
    .filter((n, i, all) => all.indexOf(n) !== i));
  return rows.map((d) => ({
    ...d,
    icon: decisionIcon(d.name, d.effect, picker),
    // Only where the name is ambiguous. Naming the creature on a row that already says
    // "Wraith Leader/Bounty" would just print it twice.
    enemy: shared.has(d.name) ? decisionEnemy(d.effect) : null,
    handbookEnemy: decisionRecord(d.name, d.effect),
  }));
}

/** The creature a decision fields, read off "Adds 1 Bombtail to your next 2 battles". */
function decisionEnemy(effect: string): string | null {
  const adds = /\badds?\s+\d+\s+(.+?)\s+to\s+(?:your|the)\b/i.exec(effect || '');
  if (!adds) return null;
  const words = unquote(adds[1]).split(/\s+/).filter(Boolean);
  for (let from = 0; from < words.length; from += 1) {
    const rest = words.slice(from).join(' ');
    for (const candidate of [rest, rest.endsWith('s') ? rest.slice(0, -1) : null]) {
      if (candidate && enemyIconByName(candidate)) return candidate;
    }
  }
  return null;
}

export function strongholdData(): StrongholdData {
  const operators = load<StrongholdOperator>('stronghold_operators.json')
    .map((op) => ({ ...op, icon: operatorPortrait(op.operator) }));
  const alliances = load<StrongholdAlliance>('alliances.json').map((a) => ({
    ...a,
    milestones: [...String(a.effect ?? '').matchAll(/<With (\d+) different/g)]
      .map((m) => Number(m[1]))
      .filter((n, i, all) => Number.isFinite(n) && all.indexOf(n) === i)
      .sort((x, y) => x - y),
  }));
  const present = new Set(operators.map((o) => o.tier));
  return {
    operators,
    alliances,
    strategies: load<StrongholdStrategy>('strategies.json')
      .map((s) => ({ ...s, icon: stratagemIcon(s.leader) })),
    tacticalDecisions: withIcons(load<StrongholdDecision>('tactical_decisions.json'), alliances, false),
    bountyDecisions: withIcons(load<StrongholdDecision>('bounty_decisions.json'), alliances, true),
    items: load<StrongholdItem>('items.json'),
    enemyGroups: load<StrongholdEnemyGroup>('stronghold_enemies.json')
      .map((g) => ({
        ...g,
        icon: poolIcon(g.group),
        enemies: g.enemies.map((e) => ({ ...e, slug: handbookSlug(e.code, e.name) })),
      })),
    /* Same code-plus-name pairing the pool faces use, so a boss opens the same record
       the handbook would. */
    bosses: load<StrongholdBoss>('bosses.json')
      .map((b) => ({ ...b, slug: handbookSlug(b.code, b.name) })),
    tierCosts: load<TierCost>('tier_costs.json'),
    tiers: TIER_ORDER.filter((t) => present.has(t)),
  };
}

/**
 * The alliances an operator column can be built for, in the order the page offers them:
 * Core first, then Add-on, each alphabetical.
 *
 * One mismatch is reported rather than hidden, because a filter that silently drops an
 * alliance is worse than one that shows an empty column: Elite is a bond the mode
 * defines and no operator in the current pool carries. (Arcane used to be the mirror
 * case -- on operators, in no alliances.json row -- and building the file from the
 * gamedata instead of the wiki gave it its bonus text.)
 */
/**
 * The order the game lists alliances in.
 *
 * Not alphabetical and not derivable from anything in the datasets, so it is written
 * down. It matters because every alliance list on the site is read against the one
 * in the game -- a player scanning for Kjerag looks where Kjerag sits in the mode, and
 * a list that is merely tidy makes them read all twenty-three.
 */
const GAME_ORDER = [
  'Yan', 'Sargon', 'Victoria', 'Kjerag', 'Laterano', 'Ægir', 'Siracusa', 'Kazimierz',
  'Precision', 'Swift', 'Agile', 'Arcane', 'Durable', 'Aid', 'Foresight', 'Marvel',
  'Investor', 'Raid', 'Resilient', 'Harmony', 'Assist Operator', 'Solo', 'Elite',
];

export function alliancesForPicker(data: StrongholdData) {
  const counts = new Map<string, number>();
  for (const op of data.operators) {
    for (const a of op.alliances) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  const known = new Set(data.alliances.map((a) => a.alliance));
  const rows = data.alliances.map((a) => ({
    ...a,
    operators: counts.get(a.alliance) ?? 0,
    icon: allianceIcon(a.alliance),
  }));
  // An alliance operators claim that the alliance list never described. It still gets a
  // column, with no effect text, because the operators are real.
  for (const [name, n] of counts) {
    if (!known.has(name)) {
      rows.push({
        alliance: name, alliance_type: 'Add-on', effect: '', operators: n,
        warning: null, operators_to_activate: null, icon: allianceIcon(name),
      });
    }
  }
  /* The game's own order, which is what a player's eye already knows. Alphabetical
     within Core and Add-on was tidier and matched nothing they see in the mode, so
     every list here had to be re-read rather than recognised. Cores first, then the
     add-ons, exactly as the game lists them. */
  const at = (name: string) => {
    const i = GAME_ORDER.findIndex((x) => foldName(x) === foldName(name));
    return i === -1 ? GAME_ORDER.length : i;
  };
  const rank = (t: string) => (t === 'Core' ? 0 : 1);
  return rows.sort((a, b) => at(a.alliance) - at(b.alliance)
    /* Anything the season adds that this list has not heard of goes on the end, in the
       old order, rather than silently landing in the middle. */
    || rank(a.alliance_type) - rank(b.alliance_type)
    || a.alliance.localeCompare(b.alliance));
}

/** null for the three alliances no source has a badge for; the page reserves the box
 *  and draws a monogram instead, so a missing icon costs no layout. */
export function allianceIcon(name: string): string | null {
  const file = `${allianceSlug(name)}.webp`;
  return publicFileExists(`/alliance-icons/${file}`) ? stamped(`/alliance-icons/${file}`) : null;
}

/**
 * A decision's icon, which is a picture of what it puts on the field.
 *
 * The mode itself draws no per-decision art -- effectChoiceInfoDict has no icon field,
 * and the only thing near one is a five-way buff category that no source publishes. But
 * most decisions are NAMED after something that does have art, and that is what the
 * screen shows you: a bounty against Mudrock shows Mudrock, and "Bounty/Flying II" shows
 * the Flying pool's glyph. So this reads the name.
 *
 * Order matters. A pool name is checked first because "Bounty/Special III" would
 * otherwise be hunted for as an enemy called Special.
 */
const TYPE_WORDS: Record<string, string> = {
  Flying: 'flying', Frequency: 'frequency', Elements: 'elements', Continuous: 'continuous',
  Invisible: 'invisible', Refraction: 'refraction', Special: 'special',
  // The wiki writes the Elements pool as Injury, after the Elemental Injury it inflicts.
  Injury: 'elements',
};

/** The two lists spell the same enemy differently and neither is wrong: "Rat King"
 *  against 'Rat King', and Blocker-P against Blocker–P with an en dash. */
const unquote = (text: string) => text
  .replace(/["'\u2018\u2019\u201c\u201d]/g, '')
  .replace(/[\u2010-\u2015]/g, '-')
  .trim();

function decisionIcon(name: string, effect: string, picker: { alliance: string; icon: string | null }[]): string | null {
  const parts = name.split('/').map((p) => p.trim());

  // 1. The name says which enemy, in the form "<enemy>/<what it is>". A bare name is
  //    not claiming to field anything -- there is an enemy called Wealth, and the
  //    decision about funds is not about it.
  if (parts.length > 1) {
    for (const part of [parts[0], parts[parts.length - 1]]) {
      const enemy = enemyByWords(part);
      if (enemy) return enemy;
    }
  }

  // 2. Otherwise the effect text says it outright: "Adds 1 Bombtail to your next 2
  //    battles; defeat to obtain 2 Funds". That covers every "Bounty/Flying II" style
  //    row, which names a pool rather than a creature.
  const adds = /\badds?\s+\d+\s+(.+?)\s+to\s+(?:your|the)\b/i.exec(effect || '');
  if (adds) {
    const enemy = enemyByWords(adds[1]);
    if (enemy) return enemy;
  }

  // 3. Failing a specific creature, the pool it comes from.
  for (const part of parts) {
    const word = part.replace(/\s+(I|II|III|IV|V)$/, '').trim();
    const type = TYPE_WORDS[word];
    if (type && publicFileExists(`/stronghold-types/${type}.webp`)) {
      return stamped(`/stronghold-types/${type}.webp`);
    }
  }

  const pledge = /^(.*?)'?s Pledge$/.exec(name);
  if (pledge) {
    const face = operatorPortrait(pledge[1]);
    if (face) return face;
  }
  const support = /^(.*?) Support$/.exec(name);
  if (support) {
    // Yanese -> Yan, Kjeragi -> Kjerag, Investors' -> Investor: the adjective is the
    // alliance name with an ending on it, so the longest alliance it starts with wins.
    // Farsighted is the one that is a synonym rather than an inflection.
    const ALIAS: Record<string, string> = { farsighted: 'Foresight' };
    const stem = unquote(support[1]).toLowerCase();
    const alias = ALIAS[stem];
    if (alias) {
      const named = picker.find((a) => a.alliance === alias);
      if (named?.icon) return named.icon;
    }
    const hit = picker
      .filter((a) => stem.startsWith(a.alliance.toLowerCase().slice(0, 4)))
      .sort((a, b) => b.alliance.length - a.alliance.length)[0];
    if (hit?.icon) return hit.icon;
  }
  return null;
}

/**
 * This pool's creature, as the enemy handbook knows it.
 *
 * Keyed on code AND name, never the name alone: 21 names in the handbook belong to
 * more than one record (a Normal and an Elite of the same creature, most often), and
 * picking whichever came first would quietly open the wrong stat block. All 119
 * creatures in the mode's pools resolve on the pair, so a miss here means the pools
 * and the handbook have genuinely drifted and the row simply stays unopenable rather
 * than opening a lie.
 */
let handbookByCodeName: Map<string, string> | null = null;
function handbookSlug(code: string | null, name: string): string | null {
  if (!handbookByCodeName) {
    handbookByCodeName = new Map(
      getEnemySummaries().map((e) => [`${e.index ?? ''}\u0000${e.name}`, e.slug]),
    );
  }
  return handbookByCodeName.get(`${code ?? ''}\u0000${name}`) ?? null;
}

/**
 * A handbook record found by NAME alone, for the rows that have no enemy code to pair
 * with -- a bounty decision names its creature in prose, not in the site's code.
 *
 * Only where the name belongs to exactly one record. 21 of the handbook's 1,558 names
 * are held by two or more (a Normal and an Elite of the same creature, usually), and
 * for those this returns null rather than picking one: the row then simply does not
 * open, which is the same bargain handbookSlug above strikes. Nothing in the mode's
 * own tables currently lands on an ambiguous name, so this is a guard rather than a
 * behaviour anyone sees.
 *
 * Folded the same way enemyIcons folds its keys -- quotes stripped, dashes normalised
 * -- so a creature whose row already shows an icon also resolves a record.
 */
let handbookByName: Map<string, string | null> | null = null;
function handbookSlugByName(name: string | null): { slug: string; name: string } | null {
  if (!name) return null;
  if (!handbookByName) {
    const seen = new Map<string, string | null>();
    for (const e of getEnemySummaries()) {
      const key = unquote(e.name).toLowerCase();
      /* Second sighting of a name poisons it to null rather than overwriting, so an
         ambiguous name can never resolve to whichever record happened to come last. */
      seen.set(key, seen.has(key) ? null : e.slug);
    }
    handbookByName = seen;
  }
  const key = unquote(name).toLowerCase();
  const slug = handbookByName.get(MISSPELT[key] ?? key)
    ?? (key.endsWith('s') ? handbookByName.get(key.slice(0, -1)) : null);
  return slug ? { slug, name: unquote(name) } : null;
}

/**
 * The creature a bounty puts on the field, as the handbook knows it.
 *
 * Its own name first -- "Wraith Leader/Bounty" says so outright, and that covers all
 * but a handful -- then the effect line, which is where the "Multi-Round Bounties/..."
 * rows hide it. decisionEnemy already reads that sentence, so this reuses it rather
 * than parsing the same string a second way.
 */
function decisionRecord(name: string, effect: string): { slug: string; name: string } | null {
  return handbookSlugByName(name.split('/')[0]) ?? handbookSlugByName(decisionEnemy(effect));
}

/** "Tactical Training/Flying" -> the Flying glyph, which is the picture the mode's own
 *  enemy screen puts on that pool. */
function poolIcon(group: string): string | null {
  const slug = (group.split('/').pop() ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return publicFileExists(`/stronghold-types/${slug}.webp`) ? stamped(`/stronghold-types/${slug}.webp`) : null;
}

/** Tries the phrase, then the phrase with leading words dropped and a trailing plural
 *  removed: "Drone Blocker-Ps" is a number of the Blocker-P drone. */
function enemyByWords(phrase: string): string | null {
  const words = unquote(phrase).split(/\s+/).filter(Boolean);
  for (let from = 0; from < words.length; from += 1) {
    const rest = words.slice(from).join(' ');
    const hit = enemyIconByName(rest) ?? (rest.endsWith('s') ? enemyIconByName(rest.slice(0, -1)) : null);
    if (hit) return hit;
  }
  return null;
}

/** name -> icon, out of the index the enemy pages already resolved. */
const enemyIcons = (() => {
  const by = new Map<string, string>();
  const at = path.join(process.cwd(), 'public', 'enemies-index.json');
  if (!fs.existsSync(at)) return by;
  for (const e of JSON.parse(fs.readFileSync(at, 'utf8')) as { name: string; icon: string }[]) {
    if (e.icon) by.set(unquote(e.name).toLowerCase(), e.icon);
  }
  return by;
})();

/**
 * Spellings the season's own tables get wrong, mapped to what the enemy handbook says.
 *
 * Not a general fuzzy match -- one letter apart is exactly how "Wraith Leader" and
 * "Wrath Leader" would collide if they both existed. Each entry is a typo checked
 * against enemy_handbook_table, which is the spelling the rest of the site uses.
 */
const MISSPELT: Record<string, string> = {
  'nucleic maleficient': 'nucleic maleficent',
};

function enemyIconByName(name: string): string | null {
  const key = name.toLowerCase();
  return enemyIcons.get(key) ?? enemyIcons.get(MISSPELT[key] ?? '') ?? null;
}

/**
 * Portraits, reused rather than re-derived.
 *
 * public/operator-deploy.json already resolved every operator's icon against the
 * filesystem when the stage simulator's deploy bar was built -- which is the part that
 * is easy to get wrong, since the files are named "<name> - Base.webp" with the
 * apostrophes and diacritics intact. Matching is on the FOLDED name because this mode's
 * data and the site's spell some operators differently: kukki writes Mlynar, the site
 * has Młynar.
 */
const portraits = (() => {
  const by = new Map<string, string>();
  const at = path.join(process.cwd(), 'public', 'operator-deploy.json');
  if (!fs.existsSync(at)) return by;
  const deploy = JSON.parse(fs.readFileSync(at, 'utf8')) as {
    operators: { name: string; icon: string | null }[];
  };
  for (const op of deploy.operators) if (op.icon) by.set(foldName(op.name), op.icon);
  return by;
})();

export function operatorPortrait(name: string): string | null {
  return portraits.get(foldName(name)) ?? null;
}

/**
 * The mode's own badge for a Defence Strategy leader, falling back to the leader's
 * operator portrait.
 *
 * The badge is the better picture -- half the leaders are NPCs and enemy commanders
 * (Duck Lord, Goliath, Sciurus) that no operator portrait covers. But the seven
 * strategies Alliance Part 2 added have no badge on the wiki yet and the mode's band
 * icons are in no reachable asset mirror, so four of those seven at least are
 * operators and can show their own face. The rest get a monogram from the page.
 */
export function stratagemIcon(leader: string): string | null {
  const file = `${stratagemSlug(leader)}.webp`;
  if (publicFileExists(`/stronghold-stratagems/${file}`)) return stamped(`/stronghold-stratagems/${file}`);
  return operatorPortrait(leader.replace(/["'\u2018\u2019\u201c\u201d]/g, ''));
}
