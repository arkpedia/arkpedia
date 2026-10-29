import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { calculateBase } from '../../lib/base/calculateBase';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { FORMATIONS, SHEET_FACILITIES, assignmentsOf, everyoneMaxed } from './sheet-342';

const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name));
const roster = everyoneMaxed(operators);
const names = new Set(operators.map(o => o.name));
const missing = new Set<string>();
for (const f of FORMATIONS) for (const t of Object.values(f.teams)) for (const n of t) if (!names.has(n)) missing.add(n);
if (missing.size) { console.log('MISSING NAMES', [...missing].map(m => [m, [...names].filter(n => n.toLowerCase().startsWith(m.toLowerCase().split(' ')[0]))])); process.exit(1); }
for (const f of FORMATIONS) {
  const r: any = calculateBase({ operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities: SHEET_FACILITIES,
    assignments: assignmentsOf(f.teams, roster), factoryProducts: f.products, loginInterval: 12, swapPolicy: 'onLogin' });
  console.log(f.name);
  for (const [room, sheet] of Object.entries(f.sheet)) {
    const o = r.roomDailyOutput[room] ?? {};
    const eff = r.rooms[room]?.facilityBreakdown?.effectiveProductivity;
    console.log(`  ${room}  sheet ${sheet}  ours: eff ${eff?.toFixed?.(2)} exp ${o.exp?.toFixed?.(1)} goldMade ${o.goldMade?.toFixed?.(2)} goldSold ${o.goldSold?.toFixed?.(2)} extraLmd ${o.extraLmd?.toFixed?.(0)}`);
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
