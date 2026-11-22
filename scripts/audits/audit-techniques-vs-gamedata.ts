/*
 * The Techniques page against the game's own text. For every technique rule, who it finds in
 * the EN game tables (character_table and, for Amiya's forms, char_patch_table traits and
 * talents, skill_table with each level's values filled in, battle_equip module stages 1 and 3 as
 * module-stages.mjs builds them). Compare rules on each source in both directions: differences
 * can indicate missing records, different wording, or a detector that missed an effect.
 *
 *   ARKPEDIA_EN_EXCEL=<.../en/gamedata/excel> npx tsx scripts/audits/audit-techniques-vs-gamedata.ts
 *
 * Local reports can skip a missing cache. --strict requires complete inputs and fails on findings.
 */
import fs from 'node:fs';
import path from 'node:path';
import { detectAutoTechniqueMatches } from '../../lib/techniques/autoTechniques';
import { NOT_FROM_TRAITS, traitText } from '../../lib/techniques/buildTechniqueGroups';
// @ts-expect-error Node refresh scripts are plain JavaScript.
import { stripRichText } from '../lib/gametext.mjs';
// @ts-expect-error Node refresh scripts are plain JavaScript.
import { officialTrait, skillRows } from '../sync/sync-operator-english.mjs';
// @ts-expect-error Node refresh scripts are plain JavaScript.
import { moduleStages } from '../sync/module-stages.mjs';
const strict = process.argv.includes('--strict');
const GD = process.env.ARKPEDIA_EN_EXCEL ?? '.cache/upstream/en-gamedata/en/gamedata/excel';
if (!strict && !fs.existsSync(`${GD}/character_table.json`)) { console.log(`SKIPPED: no EN game tables at ${GD} (set ARKPEDIA_EN_EXCEL)`); process.exit(0); }
const ch = JSON.parse(fs.readFileSync(`${GD}/character_table.json`, 'utf8'));
const sk = JSON.parse(fs.readFileSync(`${GD}/skill_table.json`, 'utf8'));
const be = JSON.parse(fs.readFileSync(`${GD}/battle_equip_table.json`, 'utf8'));
const ue = JSON.parse(fs.readFileSync(`${GD}/uniequip_table.json`, 'utf8'));
// Amiya's Guard and Medic forms live only in char_patch_table, as for the refresh (characterOf).
const patch = strict || fs.existsSync(`${GD}/char_patch_table.json`) ? JSON.parse(fs.readFileSync(`${GD}/char_patch_table.json`, 'utf8')) : {};
/* The game's text as the English refresh writes it into the records (sync-operator-english.mjs,
   module-stages.mjs), so a difference here is the record's, not this script's: rich text stripped
   by the game's own tags only, every placeholder filled. A blanket <[^>]*> strip and a second
   filler here left "{atk:0%}" in module text, which the "reduce ... by N%" rule cannot read. */
const talentNames = (c: any) => (Array.isArray(c.talents) ? c.talents : []).flatMap((t: any) => (Array.isArray(t.candidates) ? t.candidates : []).map((x: any) => x.name)).filter(Boolean);
// charEquip is the character's own list; equipDict's charId is shared by Amiya's three forms.
const ownsModule = (cid: string, id: string) => Array.isArray(ue.charEquip?.[cid])
  ? ue.charEquip[cid].includes(id) : ue.equipDict[id]?.charId === cid;
const records: any[] = [];
for (const dir of fs.readdirSync('data').filter((d) => /^operators-\dstar$/.test(d))) for (const f of fs.readdirSync(path.join('data', dir))) records.push(JSON.parse(fs.readFileSync(path.join('data', dir, f), 'utf8')));
if (strict && [ch, sk, be, ue.equipDict, patch.patchChars].some(table => !table || !Object.keys(table).length)) {
  throw new Error('Incomplete English game tables for the techniques audit');
}
const byId = new Map(records.map((r) => [r.internalName, r]));
// Compare like sources. A match on S1 cannot hide a missing T2 or module stage.
let checked = 0;
let sources = 0;
const differences: string[] = [];
const characters = { ...ch, ...patch.patchChars };
const unverifiedOperators: string[] = [];
const unverifiedModules: string[] = [];
for (const op of records) {
  if (!characters[op.internalName]) unverifiedOperators.push(op.name);
  for (const mod of op.modules ?? []) {
    if (mod.type !== 'Upgrade') continue;
    if (!be[mod.moduleId]) unverifiedModules.push(`${op.name} / ${mod.name}`);
    else if (!ownsModule(op.internalName, mod.moduleId)) differences.push(`${op.name} [${mod.moduleId}] module belongs to a different operator in EN`);
  }
  // Manual tags override automatic wording in the guide. Catch the two easily confused hit
  // tags when the same source positively establishes the other effect, including CN-first records.
  function checkHitTags(source: string, tags: any[], texts: string[], nonSkill: boolean) {
    for (const { name } of tags) {
      if (name !== 'Hit Reduction' && name !== 'Hit Rate Down') continue;
      const other = name === 'Hit Reduction' ? 'Hit Rate Down' : 'Hit Reduction';
      const evidence = texts.flatMap(text => detectAutoTechniqueMatches(op.rarity, [text], op.name, op.branch, op.class, nonSkill).map(match => match.name));
      if (evidence.includes(other) && !evidence.includes(name)) differences.push(`${op.name} [${source}] tagged ${name}, wording indicates ${other}`);
    }
  }
  for (const talent of op.talents ?? []) checkHitTags(talent.name, talent.technique ?? [], (talent.rows ?? []).map((r: any) => r.description), true);
  for (const [i, skill] of (op.skills?.skillList ?? []).entries()) checkHitTags(`S${i + 1}`, skill.techniques ?? [], (skill.levels ?? []).map((l: any) => l.description), false);
}
for (const [cid, character] of Object.entries<any>(characters)) {
  const op = byId.get(cid);
  if (!cid.startsWith('char_') || !op) continue;
  checked++;
  function matches(texts: string[], source: string) {
    const result = new Set<string>();
    for (const text of texts) {
      for (const match of detectAutoTechniqueMatches(op.rarity, [text], op.name, op.branch, op.class, !source.startsWith('S'))) {
        if (match.name && !match.viaBranch && !(source === 'Trait' && NOT_FROM_TRAITS.has(match.name))) result.add(match.name);
      }
    }
    return result;
  }
  function compare(source: string, game: string[], record: string[]) {
    if (!game.some(Boolean) && !record.some(Boolean)) return;
    sources++;
    const official = matches(game, source);
    const recorded = matches(record, source);
    for (const rule of official) if (!recorded.has(rule)) differences.push(`${op.name} [${source}] game only: ${rule}`);
    for (const rule of recorded) if (!official.has(rule)) differences.push(`${op.name} [${source}] record only: ${rule}`);
  }
  compare('Trait', [traitText({ trait: officialTrait(character) }) ?? ''], [traitText(op) ?? '']);
  for (const [i, talent] of (Array.isArray(character.talents) ? character.talents : []).entries()) {
    const candidates = Array.isArray(talent.candidates) ? talent.candidates : [];
    if (!candidates.some((c: any) => c.description)) continue;
    const record = op.talents?.find((t: any) => candidates.some((c: any) => c.name && (c.name === t.name || t.rows?.some((r: any) => r.name === c.name)))) ?? op.talents?.[i];
    compare(`Talent ${record?.name ?? i + 1}`, candidates.map((c: any) => stripRichText(c.description)), (record?.rows ?? []).map((r: any) => r.description));
  }
  for (const [i, skill] of (Array.isArray(character.skills) ? character.skills : []).entries()) {
    const data = sk[skill.skillId];
    if (skill.skillId && !data) differences.push(`${op.name} [S${i + 1}] missing EN skill ${skill.skillId}`);
    if (data) compare(`S${i + 1}`, skillRows(data).map((r: any) => r.description), (op.skills?.skillList?.[i]?.levels ?? []).map((r: any) => r.description));
  }
  for (const [id, equip] of Object.entries<any>(ue.equipDict)) {
    if (!be[id] || !ownsModule(cid, id)) continue;
    const recorded = op.modules?.find((m: any) => m.moduleId === id);
    if (!recorded) {
      differences.push(`${op.name} [${id}] module missing from operator record`);
      continue;
    }
    const stages = moduleStages(equip, be[id], talentNames(character), (item: string) => item);
    for (const i of [0, 2]) {
      const stage = `Stage ${i + 1}`;
      compare(`${equip.typeIcon} ${stage}`, [stages[i]?.effectText ?? ''], [recorded?.stages?.find((s: any) => s.stage === stage)?.effectText ?? '']);
    }
  }
}
console.log(`Compared ${sources} sources across ${checked} EN operators. ${differences.length} rule differences to review.`);
for (const difference of differences.sort()) console.log(difference);
if (unverifiedOperators.length) console.log('Operators without an EN reference:', unverifiedOperators.sort().join(', '));
if (unverifiedModules.length) console.log('Upgrade modules without EN battle data:', unverifiedModules.sort().join(', '));
if (strict && (!checked || !sources)) throw new Error('No EN operator sources were compared');
if (strict && differences.length) process.exitCode = 1;
