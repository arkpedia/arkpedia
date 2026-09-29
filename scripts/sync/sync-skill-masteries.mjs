#!/usr/bin/env node
/**
 * The refresh's skill-masteries stage: every 4-star-and-up operator's mastery costs (M1 to
 * M3 of each skill), filled in from the game's own tables where the record lacks them.
 *
 *   node scripts/sync/sync-skill-masteries.mjs
 *
 * An operator's mastery costs are written by the English refresh (sync-operator-english.mjs)
 * only for an operator released in the last 90 days or still carrying Chinese text, so a
 * record from the older wiki import kept whatever that import had: Pepe's first skill had
 * its M1 and no M2 or M3, and 36 operators had 53 skills with a mastery missing
 * (2026-09-29). An operator the CN client has and the Global one does not (Thumpy, Aphrissa)
 * is in no English table at all, so nothing wrote its costs. The operator page then said
 * "No cost data", and the planner's goals for that skill cost nothing.
 *
 * What it writes: a mastery the record has no materials for, from the Global character table
 * where the operator is there (its skill named as the record names it, so a reordered list
 * cannot fill the wrong one), else from the CN one; the materials by their site name
 * (scripts/lib/material-items.mjs: the EN client's, else data/material-names.json). A mastery
 * the record already has is never touched, and nothing else in the record is.
 *
 * What it reports (data/quarantine.json, stage skill-masteries): a skill whose mastery is
 * still missing -- in neither table yet, or costing a material with no English name -- until
 * a later run can fill it. Raidian, newer than the pinned CN mirror on 2026-09-29, is one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beginStage, defaultNow } from '../lib/quarantine.mjs';
import { materialItems, readMaterialNames } from '../lib/material-items.mjs';

export const STAGE = 'skill-masteries';
const MASTERIES = ['m1', 'm2', 'm3'];
const hasChinese = text => /\p{Script=Han}/u.test(String(text ?? ''));
// Letters and digits only: Bubble's record writes its skill "Beaten Up" in quotes, the table not.
const plainName = text => String(text ?? '').replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();

/** A mastery the record has materials for. */
const filled = cost => Array.isArray(cost) && cost.length > 0;

/**
 * One operator's missing masteries, filled from the tables:
 *   en, cn:  { characters, skills } of each client (character_table, skill_table)
 *   nameOf:  item id -> the site's material name
 * Returns the record (a new object only when something changed), what was filled and
 * what is still missing, each as { skill, mastery, why? }.
 */
export function fillMasteryCosts(operator, { en, cn, nameOf }) {
  const skills = operator?.skills?.skillList;
  if (!Array.isArray(skills) || !(operator.rarity >= 4)) return { operator, filled: [], missing: [] };
  const english = en?.characters?.[operator.internalName];
  const chinese = cn?.characters?.[operator.internalName];
  const done = [], missing = [];
  let next = operator;
  skills.forEach((skill, index) => {
    const lacking = MASTERIES.filter(key => !filled(skill?.cost?.[key]));
    if (!lacking.length) return;
    // The Global table only when its skill at this place is this one; the CN table names
    // skills in Chinese, so there the place alone says which it is.
    const globalEntry = english?.skills?.[index];
    const globalName = globalEntry && en.skills?.[globalEntry.skillId]?.levels?.[0]?.name;
    const source = globalEntry && plainName(globalName) === plainName(skill.name) ? globalEntry
      : !english ? chinese?.skills?.[index] : null;
    for (const key of lacking) {
      const step = source?.levelUpCostCond?.[MASTERIES.indexOf(key)];
      const cost = Array.isArray(step?.levelUpCost) ? step.levelUpCost : null;
      if (!cost?.length) {
        missing.push({ skill: index, mastery: key, why: english && !source ? 'the Global table names this skill differently' : 'no table has it yet' });
        continue;
      }
      const materials = cost.map(entry => ({ name: nameOf(entry.id), quantity: entry.count }));
      const unnamed = materials.filter(material => !material.name || hasChinese(material.name));
      if (unnamed.length) {
        missing.push({ skill: index, mastery: key, why: `it costs a material with no English name yet (item ${cost.filter(entry => !nameOf(entry.id) || hasChinese(nameOf(entry.id))).map(entry => entry.id).join(', ')})` });
        continue;
      }
      if (next === operator) next = structuredClone(operator);
      const target = next.skills.skillList[index];
      const costs = { ...(target.cost ?? {}), [key]: materials };
      // m1, m2, m3 in order, as every other record writes them; only this skill is rewritten.
      target.cost = Object.fromEntries([...MASTERIES.filter(k => k in costs).map(k => [k, costs[k]]), ...Object.entries(costs).filter(([k]) => !MASTERIES.includes(k))]);
      done.push({ skill: index, mastery: key });
    }
  });
  return { operator: next, filled: done, missing };
}

function main() {
  const root = process.cwd();
  const readTable = (dir, name, required) => {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) {
      if (required) throw new Error(`Missing ${file}. Run scripts/sync/refresh-stage-data.sh first, or point ARKPEDIA_EN / ARKPEDIA_CN at a checkout.`);
      return null;
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  };
  const enExcel = path.join(process.env.ARKPEDIA_EN || '.cache/upstream/en-gamedata', 'en', 'gamedata', 'excel');
  const cnExcel = path.join(process.env.ARKPEDIA_CN || '.cache/upstream/cn-resource', 'gamedata', 'excel');
  const tables = dir => ({ characters: readTable(dir, 'character_table.json', true), skills: readTable(dir, 'skill_table.json', dir === enExcel) ?? {} });
  const en = tables(enExcel);
  const cn = fs.existsSync(path.join(cnExcel, 'character_table.json')) ? tables(cnExcel) : null;
  const names = readMaterialNames(JSON.parse(fs.readFileSync(path.join(root, 'data/material-names.json'), 'utf8')));
  const items = materialItems({ enItems: readTable(enExcel, 'item_table.json', true).items, cnItems: cn ? readTable(cnExcel, 'item_table.json', false)?.items : null, names });

  const stage = beginStage(root, STAGE, defaultNow());
  let written = 0, masteries = 0;
  for (const directory of fs.readdirSync(path.join(root, 'data')).filter(name => /^operators-[4-6]star$/.test(name)).sort()) {
    for (const file of fs.readdirSync(path.join(root, 'data', directory)).filter(name => name.endsWith('.json')).sort()) {
      const at = path.join(root, 'data', directory, file);
      const record = JSON.parse(fs.readFileSync(at, 'utf8'));
      const result = fillMasteryCosts(record, { en, cn, nameOf: items.nameOf });
      if (result.operator !== record) {
        fs.writeFileSync(at, `${JSON.stringify(result.operator, null, 2)}\n`);
        written++;
        masteries += result.filled.length;
        console.log(`  + ${record.name}: ${result.filled.map(({ skill, mastery }) => `S${skill + 1} ${mastery.toUpperCase()}`).join(', ')}`);
      }
      const bySkill = new Map();
      for (const gap of result.missing) bySkill.set(gap.skill, [...(bySkill.get(gap.skill) ?? []), gap]);
      for (const [skill, gaps] of bySkill) {
        const name = record.skills.skillList[skill]?.name;
        stage.add({
          key: `mastery:${record.internalName}:s${skill + 1}`,
          action: 'published-partial',
          reason: `${record.name}'s skill ${skill + 1}${name ? ` (${name})` : ''} has no ${gaps.map(gap => gap.mastery.toUpperCase()).join(', ')} cost: ${[...new Set(gaps.map(gap => gap.why))].join('; ')}. The operator page shows no cost for it and the planner counts it as free`,
        });
      }
    }
  }
  const held = stage.commit();
  console.log(`${masteries} mastery cost(s) filled in ${written} operator record(s)${cn ? '' : ' (no CN tables: Global operators only)'}; ${held.length} skill(s) still without one.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
