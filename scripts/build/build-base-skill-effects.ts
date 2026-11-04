/**
 * Writes lib/base/base-skill-effects.json, the base skill parameter table (lib/base/baseSkillEffects.ts):
 * every buff id in the game's building_data.json, EN first and CN for the ones EN lacks, with its room,
 * category, targets, headline efficiency, unlock, and its numbers in a shape the calculator evaluates.
 *
 *   npm run base:skill-effects              # from the upstream caches
 *   npm run base:skill-effects -- --fetch   # fetch the two tables from their mirrors into .cache/gamedata first
 *
 * Sources, in order: ARKPEDIA_GAMEDATA (a directory holding building_data.json) and the stage pipeline's
 * EN cache (.cache/upstream/en-gamedata); ARKPEDIA_CN and the CN tables checkout (.cache/upstream/cn-tables);
 * else .cache/gamedata/{en,cn}, which --fetch fills. The record text in data/ (pulled from arkpedia-data)
 * supplies the English of a CN-only skill.
 *
 * The numbers come two ways. Rules, per room, read the plain skills exactly as the calculator's text parsers
 * did ("productivity +25%", "order limit +2", "Morale consumed per hour -0.25"). Overrides
 * (base-skill-overrides.ts) carry what words state: counts, conditions, interactions, and the handlers that
 * stay custom. The guard refuses the table when a buff id is unclassified, a rule found no number in a text
 * that has one, an override names a key no record has, two overrides disagree on a shared buff id, or a
 * handler key is neither overridden nor declared generic.
 */
import fs from 'node:fs';
import path from 'node:path';
import { OVERRIDES, GENERIC_IS_RIGHT, type SkillOverride, type OverrideEffect } from './base-skill-overrides';
import { cleanSkillName } from '../../lib/base/activeBaseSkills';
import type { BaseSkillEffectEntry, BaseSkillEffectsTable, SkillEffect, SkillRoomType, SkillShape } from '../../lib/base/baseSkillEffects';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'lib/base/base-skill-effects.json');
const EN_URL = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/en/gamedata/excel/building_data.json';
const CN_URL = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/building_data.json';

interface Buff { buffId: string; roomType: SkillRoomType; buffCategory: BaseSkillEffectEntry['buffCategory']; description: string; efficiency: number | null; targets: Record<string, unknown> | string[] | null }
interface BuildingData { buffs: Record<string, Buff>; chars: Record<string, { buffChar: { buffData: { buffId: string; cond: { phase: string | number; level: number } }[] }[] }> }
interface OperatorRecord { name: string; aliases?: string[]; baseSkills?: { name: string | null; buffId?: string; description: string | null }[] | null }

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

async function source(which: 'en' | 'cn'): Promise<{ file: string; data: BuildingData }> {
  const candidates = which === 'en'
    ? [process.env.ARKPEDIA_GAMEDATA && path.join(process.env.ARKPEDIA_GAMEDATA, 'building_data.json'), path.join(ROOT, '.cache/upstream/en-gamedata/en/gamedata/excel/building_data.json')]
    : [process.env.ARKPEDIA_CN && path.join(process.env.ARKPEDIA_CN, 'gamedata/excel/building_data.json'), path.join(ROOT, '.cache/upstream/cn-tables/zh_CN/gamedata/excel/building_data.json')];
  const fallback = path.join(ROOT, `.cache/gamedata/${which}/building_data.json`);
  const given = flag(`--${which}`);
  if (args.includes('--fetch') && !given) {
    const url = which === 'en' ? EN_URL : CN_URL;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    fs.mkdirSync(path.dirname(fallback), { recursive: true });
    fs.writeFileSync(fallback, await response.text());
  }
  const file = [given, ...candidates, fallback].find((f): f is string => !!f && fs.existsSync(f));
  if (!file) throw new Error(`no ${which} building_data.json: pass --${which} <file>, or --fetch`);
  return { file, data: JSON.parse(fs.readFileSync(file, 'utf8')) as BuildingData };
}

const strip = (text: string | null | undefined) => (text ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const family = (buffId: string) => buffId.replace(/\[\d+\]$/, '');
const pct = (m: RegExpMatchArray | null) => (m ? Number(m[1]) / 100 : null);
const num = (m: RegExpMatchArray | null) => (m ? Number(m[1]) : null);
const chinese = (text: string) => /[一-鿿]/.test(text);

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
const TRAINING_SPEED = /training speed[^%]{0,20}?([+-]?\d+(?:\.\d+)?)%/i;
const BYPRODUCT = /byproduct[^%]{0,60}?(\d+(?:\.\d+)?)%/i;
const RECIPE_MORALE = /(-\d+) Morale cost|Morale cost[^\d-]{0,20}?(-\d+)|by ([+-]\d+)|only consume (\d+) Morale/i;
const RECYCLE = /material conversion efficiency[^%]{0,20}?([+-]?\d+(?:\.\d+)?)%/i;
const TAILORING_MORALE = /morale consumed per hour[^\d+-]{0,30}?([+-]?\d+(?:\.\d+)?)/i;
const MASTERY = /(?:if|when) training (?:the|a) skill to Specialization Level (\d)/i;

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
  // Only the first plain number of each kind: a CN-only skill has no record yet, so nothing computes it.
  const out: SkillEffect[] = [];
  for (const [re, kind] of CN_KINDS) {
    const m = text.match(new RegExp(`${re.source}[^+\\-\\d]{0,8}([+-]?\\d+(?:\\.\\d+)?)(%?)`));
    if (m) out.push({ kind, value: m[2] ? Number(m[1]) / 100 : Number(m[1]) });
  }
  return out;
}
function rules(buff: Buff, text: string): { effects: SkillEffect[]; interaction?: BaseSkillEffectEntry['interaction'] } {
  if (chinese(text)) return { effects: chineseRule(text) };
  const out: SkillEffect[] = [];
  let interaction: BaseSkillEffectEntry['interaction'];
  const push = (kind: SkillEffect['kind'], value: number | null, more: Partial<SkillEffect> = {}) => { if (value !== null) out.push({ kind, value, ...more }); };
  switch (buff.roomType) {
    case 'MANUFACTURE': push('productivity', pct(text.match(PRODUCTIVITY)), { product: product(text) }); push('capacity', num(text.match(CAPACITY))); out.push(...morale(text)); break;
    case 'TRADING':
      if (family(buff.buffId) === 'trade_ord_wt&cost') { push('selfMorale', num(text.match(TAILORING_MORALE))); interaction = { goldOrderTier: /slightly/i.test(text) ? 'lower' : 'higher' }; break; }
      push('orderEfficiency', pct(text.match(ORDER_ACQUISITION))); push('orderLimit', num(text.match(ORDER_LIMIT))); out.push(...morale(text)); break;
    case 'MEETING': push('clueSpeed', pct(text.match(CLUE_SPEED))); out.push(...morale(text)); break;
    case 'HIRE': push('hrSpeed', pct(text.match(HR_SPEED))); out.push(...morale(text)); break;
    case 'POWER': push('droneRate', pct(text.match(DRONE))); out.push(...morale(text)); break;
    case 'CONTROL': push('ccOrderEfficiency', pct(text.match(CC_ORDER_EFFICIENCY))); push('ccFactoryProductivity', pct(text.match(CC_FACTORY))); push('ccClueSpeed', pct(text.match(CC_CLUE))); push('ccMorale', num(text.match(CC_MORALE))); out.push(...morale(text)); break;
    case 'DORMITORY': out.push(...dormitory(text)); break;
    case 'TRAINING': {
      // "training speed +30%" first; "further increases this speed by +45% if training ... Level 1" as a threshold on the mastery level.
      const speeds = [...text.matchAll(/(?:speed|increased)[^%\d+-]{0,50}?([+-]?\d+(?:\.\d+)?)%/gi)].map((m) => Number(m[1]) / 100);
      const mastery = text.match(MASTERY), branch = text.match(/Job Branch is ([A-Za-z ]+?),/i) ?? text.match(/branch[^A-Za-z]{0,10}([A-Za-z ]+?)[,.]/i);
      const conditional = speeds.length > 1 || /^[^%]*if training/i.test(text);
      speeds.forEach((value, i) => {
        const gated = conditional && (i > 0 || speeds.length === 1);
        push('trainingSpeed', value, { targets: targetsOf(buff), ...(gated && mastery ? { when: { type: 'masteryLevel', value: Number(mastery[1]) } } : gated && branch ? { when: { type: 'traineeBranch', name: branch[1].trim() } } : {}) });
      });
      push('trainingMorale', num(text.match(/Morale consumed per hour[^\d+-]{0,30}?([+-]\d+)/i)));
      break;
    }
    case 'WORKSHOP': push('byproductChance', pct(text.match(BYPRODUCT)), { targets: targetsOf(buff) }); { const m = text.match(RECIPE_MORALE); if (m) out.push({ kind: 'recipeMorale', value: Number(m[1] ?? m[2] ?? m[3] ?? m[4]) }); } break;
    case 'RECYCLE': push('recycleEfficiency', pct(text.match(RECYCLE))); break;
  }
  return { effects: out.map((x) => (x.product === undefined ? (({ product: _p, ...rest }) => rest)(x) : x)), ...(interaction ? { interaction } : {}) };
}
const targetsOf = (buff: Buff) => (Array.isArray(buff.targets) ? buff.targets : Object.keys(buff.targets ?? {})) as string[];

/** Text the rules cannot read: a count, a condition or a relation to another skill. An entry with such text needs an override. */
const NEEDS_OVERRIDE = /for (?:every|each)|if (?!in Clue)|together with|same (?:factory|trading post|dormitory|reception)|other operators|another operator|additional|up to a maximum|becomes 0|per hour, up to|further|only this|no other|whose morale/i;
const NEEDS_OVERRIDE_DORMITORY = /for (?:every|each)|if |together with|below \d|level|recruit|power plant|soundless|distributed|cannot gain/i;
/** Families whose effect the game states in words only (which clue is likelier, a one-off swap): nothing to compute. */
const NON_NUMERIC_FAMILIES = new Set(['meet_flag', 'meet_team', 'meet_team&char', 'meet_spd_Owned', 'meet_spd_notOwned', 'meet_spd_notOwned&exchange', 'control_clue_faction', 'control_facCostReset', 'dorm_exchangeAp', 'trade_ord_law', 'manu_cost_all', 'manu_skill_change', 'train_spd_reduceTime', 'train_spd_bd&reduceTime', 'workshop_formula_drop', 'workshop_formula_free', 'workshop_formula_recovery', 'workshop_formula_bonus1', 'workshop_formula_bonus2', 'workshop_formula_lolxh', 'meet_spd&condChar_mustget', 'trade_ord_pepe', 'control_mp_cost_reset']);

const POOL_KINDS = new Set<SkillEffect['kind']>(['selfMorale', 'roomMorale', 'targetMorale', 'recoverySelf', 'recoveryAll', 'recoveryOthers', 'recoverySingle', 'recoveryExclusive', 'recoveryDistributed', 'orderLimit', 'droneRate', 'resource', 'ccMorale', 'ccDormRecovery', 'ccDormEliteRecovery', 'ccOtherRoomsRecovery', 'powerPlantCount', 'capacity', 'trainingMorale', 'recipeMorale']);
function shapeOf(effects: SkillEffect[], custom: SkillOverride['custom']): SkillShape {
  if (custom) return 'custom';
  if (effects.some((x) => x.per)) return 'counted';
  if (effects.some((x) => x.when)) return 'threshold';
  if (effects.length && effects.every((x) => POOL_KINDS.has(x.kind))) return 'pool';
  return 'flat';
}

async function main() {
  const en = await source('en'), cn = await source('cn');
  const records = fs.readdirSync(path.join(ROOT, 'data')).filter((d) => /^operators-\d+star$/.test(d)).flatMap((d) =>
    fs.readdirSync(path.join(ROOT, 'data', d)).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', d, f), 'utf8')) as OperatorRecord));
  const keyBuffs = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib/base/special-skill-buffs.json'), 'utf8')) as Record<string, string[]>;
  const recordText = new Map<string, string>();
  const recordKeys = new Map<string, Set<string>>();
  for (const op of records) for (const sk of op.baseSkills ?? []) {
    if (!sk.buffId) continue;
    if (sk.description && !recordText.has(sk.buffId)) recordText.set(sk.buffId, sk.description);
    for (const name of [op.name, ...(op.aliases ?? [])]) (recordKeys.get(sk.buffId) ?? recordKeys.set(sk.buffId, new Set()).get(sk.buffId)!).add(`${name}|${cleanSkillName(sk.name)}`);
  }

  const errors: string[] = [];
  // Overrides by buff id: a handler key through special-skill-buffs.json (or the records), a buff id as itself.
  const overrideBy = new Map<string, { key: string; override: SkillOverride }[]>();
  const overrideKeys = new Set<string>();
  const buffIdsOfKey = (key: string): string[] => keyBuffs[key] ?? [...new Set([...recordKeys].filter(([, keys]) => keys.has(key)).map(([id]) => id))];
  for (const [key, override] of Object.entries(OVERRIDES)) {
    overrideKeys.add(key);
    const ids = /\[\d+\]$/.test(key) ? [key] : buffIdsOfKey(key);
    if (!ids.length) { errors.push(`override "${key}" names no record skill and no buff id`); continue; }
    for (const id of ids) (overrideBy.get(id) ?? overrideBy.set(id, []).get(id)!).push({ key, override });
  }
  for (const key of GENERIC_IS_RIGHT) { overrideKeys.add(key); if (!buffIdsOfKey(key).length) errors.push(`GENERIC_IS_RIGHT "${key}" names no record skill`); }
  for (const key of Object.keys(keyBuffs)) if (!overrideKeys.has(key) && !keyBuffs[key].every((id) => overrideBy.has(id))) errors.push(`handler key "${key}" is neither overridden nor declared generic`);
  const genericRight = new Set(GENERIC_IS_RIGHT.flatMap((key) => buffIdsOfKey(key)));
  const resolveKey = (key: string, from: string) => { const ids = buffIdsOfKey(key); if (ids.length !== 1) errors.push(`${from}: suppressedBy "${key}" resolves to ${ids.length} buff ids`); return ids[0] ?? key; };

  // Unlocks, from every character in both tables.
  const unlocks = new Map<string, Map<string, { phase: number; level: number }>>();
  for (const data of [en.data, cn.data]) for (const char of Object.values(data.chars)) for (const slot of char.buffChar ?? []) for (const step of (Array.isArray(slot.buffData) ? slot.buffData : Object.values(slot.buffData ?? {}))) {
    const phase = typeof step.cond.phase === 'number' ? step.cond.phase : Number(String(step.cond.phase).replace('PHASE_', ''));
    const m = unlocks.get(step.buffId) ?? unlocks.set(step.buffId, new Map()).get(step.buffId)!;
    m.set(`${phase}:${step.cond.level}`, { phase, level: step.cond.level });
  }

  const entries: Record<string, BaseSkillEffectEntry> = {};
  const ids = [...new Set([...Object.keys(en.data.buffs), ...Object.keys(cn.data.buffs)])].sort();
  for (const id of ids) {
    const buff = en.data.buffs[id] ?? cn.data.buffs[id];
    const fromEn = id in en.data.buffs;
    const text = fromEn ? strip(buff.description) : recordText.get(id) ?? strip(buff.description);
    const fam = family(id);
    const found = overrideBy.get(id) ?? [];
    let effects: SkillEffect[], custom: SkillOverride['custom'], interaction: SkillOverride['interaction'], note: string | undefined, nonNumeric = false;
    if (found.length) {
      const first = JSON.stringify(found[0].override);
      for (const other of found.slice(1)) if (JSON.stringify(other.override) !== first) errors.push(`${id}: overrides "${found[0].key}" and "${other.key}" disagree`);
      const o = found[0].override;
      effects = (o.effects ?? []).map((x: OverrideEffect) => x.suppressedBy ? { ...x, suppressedBy: { buffId: resolveKey(x.suppressedBy.key, found[0].key), ...(x.suppressedBy.when ? { when: x.suppressedBy.when } : {}) } } : (x as SkillEffect));
      custom = o.custom; interaction = o.interaction; note = o.note; nonNumeric = !!o.nonNumeric;
    } else {
      const read = rules(buff, text);
      effects = read.effects; interaction = read.interaction;
      nonNumeric = effects.length === 0 && (NON_NUMERIC_FAMILIES.has(fam) || !/[+-]?\d+(?:\.\d+)?%|[+-]\d/.test(text));
      const inRecords = recordText.has(id);
      if (!nonNumeric && !chinese(text)) {
        if (!effects.length && /[+-]?\d+(?:\.\d+)?%|[+-]\d/.test(text)) errors.push(`${id} (${fam}${inRecords ? ', in records' : ''}): the text has a number the rules did not read: ${text}`);
        const wording = buff.roomType === 'DORMITORY' ? NEEDS_OVERRIDE_DORMITORY : NEEDS_OVERRIDE;
        if (inRecords && !genericRight.has(id) && wording.test(text) && buff.roomType !== 'TRAINING' && buff.roomType !== 'WORKSHOP') errors.push(`${id} (${fam}, ${[...recordKeys.get(id) ?? []].join(' / ')}): words the rules cannot read, needs an override: ${text}`);
      }
    }
    const steps = [...(unlocks.get(id)?.values() ?? [])].sort((a, b) => a.phase - b.phase || a.level - b.level);
    entries[id] = {
      buffId: id, family: fam, roomType: buff.roomType, buffCategory: buff.buffCategory, targets: targetsOf(buff),
      efficiency: buff.efficiency === 0 || buff.efficiency === null || buff.efficiency === undefined ? null : buff.efficiency,
      shape: shapeOf(effects, custom), effects,
      ...(custom ? { custom } : {}), ...(interaction ? { interaction } : {}),
      unlock: steps[0] ?? null, ...(steps.length > 1 ? { unlocks: steps } : {}),
      source: fromEn ? 'en' : 'cn', description: text,
      ...(nonNumeric ? { nonNumeric: true } : {}), ...(note ? { note } : {}),
    };
  }
  // Every record skill has an entry.
  for (const [id, keys] of recordKeys) if (!entries[id]) errors.push(`record skill ${[...keys][0]} (${id}) is in neither table`);
  // A product gate read from the text agrees with the game's own targets.
  for (const entry of Object.values(entries)) if (entry.roomType === 'MANUFACTURE' && entry.source === 'en') for (const x of entry.effects) {
    if (x.kind !== 'productivity' || entry.targets.length === 0) continue;
    const want = entry.targets.length === 1 && entry.targets[0] === 'F_EXP' ? 'Battle Records' : entry.targets.length === 1 && entry.targets[0] === 'F_GOLD' ? 'Precious Metals' : entry.targets.length === 1 && entry.targets[0] === 'F_DIAMOND' ? 'Originium Shards' : undefined;
    if (want !== x.product && !(entry.custom)) errors.push(`${entry.buffId}: productivity gated on ${x.product ?? 'every product'} but targets say ${entry.targets.join(',')}`);
  }
  if (errors.length) { console.error(`base-skill-effects: ${errors.length} problem(s)\n  ${errors.join('\n  ')}`); process.exit(1); }

  const table: BaseSkillEffectsTable = { generatedFrom: { en: path.relative(ROOT, en.file), cn: path.relative(ROOT, cn.file), records: records.length }, entries };
  fs.writeFileSync(OUT, JSON.stringify(table, null, 1) + '\n');
  const count = (f: (x: BaseSkillEffectEntry) => boolean) => Object.values(entries).filter(f).length;
  const shapes = ['flat', 'counted', 'threshold', 'pool', 'custom'] as const;
  console.log(`${Object.keys(entries).length} buff ids (${count((x) => x.source === 'en')} EN, ${count((x) => x.source === 'cn')} CN only), ${new Set(Object.values(entries).map((x) => x.family)).size} families; ${shapes.map((s) => `${s} ${count((x) => x.shape === s)}`).join(', ')}; non-numeric ${count((x) => !!x.nonNumeric)}`);
  console.log(`custom handlers: ${[...new Set(Object.values(entries).flatMap((x) => (x.custom ? [x.custom.handler] : [])))].sort().join(', ')}`);
}
main().catch((error) => { console.error(error); process.exit(1); });
