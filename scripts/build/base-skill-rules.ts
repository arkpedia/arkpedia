/**
 * The rules of the base skill table build (build-base-skill-effects.ts): how a skill's text is read into the
 * table's shapes, room by room, and the guards on that reading. Here rather than in the build script so the
 * tests can read a description (a malformed one included) the way the build does.
 */
import type { BaseSkillEffectEntry, SkillCondition, SkillEffect, SkillRoomType, SkillShape } from '../../lib/base/baseSkillEffects';
import type { SkillOverride } from './base-skill-overrides';

export interface Buff { buffId: string; roomType: SkillRoomType; buffCategory: BaseSkillEffectEntry['buffCategory']; description: string; efficiency: number | null; targets: Record<string, unknown> | string[] | null }

/**
 * The text as the rules read it. In-game descriptions carry typos and odd spacing ("+30%productivity",
 * "Morale -0.25per hour", a no-break space inside "Specialization Level"), and a pattern that fails on one
 * silently drops a number, so the text is settled first: tags off, Unicode compatibility forms and every kind
 * of space folded to plain ones, a space put between a number or percent sign and a word, and after a comma or
 * semicolon. The build reports every skill where this changes what the rules read.
 */
export function normalizeDescription(text: string | null | undefined): string {
  return (text ?? '')
    .replace(/<[^>]*>/g, '')
    .normalize('NFKC')
    .replace(/[\u00a0\u2000-\u200b\u202f\u3000]/g, ' ')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/(\d|%)(?=[A-Za-z])/g, '$1 ')
    .replace(/([,;])(?=\S)/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const strip = (text: string | null | undefined) => (text ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
export const family = (buffId: string) => buffId.replace(/\[\d+\]$/, '');
export const pct = (m: RegExpMatchArray | null) => (m ? Number(m[1]) / 100 : null);
/** A rate the text states after its words ("productivity +30%") or, as some descriptions do, before them ("+30% productivity"). */
const rate = (text: string, after: RegExp, words: string) => pct(text.match(after)) ?? pct(text.match(new RegExp(`([+-]?\\d+(?:\\.\\d+)?)%\\s*(?:to\\s+)?${words}`, 'i')));
export const num = (m: RegExpMatchArray | null) => (m ? Number(m[1]) : null);
export const chinese = (text: string) => /[一-鿿]/.test(text);

// The calculator's own patterns (lib/base/baseProductivity.ts), copied so a flat entry reads the same number.
const PRODUCTIVITY = /productivity[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i;
const ORDER_ACQUISITION = /order acquisition[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i;
const ORDER_LIMIT = /order limit[^.\d+-]{0,10}?([+-]\d+)/i;
const CAPACITY = /capacity[^.]{0,30}?([+-]\d+)/i;
const CLUE_SPEED = /clue search speed[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i;
const DRONE = /(?:drone recovery rate|drone charging speed)[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i;
const HR_SPEED = /hr contacting speed[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i;
const MORALE = /morale consumed per hour[^%\d]{0,10}?([+-]?\d+(?:\.\d+)?)/i;
const ALL_OPERATORS_MORALE = /morale (consumed per hour|loss)[^.]{0,20}?(of operators in the|of all operators)/i;
const ALL_OPERATORS_MORALE_VALUE = /(?:of (?:all )?operators in the [a-z\s]+?)\s*,?\s*([+-]?\d+(?:\.\d+)?)/i;
const CC_ORDER_EFFICIENCY = /order efficiency[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i;
const CC_FACTORY = /factor(?:y|ies)[^%]{0,40}?productivity[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i;
const CC_CLUE = /clue collection speed[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i;
const CC_MORALE = /increase[s]? morale[^%\d]{0,60}?([+-]?\d+(?:\.\d+)?)\s*(?:per hour|\/\s*hr)/i;
const BYPRODUCT = /byproduct[^%]{0,60}?(\d+(?:\.\d+)?)%/i;
const RECIPE_MORALE = /(-\d+) Morale cost|Morale cost[^\d-]{0,20}?(-\d+)|by ([+-]\d+)/i;
const RECIPE_FIXED = /only consume (\d+) Morale/i;
const RECIPE_FAMILY = /process\s+([\w -]+?)(?:-type| Block material| Cluster materials)/i;
const RECIPE_BASE_COST = /base Morale cost of (\d+)/i;
const RECIPE_COST = /(?:cost|costs)\s+(?:of\s+)?(\d+)\s*(?:Morale)?\s*(or (?:more|higher))?/i;
const RECIPE_PER_DORM = /for every 1 Operator with (\d+) or less Morale assigned to the Dorms/i;
const TRAINING_ROSTER = /for each ([A-Za-z ]+?) Operator in the Base/i;
const TRAINING_CAP = /caps at (\d+) Operators/i;
/** The group rosters (lib/base/baseGroupRosters.ts) the training skills count by their text's name. */
const TRAINING_ROSTERS: Record<string, string> = { Knight: 'KNIGHTS', Defending: 'R6_DEFENDING', Attacking: 'R6_ATTACKING', Sami: 'SAMI', Siracusa: 'SIRACUSA', 'Abyssal Hunter': 'ABYSSAL_HUNTERS' };
const CN_CLASSES: [RegExp, string][] = [[/先锋/, 'PIONEER'], [/近卫/, 'WARRIOR'], [/重装/, 'TANK'], [/狙击/, 'SNIPER'], [/术师/, 'CASTER'], [/医疗/, 'MEDIC'], [/辅助/, 'SUPPORT'], [/特种/, 'SPECIAL']];
const ALL_CLASSES = ['PIONEER', 'WARRIOR', 'TANK', 'SNIPER', 'CASTER', 'MEDIC', 'SUPPORT', 'SPECIAL'];
const CN_RECIPE_KINDS: [RegExp, string][] = [[/基建材料/, 'F_BUILDING'], [/精英材料/, 'F_EVOLVE'], [/技巧概要/, 'F_SKILL'], [/芯片/, 'F_ASC']];
const ALL_RECIPE_KINDS = ['F_BUILDING', 'F_EVOLVE', 'F_SKILL', 'F_ASC'];
const RECYCLE = /material conversion efficiency[^%]{0,20}?([+-]?\d+(?:\.\d+)?)%/i;
const TAILORING_MORALE = /morale consumed per hour[^\d+-]{0,30}?([+-]?\d+(?:\.\d+)?)/i;
const MASTERY = /Specialization Level (\d)/i;

function morale(text: string): SkillEffect[] {
  if (ALL_OPERATORS_MORALE.test(text)) { const v = num(text.match(ALL_OPERATORS_MORALE_VALUE)); return v === null ? [] : [{ kind: 'roomMorale', value: v }]; }
  const v = num(text.match(MORALE));
  return v === null ? [] : [{ kind: 'selfMorale', value: v }];
}
function product(text: string): SkillEffect['product'] | undefined {
  if (/battle record/i.test(text)) return 'Battle Records';
  if (/precious metal/i.test(text)) return 'Precious Metals';
  if (/originium formula/i.test(text)) return 'Originium Shards';
  return undefined;
}
/** Dormitory recovery: each clause's number after "restores"/"recovered", classed by whom the clause gives it to. */
function dormitory(text: string): SkillEffect[] {
  const out: SkillEffect[] = [];
  for (const clause of text.split(/;|, but |, and |furthermore, |\. /i)) {
    const m = clause.match(/(restores?|recover(?:s|y|ed))[^+\-\d]{0,60}?([+-]?\d+(?:\.\d+)?)/i);
    if (!m) continue;
    const c = clause.toLowerCase();
    const kind: SkillEffect['kind'] = /another operator/.test(c) ? 'recoverySingle' : /all other operators/.test(c) ? 'recoveryOthers' : /all operators/.test(c) ? 'recoveryAll' : 'recoverySelf';
    out.push({ kind, value: Number(m[2]) });
  }
  return out;
}
const CN_KINDS: [RegExp, SkillEffect['kind']][] = [[/生产力/, 'productivity'], [/订单获取效率/, 'orderEfficiency'], [/订单上限/, 'orderLimit'], [/心情每小时消耗/, 'selfMorale'], [/线索搜集速度/, 'clueSpeed'], [/联络速度/, 'hrSpeed'], [/无人机充能速度/, 'droneRate'], [/材料转化效率/, 'recycleEfficiency'], [/专精技能训练速度/, 'trainingSpeed'], [/副产品/, 'byproductChance']];
function chineseRule(text: string): SkillEffect[] {
  // The first plain number of each kind, before or after its words: a CN-only skill is a future operator's, read
  // here so the table is whole, and replaced by the English rules once Global ships the text.
  const out: SkillEffect[] = [];
  for (const [re, kind] of CN_KINDS) {
    const m = text.match(new RegExp(`${re.source}[^+\\-\\d]{0,8}([+-]?\\d+(?:\\.\\d+)?)(%?)`)) ?? text.match(new RegExp(`([+-]\\d+(?:\\.\\d+)?)(%?)${re.source}`));
    if (!m) continue;
    const effect: SkillEffect = { kind, value: m[2] ? Number(m[1]) / 100 : Number(m[1]) };
    // Training speed names its classes (近卫与术师干员) or every operator's (干员的).
    if (kind === 'trainingSpeed') { const classes = CN_CLASSES.filter(([re]) => re.test(text)).map(([, code]) => code); effect.targets = classes.length ? classes : ALL_CLASSES; }
    // A byproduct chance names its recipe kind (精英材料) or any (任意材料).
    if (kind === 'byproductChance') { const kinds = CN_RECIPE_KINDS.filter(([re]) => re.test(text)).map(([, code]) => code); effect.targets = kinds.length ? kinds : ALL_RECIPE_KINDS; }
    out.push(effect);
  }
  // Dormitory recovery per hour: for everyone in the room, or the operator's own.
  const rec = text.match(/心情每小时恢复([+-]\d+(?:\.\d+)?)/);
  if (rec) out.push({ kind: /所有干员/.test(text) ? 'recoveryAll' : 'recoverySelf', value: Number(rec[1]) });
  return out;
}
export function rules(buff: Buff, text: string): { effects: SkillEffect[]; interaction?: BaseSkillEffectEntry['interaction']; note?: string } {
  if (chinese(text)) return { effects: chineseRule(text) };
  const out: SkillEffect[] = [];
  let interaction: BaseSkillEffectEntry['interaction'];
  let note: string | undefined;
  const push = (kind: SkillEffect['kind'], value: number | null, more: Partial<SkillEffect> = {}) => { if (value !== null) out.push({ kind, value, ...more }); };
  switch (buff.roomType) {
    case 'MANUFACTURE': push('productivity', rate(text, PRODUCTIVITY, 'productivity'), { product: product(text) }); push('capacity', num(text.match(CAPACITY))); out.push(...morale(text)); break;
    case 'TRADING':
      if (family(buff.buffId) === 'trade_ord_wt&cost') { push('selfMorale', num(text.match(TAILORING_MORALE))); interaction = { goldOrderTier: /slightly/i.test(text) ? 'lower' : 'higher' }; break; }
      push('orderEfficiency', rate(text, ORDER_ACQUISITION, 'order acquisition')); push('orderLimit', num(text.match(ORDER_LIMIT))); out.push(...morale(text)); break;
    case 'MEETING': push('clueSpeed', rate(text, CLUE_SPEED, 'clue search speed')); out.push(...morale(text)); break;
    case 'HIRE': push('hrSpeed', rate(text, HR_SPEED, 'hr contacting speed')); out.push(...morale(text)); break;
    case 'POWER': push('droneRate', rate(text, DRONE, '(?:drone recovery rate|drone charging speed)')); out.push(...morale(text)); break;
    case 'CONTROL': push('ccOrderEfficiency', pct(text.match(CC_ORDER_EFFICIENCY))); push('ccFactoryProductivity', pct(text.match(CC_FACTORY))); push('ccClueSpeed', pct(text.match(CC_CLUE))); push('ccMorale', num(text.match(CC_MORALE))); out.push(...morale(text)); break;
    case 'DORMITORY': out.push(...dormitory(text)); break;
    case 'TRAINING': {
      const targets = targetsOf(buff);
      // "training speed +30%" first; "further increases this speed by +45% if training ... Level 1" as a threshold on the
      // mastery level or the trainee's branch; "+10% for each Defending Operator in the Base (caps at 4)" counted by roster.
      const speeds = [...text.matchAll(/(?:speed|increased)[^%\d+-]{0,50}?([+-]?\d+(?:\.\d+)?)%/gi)].map((m) => Number(m[1]) / 100);
      const mastery = text.match(MASTERY), branch = text.match(/Job Branch is ([A-Za-z ]+?),/i) ?? text.match(/branch[^A-Za-z]{0,10}([A-Za-z ]+?)[,.]/i);
      const roster = text.match(TRAINING_ROSTER), cap = text.match(TRAINING_CAP);
      if (roster) {
        const name = TRAINING_ROSTERS[roster[1]];
        if (name && speeds.length === 1) out.push({ kind: 'trainingSpeed', value: 0, targets, per: { count: `base.roster:${name}`, amount: speeds[0], ...(cap ? { maxCount: Number(cap[1]) } : {}) } });
      } else {
        const conditional = speeds.length > 1 || /^[^%]*if training/i.test(text);
        speeds.forEach((value, i) => {
          const gated = conditional && (i > 0 || speeds.length === 1);
          push('trainingSpeed', value, { targets, ...(gated && mastery ? { when: { type: 'masteryLevel', value: Number(mastery[1]) } } : gated && branch ? { when: { type: 'traineeBranch', name: branch[1].trim() } } : {}) });
        });
      }
      // The trainer's own Morale: for the named classes, and only at the named mastery when the skill is that alone.
      push('trainingMorale', num(text.match(/Morale consumed per hour[^\d+-]{0,30}?([+-]\d+)/i)), { targets, ...(!speeds.length && mastery ? { when: { type: 'masteryLevel', value: Number(mastery[1]) } } : {}) });
      break;
    }
    case 'WORKSHOP': {
      // The recipe kinds are the game's targets; a word in the recipe's name ("Oriron-type", "Polyester Pack") and its
      // base Morale cost gate the whole skill, a cost condition the Morale change alone.
      const targets = targetsOf(buff);
      const fam = text.match(RECIPE_FAMILY);
      const familyName = fam ? (fam[1].toLowerCase() === 'ester' ? 'polyester' : fam[1].toLowerCase()) : null;
      const baseCost = text.match(RECIPE_BASE_COST);
      const gates: SkillCondition[] = [...(familyName ? [{ type: 'recipeFamily', name: familyName } as const] : []), ...(baseCost ? [{ type: 'recipeCostIs', value: Number(baseCost[1]) } as const] : [])];
      const gated = (more: SkillCondition[] = []): Partial<SkillEffect> => { const all = [...gates, ...more]; return all.length === 0 ? {} : all.length === 1 ? { when: all[0] } : { when: { type: 'all', of: all } }; };
      const perDorm = text.match(RECIPE_PER_DORM);
      const chance = pct(text.match(BYPRODUCT));
      if (chance !== null && perDorm) out.push({ kind: 'byproductChance', value: 0, targets, per: { count: `dorm.moraleAtMost:${Number(perDorm[1])}`, amount: chance }, ...gated() });
      else push('byproductChance', chance, { targets, ...gated() });
      const fixed = text.match(RECIPE_FIXED);
      if (fixed) out.push({ kind: 'recipeMoraleFixed', value: Number(fixed[1]), targets, ...gated() });
      const m = text.match(RECIPE_MORALE);
      if (m) {
        const cost = text.match(RECIPE_COST);
        out.push({ kind: 'recipeMorale', value: Number(m[1] ?? m[2] ?? m[3]), targets, ...gated(cost ? [cost[2] ? { type: 'recipeCostAtLeast', value: Number(cost[1]) } : { type: 'recipeCostIs', value: Number(cost[1]) }] : []) });
      }
      const t3 = text.match(/any byproducts of T3 quality.+/i);
      if (t3) note = t3[0];
      break;
    }
    case 'RECYCLE': push('recycleEfficiency', pct(text.match(RECYCLE))); break;
  }
  return { effects: out.map((x) => (x.product === undefined ? (({ product: _p, ...rest }) => rest)(x) : x)), ...(interaction ? { interaction } : {}), ...(note ? { note } : {}) };
}
export const targetsOf = (buff: Buff) => (Array.isArray(buff.targets) ? buff.targets : Object.keys(buff.targets ?? {})) as string[];

/** Text the rules cannot read: a count, a condition or a relation to another skill. An entry with such text needs an override. */
export const NEEDS_OVERRIDE = /for (?:every|each)|if (?!in Clue)|together with|same (?:factory|trading post|dormitory|reception)|other operators|another operator|additional|up to a maximum|becomes 0|per hour, up to|further|only this|no other|whose morale/i;
export const NEEDS_OVERRIDE_DORMITORY = /for (?:every|each)|if |together with|below \d|level|recruit|power plant|soundless|distributed|cannot gain/i;
/** Training Room: the rules read mastery, branch and roster counts; a counter or a resource needs an override. */
export const NEEDS_OVERRIDE_TRAINING = /Martial Arts|Worldly Plight|for every|next training time|if the trainee's Job Branch is [A-Za-z ]+ or/i;
/** Workshop: the rules read kinds, families, costs and a per-resident count; the rest needs an override. */
export const NEEDS_OVERRIDE_WORKSHOP = /for every 10|if Stainless|Intelligence Reserve|divided by|Causality|Karma|restored|LMD cost| or [A-Z][a-z]+ [A-Z]/;
/** Families whose effect the game states in words only (which clue is likelier, a one-off swap): nothing to compute. */
export const NON_NUMERIC_FAMILIES = new Set(['meet_flag', 'meet_team', 'meet_team&char', 'meet_spd_Owned', 'meet_spd_notOwned', 'meet_spd_notOwned&exchange', 'control_clue_faction', 'control_facCostReset', 'dorm_exchangeAp', 'trade_ord_law', 'manu_cost_all', 'manu_skill_change', 'train_spd_reduceTime', 'workshop_formula_drop', 'meet_spd&condChar_mustget', 'trade_ord_pepe', 'control_mp_cost_reset']);

export const POOL_KINDS = new Set<SkillEffect['kind']>(['recipeMoraleFixed', 'recipeMoraleFactor', 'recipeLmdFree', 'selfMorale', 'roomMorale', 'targetMorale', 'recoverySelf', 'recoveryAll', 'recoveryOthers', 'recoverySingle', 'recoveryExclusive', 'recoveryDistributed', 'orderLimit', 'droneRate', 'resource', 'ccMorale', 'ccDormRecovery', 'ccDormEliteRecovery', 'ccOtherRoomsRecovery', 'powerPlantCount', 'capacity', 'trainingMorale', 'recipeMorale']);
export function shapeOf(effects: SkillEffect[], custom: SkillOverride['custom']): SkillShape {
  if (custom) return 'custom';
  if (effects.some((x) => x.per)) return 'counted';
  if (effects.some((x) => x.when)) return 'threshold';
  if (effects.length && effects.every((x) => POOL_KINDS.has(x.kind))) return 'pool';
  return 'flat';
}


/** A name as it is compared: lower case, diacritics and curly quotes off, spaces squeezed. */
export const foldName = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();

/** The names a description mentions, as written: a group or faction before "Operator(s)", an operator named in
 *  a condition ("if Stainless is assigned", "with Vigil in"), a possessive ("Amiya's Morale"). The build checks
 *  each against the records, so a misspelt operator or faction cannot match nothing in silence. */
export function mentionedNames(text: string): string[] {
  const NAME = "[A-Z][\\w'.-]*(?:\\s+(?:of|the|&|de|la)\\s+[A-Z][\\w'.-]*|\\s+[A-Z][\\w'.-]*)*";
  const out = new Set<string>();
  const add = (phrase: string) => { for (const part of phrase.split(/\s+and\s+/)) { const name = part.replace(/'s?$/, '').trim(); if (name && !/^(?:When|If|While|Only|For|This|Otherwise|Additionally|Furthermore|Has|Max|Rate|Default|Strongest)$/.test(name)) out.add(name); } };
  for (const m of text.matchAll(new RegExp(`\\b(${NAME})\\s+Operators?\\b`, 'g'))) add(m[1]);
  for (const m of text.matchAll(new RegExp(`\\b(?:if|when|with|beside|while|and|than)\\s+(${NAME})\\s+(?:is|are|also|in|assigned|works|at|has)\\b`, 'g'))) add(m[1]);
  for (const m of text.matchAll(new RegExp(`\\b(${NAME})'s?(?=\\s|$)`, 'g'))) add(m[1]);
  return [...out];
}

/** The game's own nouns a description capitalizes that name no operator or group. */
const GAME_NOUNS = new Set(['morale', 'factory', 'factories', 'trading post', 'trading posts', 'dormitory', 'dormitories', 'dorms', 'control center', 'reception room', 'reception', 'hr office', 'hr', 'power plant', 'power plants', 'training room', 'workshop', 'base', 'assistants and activity room', 'assistants and activity rooms', 'assistant', 'elite', 'operation platform', 'operation platforms', 'alternate', 'standardization', 'standardization skill', 'engineering robot', 'clue', 'clues', 'clue board', 'clue exchange', 'recruit', 'recruitment', 'precious metal', 'precious metals', 'battle record', 'battle records', 'pure gold', 'pure gold production line', 'originium', 'skill summaries', 'chips', 'building', 'specialization', 'specialization level', 'job branch', 'skill specialization', 'worldly plight', 'passion', 'perception information', 'soundless resonance', 'felvine', 'intelligence reserve', 'monster meal', 'ursus specialty beverage', 'witchcraft crystal', 'chain of thought', 'memory fragments', 'measure', 'dreamland', 'martial arts', 'causality', 'karma', 'lmd', 't3', 'work area', 'special comparison rules', 'special bonuses', 'special interaction rules', 'influence', 'territory', 'drone', 'storage capacity', 'defaulted', 'special order', 'recycling station', 'rhine tech-type', 'metalwork-type', 'crystal-type', 'oriron cluster', 'amiya', 'guard', 'vanguard', 'defender', 'sniper', 'caster', 'medic', 'supporter', 'specialist', 'productivity', 'knight', 'defending', 'attacking', 'sui', 'sami', 'siracusa', 'elite operator', 'operator', 'operators', 'kjerag', 'minos', 'sargon', 'laterano', 'blacksteel worldwide', 'rhine lab', 'pinus sylvestris', 'abyssal hunter', 'team rainbow', 'glasgow gang', 'ursus student self-government group', 'ursus student self-governing group', 'soubo adventurers', 'l.g.d.', 'a1 detachment', 'karlan', 'durin', 'wandering medic', 'bubble kingdom hunters', 'bubble kingdom hunting squad', 'laios\'s party', 'tailoring', 'tailoring-type', 'professional ethics', 'rhine lab and pinus sylvestris']);

/** Whether a mentioned name is a record (operator, alias, faction, class, branch), a group, or a game noun. */
export function nameIsKnown(name: string, known: ReadonlySet<string>): boolean {
  const f = foldName(name).replace(/\s+operators?$/, '');
  return known.has(f) || GAME_NOUNS.has(f);
}
