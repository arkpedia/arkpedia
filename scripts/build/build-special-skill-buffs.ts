/**
 * Writes lib/base/special-skill-buffs.json: the game's buff id behind every key the base
 * calculator finds a special skill by ("Operator|Skill"), so a skill or operator Global renames
 * keeps its handler (lib/base/specialSkillKeys.ts).
 *
 *   npx tsx scripts/build/build-special-skill-buffs.ts
 *
 * Run it after adding a handler or a NamedSkillCheck; test-special-skill-keys.ts fails until
 * the file lists every key. Each key is looked up by name in this checkout's operator records
 * (data/operators-*star). A key whose name no record has any more -- the record was renamed
 * since the key was written -- keeps the buff id the file already gives it, as long as some
 * record still carries that buff; any other key that matches no record is refused, by name.
 */
import fs from 'node:fs';
import path from 'node:path';
import { cleanSkillName } from '../../lib/base/activeBaseSkills';
import { CONTROL_CENTER_SPECIAL_SKILLS } from '../../lib/base/controlCenterSpecialSkills';
import { DORMITORY_SPECIAL_SKILLS } from '../../lib/base/dormitorySpecialSkills';
import { FACTORY_SPECIAL_SKILLS } from '../../lib/base/factorySpecialSkills';
import { OFFICE_SPECIAL_SKILLS } from '../../lib/base/officeSpecialSkills';
import { POWER_PLANT_SPECIAL_SKILLS } from '../../lib/base/powerPlantSpecialSkills';
import { RECEPTION_ROOM_SPECIAL_SKILLS } from '../../lib/base/receptionRoomSpecialSkills';
import { TRADING_POST_SPECIAL_SKILLS } from '../../lib/base/tradingPostSpecialSkills';
import { NAMED_SKILL_CHECKS } from '../../lib/base/specialSkillKeys';

export const SPECIAL_SKILL_TABLES = {
  'Control Center': CONTROL_CENTER_SPECIAL_SKILLS,
  Dormitory: DORMITORY_SPECIAL_SKILLS,
  Factory: FACTORY_SPECIAL_SKILLS,
  Office: OFFICE_SPECIAL_SKILLS,
  'Power Plant': POWER_PLANT_SPECIAL_SKILLS,
  'Reception Room': RECEPTION_ROOM_SPECIAL_SKILLS,
  'Trading Post': TRADING_POST_SPECIAL_SKILLS,
} as const;

/** Every key the calculator finds a skill by: each table's, and the hand-written checks. */
export function specialSkillKeys(): string[] {
  return [...new Set([...Object.values(SPECIAL_SKILL_TABLES).flatMap((table) => Object.keys(table)), ...NAMED_SKILL_CHECKS])].sort();
}

interface OperatorRecord { name: string; baseSkills?: { name: string | null; buffId?: string }[] | null }

export function readOperatorRecords(root: string): OperatorRecord[] {
  const data = path.join(root, 'data');
  return fs.readdirSync(data).filter((dir) => /^operators-\d+star$/.test(dir)).flatMap((dir) =>
    fs.readdirSync(path.join(data, dir)).filter((file) => file.endsWith('.json'))
      .map((file) => JSON.parse(fs.readFileSync(path.join(data, dir, file), 'utf8')) as OperatorRecord));
}

/** The map: each key's buff ids (one skill name can be two steps, Togawa Sakiko's Plentiful Work
 *  Experience at Elite 0 and 2) from the records by name, else the previous map's while a record
 *  still carries one of them. */
export function buildSpecialSkillBuffs(keys: string[], operators: OperatorRecord[], previous: Record<string, string[]>): { buffs: Record<string, string[]>; unmatched: string[] } {
  const byName = new Map(operators.map((op) => [op.name, op]));
  const held = new Set(operators.flatMap((op) => (op.baseSkills ?? []).map((skill) => skill.buffId).filter(Boolean)));
  const buffs: Record<string, string[]> = {};
  const unmatched: string[] = [];
  for (const key of keys) {
    const at = key.indexOf('|');
    const operator = byName.get(key.slice(0, at)), skillName = key.slice(at + 1);
    const ids = [...new Set((operator?.baseSkills ?? []).filter((skill) => cleanSkillName(skill.name) === skillName).map((skill) => skill.buffId).filter((id): id is string => !!id))].sort();
    const kept = (previous[key] ?? []).some((id) => held.has(id)) ? previous[key] : [];
    if (ids.length || kept.length) buffs[key] = ids.length ? ids : kept; else unmatched.push(key);
  }
  return { buffs, unmatched };
}

const OUTPUT = 'lib/base/special-skill-buffs.json';

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const root = process.cwd();
  const at = path.join(root, OUTPUT);
  const previous = fs.existsSync(at) ? JSON.parse(fs.readFileSync(at, 'utf8')) as Record<string, string[]> : {};
  const { buffs, unmatched } = buildSpecialSkillBuffs(specialSkillKeys(), readOperatorRecords(root), previous);
  if (unmatched.length) {
    console.error(`${unmatched.length} key(s) name no operator's base skill in data/: ${unmatched.join('; ')}. Fix the key (it must be the record's name and the skill's, "Operator|Skill").`);
    process.exit(1);
  }
  // One key per line, so a diff shows exactly which handler moved.
  fs.writeFileSync(at, `{\n${Object.entries(buffs).map(([key, ids]) => `  ${JSON.stringify(key)}: ${JSON.stringify(ids)}`).join(',\n')}\n}\n`);
  console.log(`${Object.keys(buffs).length} special-skill keys written to ${OUTPUT}.`);
}
