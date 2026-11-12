import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { calculateBase } from '../../lib/base/calculateBase';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { FORMATIONS, SHEET_FACILITIES, assignmentsOf, everyoneMaxed, withFreeBeds } from './sheet-342';

const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name));
const roster = everyoneMaxed(operators);
const names = new Set(operators.map(o => o.name));
const missing = new Set<string>();
for (const f of FORMATIONS) for (const t of Object.values(f.teams)) for (const n of t) if (!names.has(n)) missing.add(n);
if (missing.size) { console.log('MISSING NAMES', [...missing].map(m => [m, [...names].filter(n => n.toLowerCase().startsWith(m.toLowerCase().split(' ')[0]))])); process.exit(1); }
// Every free bed is filled (the sheet leaves them to the player), so dorm head counts are what the sheet assumes.
for (const [i, f] of FORMATIONS.entries()) {
  const teams = withFreeBeds(i);
  const calc = (importedMorale?: Record<string, number>): any => calculateBase({ operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities: SHEET_FACILITIES,
    assignments: assignmentsOf(teams, roster), factoryProducts: f.products, loginInterval: 12, swapPolicy: 'onLogin', importedMorale });
  const r = calc();
  // Dusk parked below 12 (she loses no Morale in a full Sui Control Center) while Ling stays above it.
  const parked = calc({ ...Object.fromEntries(Object.values(teams).flat().map(n => [n, 20])), Dusk: 11 });
  const tp = (x: any) => { const o = x.roomDailyOutput.prod4 ?? {}; return ((o.goldSold ?? 0) * 500 + (o.extraLmd ?? 0)).toFixed(0); };
  console.log(`${f.name}: Worldly Plight ${r.resourcePools.worldlyPlight} (Dusk parked: ${parked.resourcePools.worldlyPlight}); prod4 LMD ${tp(r)} (Dusk parked: ${tp(parked)}) vs sheet ${f.sheet.prod4}`);
  for (const [room, sheet] of Object.entries(f.sheet)) {
    const o = r.roomDailyOutput[room] ?? {};
    const eff = r.rooms[room]?.facilityBreakdown?.effectiveProductivity;
    console.log(`  ${room}  sheet ${sheet}  ours: LMD ${((o.goldSold ?? 0) * 500 + (o.extraLmd ?? 0)).toFixed(0)} eff ${eff?.toFixed?.(2)} exp ${o.exp?.toFixed?.(1)} goldMade ${o.goldMade?.toFixed?.(2)} goldSold ${o.goldSold?.toFixed?.(2)} extraLmd ${o.extraLmd?.toFixed?.(0)}`);
  }
  console.log('  totals: LMD(green)', r.dailyGoldWorthGreen.toFixed(0), 'EXP', r.dailyExpGreen.toFixed(0), 'goldMade', r.dailyGoldMadeGreen.toFixed(2));
}
{
  const f = FORMATIONS[0];
  const r: any = calculateBase({ operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities: SHEET_FACILITIES,
    assignments: assignmentsOf(f.teams, roster), factoryProducts: f.products, loginInterval: 12, swapPolicy: 'onLogin' });
  for (const room of ['prod4', 'prod5']) {
    const b = r.rooms[room].facilityBreakdown;
    console.log(room, b.greyFormula, 'finalYellow', b.finalYellow, 'eff', b.effectiveProductivity);
    for (const l of b.lines) console.log('   ', l.included ? '+' : '-', l.operatorName, '|', l.skillName, '|', l.rawValue, '|', (l.reason ?? '').slice(0, 110));
  }
  console.log('ccEffects', JSON.stringify(r.ccEffects).slice(0, 700));
  console.log('pools', JSON.stringify(r.resourcePools).slice(0, 500));
}
