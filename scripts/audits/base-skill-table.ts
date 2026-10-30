/**
 * Every released operator's base skills as one table, the starting point for parameterized skills: room,
 * unlock, the game's buff id and its family, the numbers in the text, how the calculator computes the skill
 * today (a hand-written handler, a check by name, a typed effect (lib/base/skillEffects.ts), text rules, or not
 * modelled), and for the common families
 * the typed effect the family stands for. Nothing reads this table yet; it is for review.
 * Usage: npx tsx scripts/audits/base-skill-table.ts <out.json>
 */
import fs from 'node:fs';
import { getAllOperators } from '../../lib/operators/operators';
import { cleanSkillName } from '../../lib/base/activeBaseSkills';
import { specialSkillKey, NAMED_SKILL_CHECKS } from '../../lib/base/specialSkillKeys';
import { TRADING_POST_SPECIAL_SKILLS } from '../../lib/base/tradingPostSpecialSkills';
import { FACTORY_SPECIAL_SKILLS } from '../../lib/base/factorySpecialSkills';
import { POWER_PLANT_SPECIAL_SKILLS } from '../../lib/base/powerPlantSpecialSkills';
import { DORMITORY_SPECIAL_SKILLS } from '../../lib/base/dormitorySpecialSkills';
import { CONTROL_CENTER_SPECIAL_SKILLS } from '../../lib/base/controlCenterSpecialSkills';
import { OFFICE_SPECIAL_SKILLS } from '../../lib/base/officeSpecialSkills';
import { RECEPTION_ROOM_SPECIAL_SKILLS } from '../../lib/base/receptionRoomSpecialSkills';
import { buffFamily, typedEffects } from '../../lib/base/skillEffects';

const out = process.argv[2];
if (!out) throw new Error('Usage: npx tsx scripts/audits/base-skill-table.ts <out.json>');

const HANDLERS: Record<string, Record<string, unknown>> = {
  'Trading Post': TRADING_POST_SPECIAL_SKILLS, Factory: FACTORY_SPECIAL_SKILLS, 'Power Plant': POWER_PLANT_SPECIAL_SKILLS,
  Dormitory: DORMITORY_SPECIAL_SKILLS, 'Control Center': CONTROL_CENTER_SPECIAL_SKILLS, Office: OFFICE_SPECIAL_SKILLS,
  'Reception Room': RECEPTION_ROOM_SPECIAL_SKILLS,
};
const RULES: Record<string, string> = { 'Training Room': 'training rules', Workshop: 'workshop rules' };

/** What the common buff families do, in the game's own naming (building_data buff ids). The rest are one-off
 *  skills whose effect is their handler's. */
const FAMILIES: Record<string, string> = {
  trade_ord_spd: 'orderEfficiency',
  'trade_ord_spd&limit': 'orderEfficiency + orderLimit',
  'trade_ord_wt&cost': 'goldOrderWeight + moraleCost',
  'trade_ord_limit&cost': 'orderLimit + moraleCost',
  manu_prod_spd: 'productivity',
  'manu_prod_spd&limit': 'productivity + capacity',
  'manu_prod_limit&cost': 'capacity + moraleCost',
  'manu_prod_spd&limit&cost': 'productivity + capacity + moraleCost',
  manu_formula_spd: 'productivity (one product)',
  'manu_prod_spd&power': 'productivity per Power Plant',
  manu_prod_spd_bd: 'productivity per resource',
  manu_prod_spd_addition: 'productivity (added after others)',
  power_rec_spd: 'droneRecharge',
  dorm_rec_all: 'recovery (everyone, strongest only)',
  'dorm_rec_all&oneself': 'recovery (everyone) + self',
  'dorm_rec_all&tired': 'recovery (everyone) + below a Morale level',
  dorm_rec_single: 'recovery (one operator, least Morale)',
  'dorm_rec_single&oneself': 'recovery (one operator) + self',
  dorm_rec_oneself: 'recovery (self)',
  control_mp_cost: 'moraleCost (Control Center)',
  'control_mp_cost&faction': 'moraleCost (Control Center, a faction)',
  control_tra_spd: 'orderEfficiency (all Trading Posts)',
  meet_spd: 'clueSpeed',
  'meet_spd&team': 'clueSpeed + a faction\'s clue',
  'meet_spd&cost_condChar': 'clueSpeed + moraleCost with an operator',
  meet_spd_notOwned: 'clueSpeed (clues not owned)',
  meet_flag: 'clue preference',
  meet_team: 'a faction\'s clue',
  hire_spd: 'hrSpeed',
  hire_spd_cost: 'hrSpeed + moraleCost',
  'hire_spd&clue': 'hrSpeed + clueSpeed',
  'train_spd&profession': 'trainingSpeed (a class)',
  'train_spd&profession2': 'trainingSpeed (a class, stronger)',
  'train_spd&profession3': 'trainingSpeed (a class, strongest)',
  train_spd: 'trainingSpeed',
  train_spd_doubleProf: 'trainingSpeed (two classes)',
  train_spd_tag: 'trainingSpeed (a tag)',
  'train_cost&profession': 'trainingMoraleCost (a class)',
  workshop_formula_probability: 'byproductChance (a recipe type)',
  workshop_proc_probability: 'byproductChance',
  workshop_formula_cost3: 'moraleCost (a recipe type)',
  workshop_formula_device: 'byproductChance (devices)',
};

// Signed numbers and percentages in the text, in order ("+45%", "-0.25", "+1"); bare level or count numbers
// without a sign are left out.
const numbers = (text: string) => [...text.matchAll(/([+-]\d+(?:\.\d+)?)(%?)/g)].map(m => `${m[1]}${m[2]}`);
const ELITE = ['E0', 'E1', 'E2'];

const rows = getAllOperators().filter(o => !o.isFuture && !/^Amiya \(/.test(o.name)).flatMap(op => (op.baseSkills ?? []).map(skill => {
  const room = skill.facility ?? '';
  const key = specialSkillKey(op.name, skill, op.aliases ?? []);
  const handler = HANDLERS[room];
  const computedBy = handler && key in handler ? 'handler'
    : (NAMED_SKILL_CHECKS as readonly string[]).includes(key) ? 'named check'
    : typedEffects(skill) ? 'typed effect'
    : RULES[room] ?? (handler ? 'text rules' : 'not modelled');
  const fam = buffFamily(skill.buffId);
  return {
    operator: op.name, rarity: op.rarity ?? null, skill: cleanSkillName(skill.name), room,
    unlock: typeof skill.phase === 'number' ? `${ELITE[skill.phase] ?? `E${skill.phase}`}${skill.level && skill.level > 1 ? ` Lv${skill.level}` : ''}` : skill.eliteLevel ?? '',
    buffId: skill.buffId ?? '', family: fam, effect: FAMILIES[fam] ?? '', values: numbers(skill.description ?? ''),
    computedBy, handlerKey: computedBy === 'handler' || computedBy === 'named check' ? key : '', description: skill.description ?? '',
  };
}));
fs.writeFileSync(out, JSON.stringify(rows));
const count = (f: (r: typeof rows[number]) => boolean) => rows.filter(f).length;
console.log(`${rows.length} skills, ${new Set(rows.map(r => r.family)).size} families; typed by family ${count(r => !!r.effect)}; read as typed effects ${count(r => r.computedBy === 'typed effect')}; handler ${count(r => r.computedBy === 'handler')}, named check ${count(r => r.computedBy === 'named check')}, text rules ${count(r => r.computedBy === 'text rules')}, training/workshop rules ${count(r => r.computedBy.endsWith(' rules') && r.computedBy !== 'text rules')}, not modelled ${count(r => r.computedBy === 'not modelled')}`);
