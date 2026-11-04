import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { calculateBase, type BaseCalculationInput } from '../../lib/base/calculateBase';
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import { productivityOf, orderEfficiencyOf, capacityOf, orderLimitOf, clueSpeedOf, hrSpeedOf, droneRateOf, moraleOf, controlCenterOf, dormitoryRecoveryOf, type SkillSource } from '../../lib/base/skillReading';
import { skillEffectEntry } from '../../lib/base/baseSkillEffects';
import type { BaseAssignments, FactoryProducts, SlotAssignment } from '../../lib/base/baseTypes';
import type { BaseOperator, BaseSkill } from '../../lib/operators/operatorTypes';
import { specialSkillKey, SPECIAL_SKILL_BUFFS } from '../../lib/base/specialSkillKeys';
import { activeBaseSkills } from '../../lib/base/activeBaseSkills';
import { SHEET252_FACILITIES, SHEET252_PRODUCTS, sheet252Shifts } from '../bench/sheet-252';
import { SHEET_FACILITIES, FORMATIONS, withFreeBeds, assignmentsOf, everyoneMaxed } from '../bench/sheet-342';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import fixture from '../../tests/fixtures/base-account.json';

/*
 * The skill table (lib/base/base-skill-effects.json) replaced the description text as where a plain skill's
 * numbers come from. These hold the two readings equal: skill by skill for every record skill the table reads,
 * and room by room through the whole calculator over the reference sheets' staffings, the fixture account and
 * seeded random placements of a maxed roster. There is no saved Krooster lookup page in the repository, so the
 * Krooster-shaped roster is stood in for by the maxed catalogue roster the benches use.
 */
const chinese = (text: string | null | undefined) => /[\u4e00-\u9fff]/.test(text ?? '');
const operators: BaseOperator[] = getAllOperators().filter(op => !/^Amiya \(/.test(op.name) && !op.isFuture && !(op.baseSkills ?? []).some(sk => chinese(sk.description))).map(op => ({ name: op.name, rarity: op.rarity, faction: op.faction, class: op.class, branch: op.branch, baseSkills: op.baseSkills, ...(op.aliases?.length ? { aliases: op.aliases } : {}) }));
const base = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes };
const maxed = everyoneMaxed(operators);
const SOURCES: SkillSource[] = ['text', 'table'];

/** The readers of a skill's own room: a Factory skill is never read through the Control Center's patterns. */
function readingsOf(sk: BaseSkill, source: SkillSource): Record<string, unknown> {
  switch (skillEffectEntry(sk)?.roomType) {
    case 'MANUFACTURE': return { exp: productivityOf(sk, 'Battle Records', source), gold: productivityOf(sk, 'Precious Metals', source), shards: productivityOf(sk, 'Originium Shards', source), capacity: capacityOf(sk, source), morale: moraleOf(sk, source) };
    case 'TRADING': return { order: orderEfficiencyOf(sk, source), limit: orderLimitOf(sk, source), morale: moraleOf(sk, source) };
    case 'MEETING': return { clue: clueSpeedOf(sk, source), morale: moraleOf(sk, source) };
    case 'HIRE': return { hr: hrSpeedOf(sk, source), morale: moraleOf(sk, source) };
    case 'POWER': return { drone: droneRateOf(sk, source), morale: moraleOf(sk, source) };
    case 'CONTROL': return { cc: controlCenterOf(sk, source), morale: moraleOf(sk, source) };
    case 'DORMITORY': return { dorm: dormitoryRecoveryOf(sk, source) };
    default: return {};
  }
}

test('every flat table entry reads as the text did, skill by skill', () => {
  const differences: string[] = [];
  for (const op of getAllOperators()) for (const sk of op.baseSkills ?? []) {
    const entry = skillEffectEntry(sk);
    // A skill with a handler never reached the text readers; a CN-only skill's text has no English for them.
    if (entry?.shape !== 'flat' || specialSkillKey(op.name, sk, op.aliases) in SPECIAL_SKILL_BUFFS || chinese(sk.description)) continue;
    const [text, table] = SOURCES.map(source => readingsOf(sk, source));
    for (const key of Object.keys(text)) {
      const a = JSON.stringify(text[key]), b = JSON.stringify(table[key]);
      if (a !== b) differences.push(`${op.name} / ${sk.name} (${sk.buffId}) ${key}: text ${a}, table ${b}`);
    }
  }
  assert.deepEqual(differences, []);
});

type Numbers = unknown;
function near(a: Numbers, b: Numbers, path: string, out: string[]) {
  if (typeof a === 'number' && typeof b === 'number') { if (!(Math.abs(a - b) <= 1e-9 || (Number.isNaN(a) && Number.isNaN(b)) || a === b)) out.push(`${path}: ${a} vs ${b}`); return; }
  if (Array.isArray(a) && Array.isArray(b)) { if (a.length !== b.length) out.push(`${path}: length ${a.length} vs ${b.length}`); a.forEach((x, i) => near(x, b[i], `${path}[${i}]`, out)); return; }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) near((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out);
    return;
  }
  if (a !== b) out.push(`${path}: ${String(a)} vs ${String(b)}`);
}
/** The calculator's numbers, the parts a room's rates and the day's totals are made of. */
function numbersOf(r: ReturnType<typeof calculateBase>) {
  const rooms = Object.fromEntries(Object.entries(r.rooms).map(([id, room]) => [id, {
    productivity: room.productivity, capacity: room.capacity, orderLimit: room.orderLimit, morale: room.morale, clueSpeed: room.clueSpeed, clueSpeedBase: room.clueSpeedBase,
    droneRate: room.droneRate, office: room.office, trainingSpeed: room.trainingSpeed, trainingHours: room.trainingHours, workshop: room.workshop?.chance ?? null,
    combinedMoraleRate: room.combinedMoraleRate, perOperatorMorale: room.perOperatorMorale, deadTime: room.deadTime, fullTime: room.fullTime,
    breakdown: room.facilityBreakdown ? { finalYellow: room.facilityBreakdown.finalYellow, effective: room.facilityBreakdown.effectiveProductivity, lines: room.facilityBreakdown.lines.map(l => [l.operatorName, l.skillName, l.rawValue, l.included]) } : null,
  }]));
  const { moraleLevels, moraleOrder, roomDailyOutput, totalMonsterMeal, resourcePools, ccEffects, ccMoraleRelief, totalFelvine, dormitoryRecoveryByFacility, dailyExpGreen, dailyExpRed, dailyGoldMadeGreen, dailyGoldMadeRed, dailyGoldSoldGreen, dailyGoldSoldRed, dailyGoldWorthGreen, dailyGoldWorthRed, dailyExtraLmdFromOrdersGreen, dailyExtraLmdFromOrdersRed } = r;
  return { rooms, moraleLevels, moraleOrder, roomDailyOutput, totalMonsterMeal, resourcePools, ccEffects, ccMoraleRelief, totalFelvine, dormitoryRecoveryByFacility, dailyExpGreen, dailyExpRed, dailyGoldMadeGreen, dailyGoldMadeRed, dailyGoldSoldGreen, dailyGoldSoldRed, dailyGoldWorthGreen, dailyGoldWorthRed, dailyExtraLmdFromOrdersGreen, dailyExtraLmdFromOrdersRed };
}
function sameBothWays(label: string, input: Omit<BaseCalculationInput, 'skillSource'>, out: string[]) {
  const [text, table] = SOURCES.map(skillSource => numbersOf(calculateBase({ ...input, skillSource })));
  const differences: string[] = [];
  near(text, table, label, differences);
  out.push(...differences.slice(0, 20));
}

test('the fixture account and the reference sheets compute the same from the table as from the text', () => {
  const out: string[] = [];
  const b = fixture.base;
  sameBothWays('fixture', { ...base, facilities: getFacilities(b.productionSpots as never, b.facilityLevels), assignments: b.assignments as BaseAssignments, factoryProducts: b.factoryProducts as FactoryProducts, dormitoryAmbience: b.dormitoryAmbience, importedMorale: b.morale, loginInterval: 8 }, out);
  const roster252 = Object.fromEntries(Object.keys(maxed).map(n => [n, maxed[n]]));
  sheet252Shifts(roster252).forEach((shift, i) => sameBothWays(`sheet252 shift ${i}`, { ...base, facilities: SHEET252_FACILITIES, assignments: shift.assignments, factoryProducts: SHEET252_PRODUCTS, loginInterval: 8 }, out));
  FORMATIONS.forEach((formation, i) => sameBothWays(`sheet342 formation ${i}`, { ...base, facilities: SHEET_FACILITIES, assignments: assignmentsOf(withFreeBeds(i), maxed), factoryProducts: formation.products, loginInterval: 8 }, out));
  assert.deepEqual(out, []);
});

test('seeded random placements of the maxed roster compute the same from the table as from the text', () => {
  let seed = 20261104;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const layouts = [getFacilities(presetSpots('2-5-2-right'), presetLevels('2-5-2-right')), SHEET_FACILITIES, getFacilities(presetSpots('2-4-3'), presetLevels('2-4-3'))];
  const skilledFor = new Map<string, string[]>();
  for (const f of layouts.flat()) if (!skilledFor.has(f.label)) skilledFor.set(f.label, operators.filter(op => activeBaseSkills(op, f.label, 'Elite 2', slots, 90).length).map(op => op.name));
  const names = operators.map(op => op.name);
  const out: string[] = [];
  for (let n = 0; n < 150; n++) {
    const facilities = pick(layouts);
    const used = new Set<string>();
    const assignments: BaseAssignments = {};
    for (const f of facilities) {
      if (!f.capacity) continue;
      const row: (SlotAssignment | null)[] = [];
      for (let i = 0; i < f.capacity; i++) {
        if (rand() < 0.1) { row.push(null); continue; }
        let name = rand() < 0.75 ? pick(skilledFor.get(f.label)!) : pick(names);
        for (let tries = 0; used.has(name) && tries < 20; tries++) name = pick(names);
        if (used.has(name)) { row.push(null); continue; }
        used.add(name);
        row.push({ operatorName: name, ...maxed[name], ...(f.kind === 'dormitory' ? { morale: Math.floor(rand() * 25) } : {}) });
      }
      assignments[f.id] = row;
    }
    const factoryProducts = Object.fromEntries(facilities.filter(f => f.kind === 'factory').map(f => [f.id, rand() < 0.5 ? 'Precious Metals' : 'Battle Records'])) as FactoryProducts;
    sameBothWays(`placement ${n}`, { ...base, facilities, assignments, factoryProducts, loginInterval: pick([6, 8, 12, 24]), clueExchangeActive: rand() < 0.5, moraleAbove12: rand() < 0.5 }, out);
    if (out.length > 40) break;
  }
  assert.deepEqual(out, []);
});
