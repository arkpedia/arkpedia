/*
 * The Techniques page against the game's own text. For every technique rule, who it finds in
 * the EN game tables (character_table and, for Amiya's forms, char_patch_table traits and
 * talents, skill_table with each level's values filled in, battle_equip module stages 1 and 3 as
 * module-stages.mjs builds them). Compare rules on each source in both directions: differences
 * can indicate missing records, different wording, or a detector that missed an effect.
 *
 *   ARKPEDIA_EN_EXCEL=<.../en/gamedata/excel> npx tsx scripts/audits/audit-techniques-vs-gamedata.ts
 *
 * Defaults to the stage pipeline's cache (npm run stages:refresh fills it), and skips without it.
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
const GD = process.env.ARKPEDIA_EN_EXCEL ?? '.cache/upstream/en-gamedata/en/gamedata/excel';
if (!fs.existsSync(`${GD}/character_table.json`)) { console.log(`SKIPPED: no EN game tables at ${GD} (set ARKPEDIA_EN_EXCEL)`); process.exit(0); }
const ch = JSON.parse(fs.readFileSync(`${GD}/character_table.json`, 'utf8'));
const sk = JSON.parse(fs.readFileSync(`${GD}/skill_table.json`, 'utf8'));
const be = JSON.parse(fs.readFileSync(`${GD}/battle_equip_table.json`, 'utf8'));
const ue = JSON.parse(fs.readFileSync(`${GD}/uniequip_table.json`, 'utf8'));
// Amiya's Guard and Medic forms live only in char_patch_table, as for the refresh (characterOf).
const patch = fs.existsSync(`${GD}/char_patch_table.json`) ? JSON.parse(fs.readFileSync(`${GD}/char_patch_table.json`, 'utf8')) : {};
/* The game's text as the English refresh writes it into the records (sync-operator-english.mjs,
   module-stages.mjs), so a difference here is the record's, not this script's: rich text stripped
   by the game's own tags only, every placeholder filled. A blanket <[^>]*> strip and a second
   filler here left "{atk:0%}" in module text, which the "reduce ... by N%" rule cannot read. */
const talentNames = (c: any) => (Array.isArray(c.talents) ? c.talents : []).flatMap((t: any) => (Array.isArray(t.candidates) ? t.candidates : []).map((x: any) => x.name)).filter(Boolean);
// charEquip is the character's own list; equipDict's charId is shared by Amiya's three forms.
const ownModules = (cid: string) => Object.entries<any>(ue.equipDict).filter(([eid, eq]) => (Array.isArray(ue.charEquip?.[cid]) ? ue.charEquip[cid].includes(eid) : eq.charId === cid));
const records: any[] = [];
for (const dir of fs.readdirSync('data').filter((d) => /^operators-\dstar$/.test(d))) for (const f of fs.readdirSync(path.join('data', dir))) records.push(JSON.parse(fs.readFileSync(path.join('data', dir, f), 'utf8')));
const byId = new Map(records.map((r) => [r.internalName, r]));
// Compare like sources. A match on S1 cannot hide a missing T2 or module stage.
let checked = 0;
let sources = 0;
const differences: string[] = [];
for (const [cid, character] of Object.entries<any>({ ...ch, ...patch.patchChars })) {
  const op = byId.get(cid);
  if (!cid.startsWith('char_') || !op || op.isFuture) continue;
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
    const record = op.talents?.find((t: any) => candidates.some((c: any) => c.name === t.name)) ?? op.talents?.[i];
    compare(`Talent ${record?.name ?? i + 1}`, candidates.map((c: any) => stripRichText(c.description)), (record?.rows ?? []).map((r: any) => r.description));
  }
  for (const [i, skill] of (Array.isArray(character.skills) ? character.skills : []).entries()) {
    const data = sk[skill.skillId];
    if (data) compare(`S${i + 1}`, skillRows(data).map((r: any) => r.description), (op.skills?.skillList?.[i]?.levels ?? []).map((r: any) => r.description));
  }
  for (const [id, equip] of ownModules(cid)) {
    if (!be[id]) continue;
    const recorded = op.modules?.find((m: any) => m.moduleId === id);
    const stages = moduleStages(equip, be[id], talentNames(character), (item: string) => item);
    for (const i of [0, 2]) {
      const stage = `Stage ${i + 1}`;
      compare(`${equip.typeIcon} ${stage}`, [stages[i]?.effectText ?? ''], [recorded?.stages?.find((s: any) => s.stage === stage)?.effectText ?? '']);
    }
  }
}
console.log(`Compared ${sources} sources across ${checked} EN operators. ${differences.length} rule differences to review.`);
for (const difference of differences.sort()) console.log(difference);
