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
 * once did ("productivity +25%", "order limit +2", "Morale consumed per hour -0.25"). Overrides
 * (base-skill-overrides.ts) carry what words state: counts, conditions, interactions, and the handlers that
 * stay custom. The guard refuses the table when a buff id is unclassified, a rule found no number in a text
 * that has one, a text uses words the rules cannot read without an override, an override names a key no
 * record has, or two overrides disagree on a shared buff id.
 */
import fs from 'node:fs';
import path from 'node:path';
import { OVERRIDES, GENERIC_IS_RIGHT, type SkillOverride, type OverrideEffect } from './base-skill-overrides';
import { cleanSkillName } from '../../lib/base/activeBaseSkills';
import type { BaseSkillEffectEntry, BaseSkillEffectsTable, SkillEffect } from '../../lib/base/baseSkillEffects';
import { dependencyClassOf } from '../../lib/base/dependencyClass';
import { type Buff, normalizeDescription, mentionedNames, nameIsKnown, foldName, strip, rules, chinese, family, targetsOf, NEEDS_OVERRIDE, NEEDS_OVERRIDE_DORMITORY, NEEDS_OVERRIDE_TRAINING, NEEDS_OVERRIDE_WORKSHOP, NON_NUMERIC_FAMILIES, shapeOf } from './base-skill-rules';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'lib/base/base-skill-effects.json');
const EN_URL = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/en/gamedata/excel/building_data.json';
const CN_URL = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/building_data.json';

interface BuffStep { buffId: string; cond: { phase: string | number; level: number } }
interface BuildingData { buffs: Record<string, Buff>; chars: Record<string, { buffChar: { buffData: BuffStep[] | Record<string, BuffStep> }[] }> }
interface OperatorRecord { name: string; aliases?: string[]; faction?: string | null; class?: string | null; branch?: string | null; baseSkills?: { name: string | null; buffId?: string; description: string | null }[] | null }

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

async function main() {
  const en = await source('en'), cn = await source('cn');
  const records = fs.readdirSync(path.join(ROOT, 'data')).filter((d) => /^operators-\d+star$/.test(d)).flatMap((d) =>
    fs.readdirSync(path.join(ROOT, 'data', d)).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', d, f), 'utf8')) as OperatorRecord));
  const recordText = new Map<string, string>();
  const recordKeys = new Map<string, Set<string>>();
  for (const op of records) for (const sk of op.baseSkills ?? []) {
    if (!sk.buffId) continue;
    if (sk.description && !recordText.has(sk.buffId)) recordText.set(sk.buffId, sk.description);
    for (const name of [op.name, ...(op.aliases ?? [])]) (recordKeys.get(sk.buffId) ?? recordKeys.set(sk.buffId, new Set()).get(sk.buffId)!).add(`${name}|${cleanSkillName(sk.name)}`);
  }

  const errors: string[] = [];
  // Every name a description can mention: operators and their former names, factions, classes and branches.
  const knownNames = new Set<string>();
  for (const op of records) for (const n of [op.name, ...(op.aliases ?? []), op.faction, op.class, op.branch]) if (n) knownNames.add(foldName(n));
  const normalizationChanged: string[] = [];
  // Overrides by buff id: an "Operator|Skill" key through the records (under the operator's name or a former one), a buff id as itself.
  const overrideBy = new Map<string, { key: string; override: SkillOverride }[]>();
  const buffIdsOfKey = (key: string): string[] => [...new Set([...recordKeys].filter(([, keys]) => keys.has(key)).map(([id]) => id))];
  for (const [key, override] of Object.entries(OVERRIDES)) {
    const ids = /\[\d+\]$/.test(key) ? [key] : buffIdsOfKey(key);
    if (!ids.length) { errors.push(`override "${key}" names no record skill and no buff id`); continue; }
    for (const id of ids) (overrideBy.get(id) ?? overrideBy.set(id, []).get(id)!).push({ key, override });
  }
  for (const key of GENERIC_IS_RIGHT) if (!buffIdsOfKey(key).length) errors.push(`GENERIC_IS_RIGHT "${key}" names no record skill`);
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
    const raw = fromEn ? buff.description : recordText.get(id) ?? buff.description;
    const text = normalizeDescription(raw);
    if (!chinese(text) && JSON.stringify(rules(buff, strip(raw))) !== JSON.stringify(rules(buff, text))) normalizationChanged.push(`${id}: ${strip(raw)}`);
    if (!chinese(text)) for (const name of mentionedNames(text)) if (!nameIsKnown(name, knownNames)) errors.push(`${id} (${family(id)}): names "${name}", which is no operator, former name, faction, class, branch or group the records know: ${text}`);
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
      effects = read.effects; interaction = read.interaction; note = read.note;
      nonNumeric = effects.length === 0 && (NON_NUMERIC_FAMILIES.has(fam) || !/[+-]?\d+(?:\.\d+)?%|[+-]\d/.test(text));
      const inRecords = recordText.has(id);
      if ((!nonNumeric || buff.roomType === 'TRAINING' || buff.roomType === 'WORKSHOP') && !chinese(text)) {
        if (!effects.length && /[+-]?\d+(?:\.\d+)?%|[+-]\d/.test(text)) errors.push(`${id} (${fam}${inRecords ? ', in records' : ''}): the text has a number the rules did not read: ${text}`);
        const wording = buff.roomType === 'DORMITORY' ? NEEDS_OVERRIDE_DORMITORY : buff.roomType === 'TRAINING' ? NEEDS_OVERRIDE_TRAINING : buff.roomType === 'WORKSHOP' ? NEEDS_OVERRIDE_WORKSHOP : NEEDS_OVERRIDE;
        if (inRecords && !genericRight.has(id) && wording.test(text)) errors.push(`${id} (${fam}, ${[...recordKeys.get(id) ?? []].join(' / ')}): words the rules cannot read, needs an override: ${text}`);
      }
    }
    const steps = [...(unlocks.get(id)?.values() ?? [])].sort((a, b) => a.phase - b.phase || a.level - b.level);
    entries[id] = {
      buffId: id, family: fam, roomType: buff.roomType, buffCategory: buff.buffCategory, targets: targetsOf(buff),
      efficiency: buff.efficiency === 0 || buff.efficiency === null || buff.efficiency === undefined ? null : buff.efficiency,
      shape: shapeOf(effects, custom), effects, dependency: dependencyClassOf({ effects, custom }),
      ...(custom ? { custom } : {}), ...(interaction ? { interaction } : {}),
      unlock: steps[0] ?? null, ...(steps.length > 1 ? { unlocks: steps } : {}),
      source: fromEn ? 'en' : 'cn',
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
  // Minified: the calculator imports it, so the /base page and the optimizer Worker ship it. The description text is
  // not in it; the operator records carry that, and the review table (scripts/audits/base-skill-table.ts) joins them.
  fs.writeFileSync(OUT, JSON.stringify(table) + '\n');
  const count = (f: (x: BaseSkillEffectEntry) => boolean) => Object.values(entries).filter(f).length;
  const shapes = ['flat', 'counted', 'threshold', 'pool', 'custom'] as const;
  console.log(`${Object.keys(entries).length} buff ids (${count((x) => x.source === 'en')} EN, ${count((x) => x.source === 'cn')} CN only), ${new Set(Object.values(entries).map((x) => x.family)).size} families; ${shapes.map((s) => `${s} ${count((x) => x.shape === s)}`).join(', ')}; non-numeric ${count((x) => !!x.nonNumeric)}`);
  console.log(`custom handlers: ${[...new Set(Object.values(entries).flatMap((x) => (x.custom ? [x.custom.handler] : [])))].sort().join(', ')}`);
  console.log(`dependency: ${(['alone', 'sameRoom', 'facilityLevel', 'otherFacility', 'controlCenter'] as const).map((d) => `${d} ${count((x) => x.dependency === d)}`).join(', ')}`);
  console.log(normalizationChanged.length ? `normalization changed the parse of ${normalizationChanged.length} description(s):\n  ${normalizationChanged.join('\n  ')}` : 'normalization changed no parse');
}
main().catch((error) => { console.error(error); process.exit(1); });
