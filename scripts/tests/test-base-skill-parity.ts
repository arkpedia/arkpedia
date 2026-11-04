import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { calculateBase, type BaseCalculationInput } from '../../lib/base/calculateBase';
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { BaseAssignments, FactoryProducts, SlotAssignment } from '../../lib/base/baseTypes';
import type { BaseOperator } from '../../lib/operators/operatorTypes';
import { activeBaseSkills } from '../../lib/base/activeBaseSkills';
import { SHEET252_FACILITIES, SHEET252_PRODUCTS, sheet252Shifts } from '../bench/sheet-252';
import { SHEET_FACILITIES, FORMATIONS, withFreeBeds, assignmentsOf, everyoneMaxed } from '../bench/sheet-342';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import fixture from '../../tests/fixtures/base-account.json';
import { KNOWN_DEVIATIONS } from './base-skill-deviations';

/*
 * The skill table (lib/base/base-skill-effects.json) replaced the hand-written handlers and the description text
 * as where every base skill's numbers come from. While the handlers were folded in, this test held the new
 * calculator equal to the old one (frozen under lib/base/legacy/ for the move), room by room, over the reference
 * sheets' staffings, the fixture account and 500 seeded random placements of a maxed roster; the differences
 * were the skills the handlers or the text got wrong, listed with reasons in KNOWN_DEVIATIONS and each held to
 * its corrected number in test-base-skill-corrections.ts. With the legacy copy gone, the same cases are held to a
 * golden snapshot of the new numbers (tests/fixtures/base-calculator-golden.json): a regression lock, not the
 * proof. Refresh it after a deliberate change to a skill's number:
 *
 *   UPDATE_GOLDEN=1 npx tsx --test scripts/tests/test-base-skill-parity.ts
 *
 * The fixture and the sheets are stored in full, so a difference names its room and field; the random placements
 * are stored as a hash each. There is no saved Krooster lookup page in the repository, so the Krooster-shaped
 * roster is stood in for by the maxed catalogue roster the benches use.
 */
const GOLDEN = path.join(process.cwd(), 'tests/fixtures/base-calculator-golden.json');
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const golden: { full: Record<string, unknown>; hashes: Record<string, string> } = UPDATE ? { full: {}, hashes: {} } : JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
/** Numbers rounded so the snapshot and a fresh run agree to the tolerance `near` allows. */
const rounded = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(9)) : v)));
const hashOf = (value: unknown) => createHash('sha256').update(JSON.stringify(rounded(value))).digest('hex');
process.on('exit', () => { if (UPDATE) fs.writeFileSync(GOLDEN, JSON.stringify(golden) + '\n'); });
const chinese = (text: string | null | undefined) => /[\u4e00-\u9fff]/.test(text ?? '');
const everyone: BaseOperator[] = getAllOperators().filter(op => !/^Amiya \(/.test(op.name) && !op.isFuture && !(op.baseSkills ?? []).some(sk => chinese(sk.description))).map(op => ({ name: op.name, rarity: op.rarity, faction: op.faction, class: op.class, branch: op.branch, baseSkills: op.baseSkills, ...(op.aliases?.length ? { aliases: op.aliases } : {}) }));
// The sheets and the fixture place whoever they place; the random roster leaves out the operators whose skills now read differently.
const operators = everyone.filter(op => !(op.name in KNOWN_DEVIATIONS));
const base = { operators: everyone, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes };
const maxed = everyoneMaxed(everyone);

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
function numbersOf(r: ReturnType<typeof calculateBase>, kindOf: Map<string, string>) {
  const rooms = Object.fromEntries(Object.entries(r.rooms).map(([id, room]) => [id, {
    productivity: room.productivity, capacity: room.capacity, orderLimit: room.orderLimit, morale: room.morale, clueSpeed: room.clueSpeed, clueSpeedBase: room.clueSpeedBase,
    droneRate: room.droneRate, office: room.office, trainingSpeed: room.trainingSpeed, trainingHours: room.trainingHours, workshop: room.workshop?.chance ?? null,
    combinedMoraleRate: room.combinedMoraleRate, perOperatorMorale: room.perOperatorMorale, deadTime: room.deadTime, fullTime: room.fullTime,
    breakdown: room.facilityBreakdown ? { finalYellow: room.facilityBreakdown.finalYellow, effective: room.facilityBreakdown.effectiveProductivity, lines: ['factory', 'tradingPost', 'powerPlant'].includes(kindOf.get(id) ?? '') ? room.facilityBreakdown.lines.map(l => `${l.rawValue.toFixed(9)}|${l.included}`).sort() : null } : null,
  }]));
  const { moraleLevels, moraleOrder, roomDailyOutput, totalMonsterMeal, resourcePools, ccEffects, ccMoraleRelief, totalFelvine, dormitoryRecoveryByFacility, dailyExpGreen, dailyExpRed, dailyGoldMadeGreen, dailyGoldMadeRed, dailyGoldSoldGreen, dailyGoldSoldRed, dailyGoldWorthGreen, dailyGoldWorthRed, dailyExtraLmdFromOrdersGreen, dailyExtraLmdFromOrdersRed } = r;
  return { rooms, moraleLevels, moraleOrder, roomDailyOutput, totalMonsterMeal, resourcePools, ccEffects, ccMoraleRelief, totalFelvine, dormitoryRecoveryByFacility, dailyExpGreen, dailyExpRed, dailyGoldMadeGreen, dailyGoldMadeRed, dailyGoldSoldGreen, dailyGoldSoldRed, dailyGoldWorthGreen, dailyGoldWorthRed, dailyExtraLmdFromOrdersGreen, dailyExtraLmdFromOrdersRed };
}
function sameAsGolden(label: string, input: BaseCalculationInput, out: string[], full = true) {
  const kindOf = new Map(input.facilities.map(f => [f.id, f.kind]));
  const now = numbersOf(calculateBase(input), kindOf);
  if (UPDATE) { if (full) golden.full[label] = rounded(now); else golden.hashes[label] = hashOf(now); return; }
  if (full) {
    const differences: string[] = [];
    near(golden.full[label], rounded(now), label, differences);
    out.push(...differences.slice(0, 20));
  } else if (golden.hashes[label] !== hashOf(now)) out.push(`${label}: differs from the golden snapshot`);
}

test('the fixture account and the reference sheets compute as the golden snapshot records', () => {
  const out: string[] = [];
  const b = fixture.base;
  sameAsGolden('fixture', { ...base, facilities: getFacilities(b.productionSpots as never, b.facilityLevels), assignments: b.assignments as BaseAssignments, factoryProducts: b.factoryProducts as FactoryProducts, dormitoryAmbience: b.dormitoryAmbience, importedMorale: b.morale, loginInterval: 8 }, out);
  const roster252 = Object.fromEntries(Object.keys(maxed).map(n => [n, maxed[n]]));
  sheet252Shifts(roster252).forEach((shift, i) => sameAsGolden(`sheet252 shift ${i}`, { ...base, facilities: SHEET252_FACILITIES, assignments: shift.assignments, factoryProducts: SHEET252_PRODUCTS, loginInterval: 8 }, out));
  FORMATIONS.forEach((formation, i) => sameAsGolden(`sheet342 formation ${i}`, { ...base, facilities: SHEET_FACILITIES, assignments: assignmentsOf(withFreeBeds(i), maxed), factoryProducts: formation.products, loginInterval: 8 }, out));
  assert.deepEqual(out, []);
});

test('seeded random placements of the maxed roster compute as the golden snapshot records', () => {
  let seed = 20261104;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const layouts = [getFacilities(presetSpots('2-5-2-right'), presetLevels('2-5-2-right')), SHEET_FACILITIES, getFacilities(presetSpots('2-4-3'), presetLevels('2-4-3'))];
  const skilledFor = new Map<string, string[]>();
  for (const f of layouts.flat()) if (!skilledFor.has(f.label)) skilledFor.set(f.label, operators.filter(op => activeBaseSkills(op, f.label, 'Elite 2', slots, 90).length).map(op => op.name));
  const names = operators.map(op => op.name);
  const out: string[] = [];
  for (let n = 0; n < 500; n++) {
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
    sameAsGolden(`placement ${n}`, { ...base, facilities, assignments, factoryProducts, loginInterval: pick([6, 8, 12, 24]), clueExchangeActive: rand() < 0.5, moraleAbove12: rand() < 0.5 }, out, false);
    if (out.length > 40) break;
  }
  assert.deepEqual(out, []);
});
