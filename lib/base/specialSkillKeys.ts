import { cleanSkillName } from './activeBaseSkills';
import BUFFS from './special-skill-buffs.json';

/**
 * How the base calculator finds a special skill's handler: by its key, "Operator|Skill".
 *
 * The keys are names, and names are not stable. A CN operator's names are our translation
 * until Global ships the operator, and on that day the English refresh writes the game's own
 * (sync-operator-english.mjs): on 2026-10-14 Gallus² became GALLUS², Kal'tsit - Esperanta became
 * Kal'tsit Esperanta, and Closure's "Special Orders" became "Special Order". Every handler
 * keyed by the old name stopped matching without a word -- Closure's special orders left the
 * Trading Post's output (the calculator reference test caught that one in the content run), and
 * GALLUS²'s, Esperanta's, Pramanix's and Crackborne's skills fell back to text parsing unnoticed.
 *
 * So each key also records the game's buff ids behind it (special-skill-buffs.json, written by
 * scripts/build/build-special-skill-buffs.ts), which no rename touches, and an operator's record
 * keeps the names it had before (`aliases`: the catalogue adds the old one on every rename,
 * catalogue-model.mjs reconcileOperators). A skill is found by its operator's name or a former
 * one with its own name, exactly as before; failing that, by its buff id among the keys of that
 * same operator, under any of those names. Never another operator's key: a buff several share
 * (Clue Search α is ten operators' and only Caper's has a handler) keeps each operator on the
 * handler, or the text parsing, it had.
 *
 * The handler tables keep their keys as they were written: a release compiled before a rename
 * still finds them by name, the one after by buff id.
 */
export const SPECIAL_SKILL_BUFFS: Readonly<Record<string, readonly string[]>> = BUFFS;

const KEYS_BY_BUFF = new Map<string, string[]>();
for (const [key, buffIds] of Object.entries(SPECIAL_SKILL_BUFFS)) for (const buffId of buffIds) KEYS_BY_BUFF.set(buffId, [...(KEYS_BY_BUFF.get(buffId) ?? []), key]);

/** The keys of a buff id, in the map's order. */
export function specialSkillKeysOfBuff(buffId: string): readonly string[] {
  return KEYS_BY_BUFF.get(buffId) ?? [];
}

/** The handler key of an operator's base skill: a known key of its name or a former one
 *  (`formerNames`, the record's aliases) and the skill's name; else the key of the skill's buff id
 *  under one of those names; else its own names, which no handler has. */
// The key depends only on the operator, their former names and the skill; the calculator asks for it on every call
// for every placed operator, and active skills are shared objects (activeBaseSkills), so it is kept per skill object.
const remembered = new WeakMap<object, Map<string, string>>();
export function specialSkillKey(operatorName: string, skill: { name?: string | null; buffId?: string | null }, formerNames: readonly string[] = []): string {
  let byOperator = remembered.get(skill);
  if (!byOperator) { byOperator = new Map(); remembered.set(skill, byOperator); }
  const asked = formerNames.length ? `${operatorName}|${formerNames.join('|')}` : operatorName;
  let key = byOperator.get(asked);
  if (key === undefined) { key = keyOf(operatorName, skill, formerNames); byOperator.set(asked, key); }
  return key;
}
function keyOf(operatorName: string, skill: { name?: string | null; buffId?: string | null }, formerNames: readonly string[]): string {
  const skillName = cleanSkillName(skill.name);
  const named = `${operatorName}|${skillName}`;
  if (named in SPECIAL_SKILL_BUFFS) return named;
  for (const name of formerNames) if (`${name}|${skillName}` in SPECIAL_SKILL_BUFFS) return `${name}|${skillName}`;
  const keys = skill.buffId ? KEYS_BY_BUFF.get(skill.buffId) : undefined;
  if (!keys) return named;
  for (const name of [operatorName, ...formerNames]) {
    const key = keys.find((candidate) => candidate.startsWith(`${name}|`));
    if (key) return key;
  }
  return named;
}

/**
 * The keys the calculator tests for by hand rather than through a handler table: "is this
 * skill active". Typed, so a check can only name a key listed here, and every key listed here
 * is in special-skill-buffs.json (the build script reads this list), so a rename cannot break
 * one either.
 */
export const NAMED_SKILL_CHECKS = [
  // calculateBase.ts
  'Closure|Special Orders',
  'Pepe|Insightful',
  'U-Official|Naive Negotiator',
  'Proviso|Damages for Breach α',
  'Proviso|Damages for Breach β',
  'Tequila|Investment α',
  'Tequila|Investment β',
  'Ines|Shadow Gathering',
  'Ling|Keep the Wine Flowing',
  'Greyy the Lightningbearer|Dawnlight',
  'Justice Knight|"Beep beep, activate!"',
  "Eunectes|I've Got This",
  "Senshi|Senshi's Diner",
  'Virtuosa|Soundless Resonance',
  "Wiš'adel|Banner of Babel",
  'Chongyue|Solitary Light',
  'Morgan|No.1 Practice Partner',
  'Waai Fu|Cooperative Will',
  'Bubble|Bigger is Better!',
  'Vermeil|Recycling',
  // baseResources.ts computeResourcePools
  "Misumi Uika|Idol's Aura",
  'Wakaba Mutsumi|Monster of Acting',
  'Yahata Umiri|Reliable Companion',
  'Yūtenji Nyamu|Diligent Worker',
  'Mr. Nothing|"Obvious Deception"',
  'Chongyue|I am I',
  'Dusk|"Unstirred by Gain"',
  'Mulberry|Rescue Team - Post-Catastrophe Census',
  'Ling|"Vast Mountains and Rivers"',
  'Dusk|"Unmoved by Loss"',
  'Rosmontis|Extrasensory',
  'Ebenholz|Musicianship',
  'Ash|Intelligence Reserve',
  'Whisperain|Itinerant',
  "Bassline|Drawing the Heart's Voice",
  'Czerny|Adagio',
  'Iris|Bedtime Story',
  'Czerny|Walking the Keyboard',
  'Iris|Sleep Talking',
  'Whisperain|Memory Seeker',
  'Jieyun|Ancient Witchcraft',
  // baseSimulation.ts
  'Fiammetta|Communal Suffering',
] as const;
export type NamedSkillCheck = (typeof NAMED_SKILL_CHECKS)[number];

/** Whether any of the skills, an operator's, is the named one, by key. */
export function hasNamedSkill(operatorName: string, skills: readonly { name?: string | null; buffId?: string | null }[], key: NamedSkillCheck, formerNames: readonly string[] = []): boolean {
  return skills.some((skill) => specialSkillKey(operatorName, skill, formerNames) === key);
}
