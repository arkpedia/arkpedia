import { clausesWith } from './clauses';

/**
 * Who an effect lands on. A technique rule finds words ("take ... Arts damage", "recover
 * ... HP", "Barrier"); this reads the clause they sit in and says whether the operator
 * does it to enemies, to allies or to itself, so one technique never mixes them (owner,
 * 2026-10-23: "Arts Damage Taken" held operators that make enemies take more Arts damage
 * beside ones that take less themselves, and Necrass, whose skill only deals Arts damage).
 *
 * Each rule below takes one clause and returns the techniques it is: the same one, another
 * (an ally's version, Damage Reduction, Damage Over Time), several, or none. A match keeps
 * every technique any of its clauses gives it. Runs inside detectAutoTechniqueMatches, so
 * the operator pages and /techniques read the same answer.
 * scripts/tests/test-technique-direction.ts holds each rule to real texts.
 */

/** The techniques one clause is. A name ending in '?' is only a default -- the clause names
 *  no one, as "The barrier can absorb Arts damage" after "grants all targets a Barrier" --
 *  and gives way when another clause of the same match names who it is for. */
type Direction = (clause: string, ownName: string | null) => string[];

/** What a redirected match is called and how it is defined. */
export const REDIRECTED_TECHNIQUES: Record<string, string> = {
  'Damage Reduction': 'Takes less Physical or Arts damage.',
  'Damage Over Time': 'Enemies incur a damage per second for a certain duration',
  'Ally Healing': "Restores allies' HP, though not a Medic.",
  'Ally Barrier': 'Grants allies a barrier that absorbs damage before their HP does.',
  'Ally Status Resistance': 'Grants allies status resistance: negative statuses on them last half as long.',
  'SP Recovery Booster': 'Able to supply additional SP to specific units',
};

/** The operator itself among those it gives to: "to Pallas and the Operator ahead", "grants
 *  self and Structural Principle", "both Exusiai the New Covenant and the target", "Muelsyse
 *  gains 10 SP", or a clause that opens on its own gain ("Gains 3 SP and grants 1 SP to
 *  another Vanguard"). Not its name as a condition or a scale: "When Saria restores an ally's
 *  HP", "When this unit is in the squad", "equal to 90% of Nightingale's ATK". */
const namesSelf = (clause: string, ownName: string | null) => {
  if (/\b(?:self|herself|himself|itself|themselves|both)\b/i.test(clause)) return true;
  if (/^\s*(?:immediately\s+)?(?:gains?|recovers?|restores?\s+\d|obtains?)\b/i.test(clause)) return true;
  const who = ['this unit', 'this operator', ...(ownName ? [ownName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')] : [])].join('|');
  return new RegExp(String.raw`\bto\s+(?:${who})\b(?!\s*['’]s)|\b(?:${who})\b(?!\s*['’]s)\s+(?:also\s+|additionally\s+)?(?:gains?|recovers?|restores?\s+\d|obtains?)\b`, 'i').test(clause);
};

/* --- damage taken ---------------------------------------------------------------------- */

/** Damage the operator takes less of: "take 35% less Physical and Arts damage", "take -9%". */
const TAKES_LESS = /\b(?:take|takes|receive|receives)\b.{0,30}(?:\bless\b|-\s?\d)(?:(?!heal).){0,30}\bdamage\b|damage taken\s*-\s?\d|\breduc\w*\b.{0,40}\bdamage taken\b/i;
/** Damage that keeps hitting: "per second", "every 0.5s", "every 2 seconds". */
const OVER_TIME = /\bper second\b|\bevery\s+(?:second|\d+(?:\.\d+)?\s*(?:s|sec|seconds?)\b)/i;

/** Enemies taking more of a damage type: "+55%" on its damage taken, or "take +21% ..." it. */
const takesMore = (kind: string) => new RegExp(
  `${kind} damage taken.{0,30}(?:(?<!\\()\\+|\\bincreas)|\\bincreas\\w*\\b.{0,30}${kind} damage taken`
  + `|\\b(?:take|takes)\\s+(?:\\+\\s?\\d+(?:\\.\\d+)?%|\\d+(?:\\.\\d+)?%\\s+more\\b|more\\b|increased\\b|additional\\b|extra\\b).{0,24}${kind} damage`,
  'i',
);

/** "X Damage Taken" is a debuff on enemies. Taking less is Damage Reduction; a hit that
 *  only lands repeatedly is Damage Over Time; a hit that does neither is not a technique
 *  at all ("all surrounding enemies take 450% of Necrass's ATK as Arts damage"). */
const damageTaken = (name: string, kind: string): Direction => (clause) => {
  // Less first: "reduces Physical and Arts damage taken by 43% (+3%)" (Bena) is a reduction.
  if (TAKES_LESS.test(clause)) return ['Damage Reduction'];
  if (takesMore(kind).test(clause)) return [name];
  if (OVER_TIME.test(clause)) return ['Damage Over Time'];
  return [];
};

/* --- healing, barriers, status resistance, SP: self or allies ----------------------- */

const RECIPIENT = String.raw`(?:ally|allies|allied|friendly|operators?|targets?|them|that operator)`;
/** Another unit's HP restored: "restores the HP of all allies", "HP to the ally", "heals a
 *  nearby friendly unit", "allied units ... recover HP". Not "When there are at least 4
 *  Operators on the field, recovers 2% HP" (Yu): there the operators are the condition. */
const HEALS_OTHERS = new RegExp(
  String.raw`\b(?:restores?|recovers?|heals?|healing)\b.{0,14}\b(?:(?:their|the)\s+hp\b|hp\s+of\b|hp\s+to\b(?!\s+(?:the\s+)?(?:max|maximum|full|\d)|\s+(?:this unit|self|herself|himself|itself)\b)|(?:a|all|the|nearby|surrounding|up to \d+|\d+)?\s*(?:nearby\s+)?${RECIPIENT}\b)`
  + String.raw`|(?<!there (?:are|is)\b.{0,20})\b(?:ally|allies|allied|friendly|operators?|targets?)\b.{0,60}\b(?:recover|recovers|restore|restores)\b.{0,30}\bhp\b`
  + String.raw`|\b(?:restores?|recovers?|heals?)\b.{0,50}\bto\s+(?:a|an|all|the|\d+)?\s*(?:nearby\s+)?${RECIPIENT}\b`,
  'i',
);
const selfSustain: Direction = (clause, ownName) => {
  // "When skill is active, Trait no longer restores HP" (Misumi Uika) heals no one.
  if (/\bno longer\s+(?:restores?|recovers?|heals?)\b/i.test(clause)) return [];
  // "recover 2 additional SP when hitting an enemy with full HP" (Puzzle): the HP is the enemy's.
  // ("restores double SP and HP" restores both.)
  // Each verb with the words up to its HP, read one by one ("recovers 20 DP ... restores the
  // HP of surrounding allied Operators" has a real one after the DP).
  const pairs = [...clause.matchAll(/\b(?:recover\w*|restor\w*|heal\w*)\b/gi)]
    .map((m) => clause.slice(m.index! + m[0].length).match(/^(.{0,60}?)\bhp\b/i)?.[1])
    .filter((between): between is string => between !== undefined);
  if (pairs.length && pairs.every((between) => /\b(?:sp|dp|skill points?)\b/i.test(between) && !/\band\s*$/i.test(between))) return [];
  if (!HEALS_OTHERS.test(clause)) return ['Self-Sustain'];
  return namesSelf(clause, ownName) ? ['Self-Sustain', 'Ally Healing'] : ['Ally Healing'];
};

/** A barrier handed to another unit: "grants an Operator a Barrier", "creates a Protective
 *  Barrier for them", "the target Operator gain a Barrier". Not "grants self and Structural
 *  Principle a Barrier" (Mechanist), nor "granting a Barrier" with no one named (Zuo Le). */
const BARRIER_OTHERS = new RegExp(
  String.raw`\bgrant\w*\s+(?:a|an|the|all|that|\d+)?\s*(?:nearby\s+)?${RECIPIENT}\b`
  + String.raw`|\b(?:ally|allies|allied|operators?|targets?|them)\b.{0,100}\bbarrier\b|\bbarrier\b.{0,30}\bfor them\b`
  + String.raw`|\bbarrier\b.{0,25}\bto\s+(?:the|a|an|all)?\s*(?:target\s+)?${RECIPIENT}\b|\bbarrier provided by\b`,
  'i',
);
const barrier: Direction = (clause, ownName) => {
  // "for self and other operators who have a Barrier granted by her Device(s)" (Catherine):
  // the barrier is the devices' gift to others; her own share is only the ATK and DEF.
  if (/\b(?:who have|with)\s+a\s+barrier\b/i.test(clause)) return ['Ally Barrier'];
  if (!BARRIER_OTHERS.test(clause)) return [/\b(?:gains?|obtains?)\b.{0,40}\bbarrier\b/i.test(clause) || namesSelf(clause, ownName) ? 'Barrier Generation' : 'Barrier Generation?'];
  return namesSelf(clause, ownName) ? ['Barrier Generation', 'Ally Barrier'] : ['Ally Barrier'];
};

/** Status resistance handed to others, or the operator's own. "Allied units with status
 *  resistance ... restore HP" (Whisperain's talent) uses it and grants nothing. */
const statusResistance: Direction = (clause, ownName) => {
  if (/\bwith status resistance\b/i.test(clause)) return [];
  const others = /\b(?:allies|ally|allied|operators?|targets?|them)\b.{0,60}\b(?:gain|gains|granted|grant|grants|get|gets)\b.{0,60}status resistance|\bgrant\w*\b.{0,60}status resistance/i;
  if (others.test(clause)) return ['Ally Status Resistance'];
  return [/\bgains?\b.{0,60}status resistance/i.test(clause) || namesSelf(clause, ownName) ? 'Status Resistance' : 'Status Resistance?'];
};

/** SP for other units ("restores 1 Skill Point to all deployed Sniper allies", "gives +2 SP
 *  to the attacker") is SP Recovery Booster; the operator's own stays SP Charging. A clause
 *  that only slows or stops SP gains nothing ("SP recovery is slowed except when blocking"). */
const SP_PENALTY = /\bsp recovery is slowed\b|\bstops?\b.{0,20}\bsp\b|\bcannot (?:gain|recover)\b.{0,20}\bsp\b|\bloses?\s+\d+\s+sp\b/i;
/** SP actually gained: "gain 1 SP", "SP recovery +0.2/sec", "+6 Initial SP", "+0.5 SP/second".
 *  Not SP as a condition: "when SP is full" (Hadiya), "SP is less than or equal to half" (Aurora). */
const SP_GAIN = /\b(?:gains?|gaining|recovers?|recovering|restores?|restoring|obtains?|grants?|granting|gives?|giving|provides?|supplies|supply|replenish\w*)\b.{0,40}\b(?:sp|skill points?)\b|\b(?:sp|skill points?)\s*(?:recovery|regeneration)?(?:\s*rate)?\s*(?:\+|by\s*\+?\d)|\bincreases?\b.{0,30}\b(?:sp|skill point) recovery\b|\b(?:sp|skill point) recovery(?: rate)?\b.{0,25}\+\s?\d|\b(?:initial|starting)\s+sp\b|\+\s?\d+(?:\.\d+)?\s*sp\b|\b\d+(?:\.\d+)?\s*sp\s*(?:\/|per\b|every\b)/i;
const SP_OTHERS = new RegExp(
  String.raw`\b(?:allies|ally|allied|operators?|vanguards|attacker|friendly)\b[^,]{0,60}\b(?:gain|gains|recover|recovers|restore|restores|obtain|obtains|get|gets)\b.{0,30}\b(?:sp|skill points?)\b`
  + String.raw`|\b(?:grants?|gives?|restores?|supplies|supply|provides?)\b.{0,60}\b(?:sp|skill points?)\b.{0,30}\bto\s+(?:a|an|all|the|other|another|each|every|\d+)?\s*(?:deployed\s+|nearby\s+|random\s+|healed\s+)?${RECIPIENT.slice(0, -1)}|attacker|\w+ allies|anyone)`
  + String.raw`|\b(?:grants?|granting|gives?|giving|restores?)\s+(?:the|an|a|all|that)?\s*${RECIPIENT}\b.{0,40}\b(?:sp|skill points?)\b`
  // "increases the SP recovery rate of all Casters" (Mostima), "of all allies" (Ptilopsis).
  + String.raw`|\b(?:sp|skill point) recovery(?: rate)? of (?:all|other|nearby) (?:\w+\s+)?(?:allies|operators|\w+s)\b`,
  'i',
);
const sp: Direction = (clause, ownName) => {
  if (SP_PENALTY.test(clause) || !SP_GAIN.test(clause)) return [];
  if (!SP_OTHERS.test(clause)) return [/\b(?:gains?|recovers?|restores?|obtains?)\b.{0,40}\b(?:sp|skill points?)\b/i.test(clause) || namesSelf(clause, ownName) ? 'SP Charging' : 'SP Charging?'];
  return namesSelf(clause, ownName) ? ['SP Charging', 'SP Recovery Booster'] : ['SP Recovery Booster'];
};

/* --- statuses and debuffs on enemies ----------------------------------------------- */

/** A stat lowered on an enemy, not on the operator ("ATK -5%, but allied Operators within
 *  range receive 17% more healing": Rose Salt's cost, not ATK Down). */
const ON_ENEMIES = /\b(?:enem\w*|targets?|attackers?|them|their|inflict\w*|foes?)\b/i;
const enemyStat = (name: string): Direction => (clause) => (ON_ENEMIES.test(clause) ? [name] : []);

const DIRECTIONS: Record<string, Direction> = {
  'Arts Damage Taken': damageTaken('Arts Damage Taken', 'arts'),
  'Physical Damage Taken': damageTaken('Physical Damage Taken', 'physical'),
  'Self-Sustain': selfSustain,
  'Barrier Generation': barrier,
  'Status Resistance': statusResistance,
  'SP Charging': sp,
  // Frozen immunity granted to allies is not Cold applied to enemies (SilverAsh the Reignfrost).
  'Cold / Freeze': (clause) => (/\bimmun/i.test(clause) ? [] : ['Cold / Freeze']),
  // Necrosis the operator receives (Philae, Mutsumi Wakaba) is not Necrosis it deals.
  Necrosis: (clause) => (/\breceiv\w*\b/i.test(clause) && !/\bdeal\w*\b/i.test(clause) ? [] : ['Necrosis']),
  // "has a 20% chance to Stun themselves" (Spuria's S2): a cost, not a Stun.
  // Also "instead Stunning all allied units within range" (Conviction's S2 when it fails).
  Stun: (clause) => (/stun/i.test(clause.replace(/\bstun\w*\s+(?:themselves|herself|himself|itself|self)\b|\bstun\w*\s+(?:all\s+)?allied\s+(?:units|operators)\b/gi, '')) ? ['Stun'] : []),
  // "puts herself and the Operator ... to Sleep" (Titi): her own clause; her enemies' is another.
  // ... nor "The Slumberfoot falls asleep and recovers 14% Max HP" (Blacknight's own summon).
  Sleep: (clause) => (/\bputs?\s+(?:herself|himself|itself|themselves)\b|\bfalls?\s+asleep\b/i.test(clause) && !/\benem/i.test(clause) ? [] : ['Sleep']),
  // The status, not "SP recovery is slowed" (the HES-X modules) or notes that "fly slower".
  Slow: (clause) => (/\bslow/i.test(clause.replace(/\bsp recovery is slowed\b|\bslower\b|\bslowest\b|\bslowly\b/gi, '')) ? ['Slow'] : []),
  // A skill's stored charges ("Can store 3 charges", "consumes an additional charge"), not a
  // "Charged effect" (Overload / Charged), a Liberator's "+100% charge", or "Cluster Charge".
  'Hold Charges': (clause) => (/\b(?:store|stores|storing|hold|holds)\b.{0,20}\bcharges?\b|\bcan charge for\b|\bmax(?:imum)?\s+\d+\s+charges\b|\bat maximum charges\b|\b(?:consumes?|removes?|releases?)\s+(?:an?\s+|all\s+|\d+\s+)?(?:additional\s+)?(?:skill\s+)?charges?\b|\bwhen charges are full\b/i.test(clause) ? ['Hold Charges'] : []),
  // "drags" and "pulls", not "Dragon Arrows" (Toddifons).
  'Pseudo-Puller': (clause) => (/\b(?:drag|drags|dragged|dragging|pull|pulls|pulled|pulling)\b/i.test(clause) ? ['Pseudo-Puller'] : []),
  'DEF Down': enemyStat('DEF Down'),
  'RES Down': enemyStat('RES Down'),
  'ATK Down': enemyStat('ATK Down'),
  'ASPD Down': enemyStat('ASPD Down'),
  'Movement Speed Down': enemyStat('Movement Speed Down'),
  'Hit Rate Down': enemyStat('Hit Rate Down'),
};

interface Match {
  name: string | null;
  description: string | null;
  viaBranch: boolean;
  matchedKeyword: string | null;
  matchedKeywordEnd: string | null;
  highlightSeparately: boolean;
}

/** The techniques a set of rule matches really are, once each is read for who it lands on.
 *  `text` is the text the rules read (casing kept); `ownName` is lowercased or null. A match
 *  whose words cannot be found clause by clause is kept as it is: there is nothing to read. */
export function directTechniqueMatches<M extends Match>(matches: M[], text: string, ownName: string | null): M[] {
  const out: M[] = [];
  const seen = new Set<string>();
  const add = (m: M) => {
    if (!m.name || seen.has(m.name)) return;
    seen.add(m.name);
    out.push(m);
  };
  for (const m of matches) {
    const direct = m.name ? DIRECTIONS[m.name] : undefined;
    if (!direct || m.viaBranch || !m.matchedKeyword) { add(m); continue; }
    let clauses = clausesWith(text, m.matchedKeyword, m.matchedKeywordEnd, m.highlightSeparately);
    if (!clauses.length) clauses = clausesWith(text, m.matchedKeyword, null, m.highlightSeparately);
    if (!clauses.length) { add(m); continue; }
    const said = clauses.flatMap((clause) => direct(clause, ownName));
    const strong = said.filter((name) => !name.endsWith('?'));
    const names = new Set(strong.length ? strong : said.map((name) => name.slice(0, -1)));
    for (const name of names) add(name === m.name ? m : { ...m, name, description: REDIRECTED_TECHNIQUES[name] ?? m.description });
  }
  return out;
}

/** Every technique a redirect can produce, for the Kind filter's test. */
export const DIRECTED_TECHNIQUE_NAMES = Object.keys(REDIRECTED_TECHNIQUES);
