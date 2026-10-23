/**
 * What a synergy gives: the buff kinds a contributor's skill, talent or module text grants
 * the faction or class it names (/synergies' Buff filter and its tags).
 *
 * The records carry no buff type, so it is read from the text. Only the clause that names
 * the faction or class is read -- "Attacks inflict Cold ...; other Kjerag Operators inflict
 * 4 seconds of Cold" grants Kjerag nothing the first half says -- and the whole text only
 * when that clause names no buff and points back at it ("DEF +70 ; ... that Vanguard or
 * Guard gains the same effect"). A text that names none of these is 'Other', never dropped: a wrong tag is
 * worse than an honest Other. scripts/tests/test-synergy-buffs.ts holds the rules to the
 * real texts.
 */
export const SYNERGY_BUFFS = ['ATK', 'ASPD', 'DEF', 'Max HP', 'HP recovery', 'Protection', 'SP', 'DP & redeploy', 'Ammo', 'Damage', 'Other'] as const;
export type SynergyBuff = (typeof SYNERGY_BUFFS)[number];

/** A number as the game writes a buff: "+16%", "16% (+2%)", "+0.5". */
const N = String.raw`\d+(?:\.\d+)?%?(?:\s*\(\s*[+-]?\d+(?:\.\d+)?%?\s*\))?`;

const RULES: readonly (readonly [SynergyBuff, RegExp])[] = [
  // "ATK +16%", "gain +16% ATK", "ATK increased to 112%", "ATK by +9%", "ATK and DEF +10%".
  // Not "ATK as Arts damage" (a hit scaled on the giver's ATK: Damage).
  ['ATK', new RegExp(String.raw`\bATK(?:\s+and\s+DEF)?\s*(?:\+|by\b|increased\b|to\s+\d)|(?:\+|gains?\s+|grants\s+\+?)${N}\s*ATK\b|ATK\s*\+`, 'i')],
  ['ASPD', /\bASPD\b/i],
  // "+80 DEF", "gain 11% DEF", "DEF +24%"; not "ignore 3% DEF" (Damage).
  ['DEF', new RegExp(String.raw`(?:\+|gains?\s+)${N}\s*DEF\b|\bDEF\s*(?:\+|by\b)|ATK\s+and\s+DEF`, 'i')],
  // "+20% Max HP", "Max HP +15%", "Max HP by 120"; not "recover 2% of Max HP" (HP recovery).
  ['Max HP', new RegExp(String.raw`(?:\+|gains?\s+)${N}\s*Max HP\b|\bMax HP\s*(?:\+|by\b)`, 'i')],
  ['HP recovery', /\b(?:recover|recovers|restores?|heals?|healing)\b[^;.]*?\bHP\b|\bHP (?:per|every) second\b/i],
  ['Protection', /\bdodge\b|\bshields?\b|\bbarrier\b|\bresist\b|status resistance|immunity|\bless (?:physical|arts|damage)\b|damage is reduced|will not retreat|cannot have their ASPD decrease/i],
  ['SP', /\bSP\b|skill points?|activate their skills/i],
  ['DP & redeploy', /\bDP\b|redeployment time/i],
  ['Ammo', /\bammo\b|\bbullets?\b/i],
  ['Damage', /more damage|damage dealt|extra \d+(?:\.\d+)?% of\b[^;.]*\bATK as\b|as true damage|ignore \d+(?:\.\d+)?% (?:DEF|RES)|all-out-attack|reflect\b|additional hit/i],
];

/** A clause that hands the faction what the rest of the text describes: "gains the same
 *  effect", "50% of this boost effect", "effect is doubled for [Laterano] Operators",
 *  "Batteries that only take effect on Casters", "gain 1 additional stack". */
const REFERS_BACK = /\b(?:same|this|the)\s+(?:\w+\s+)?(?:effect|buff|boost|multiplier)\b|\beffect (?:is )?doubl|\bdouble the effect\b|\btakes? effect on\b|\badditional stacks?\b/i;

function tagsIn(text: string): SynergyBuff[] {
  return RULES.filter(([, rule]) => rule.test(text)).map(([tag]) => tag);
}

/** The clauses of a text: split at semicolons and at sentence ends. */
function clauses(text: string): string[] {
  return text.split(/;|\.(?=\s|$)/).map((c) => c.trim()).filter(Boolean);
}

/** The buff kinds one source text grants `keyword` (the faction or class as the text names
 *  it), in SYNERGY_BUFFS order; ['Other'] when it names none. */
export function synergyBuffs(text: string | null | undefined, keyword: string | null | undefined): SynergyBuff[] {
  if (!text) return ['Other'];
  const word = (keyword ?? '').toLowerCase().replace(/s$/, '');
  const named = word ? clauses(text).filter((c) => c.toLowerCase().includes(word)) : [];
  const clause = named.join(' ; ');
  const fromClause = tagsIn(clause);
  // The whole text only when the clause names no buff and points back at the rest of it
  // (or no clause could be told apart); otherwise the giver's own buffs would be read as
  // the faction's (Mutsumi's <Substitute> DEF is not Ave Mujica's).
  const tags = fromClause.length ? fromClause : !named.length || REFERS_BACK.test(clause) ? tagsIn(text) : [];
  return tags.length ? tags : ['Other'];
}
