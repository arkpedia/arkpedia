/** Funded, like-for-like account benchmarks. No reference placements are passed to the optimizer.
 * Usage: node --import tsx scripts/bench/account-acceptance.ts [tiny,small,mid,maxed,sheet252,sheet342] [seconds=60] [output.json]
 * BASELINE_JSON=file also requires each selected tier to match its prior score on the same data revision.
 * REQUIRE_REFERENCE_MATCH=1 fails when an answer-sheet target is not reached. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { optimizeAccountBase, type AccountOptimizerInput } from '../../lib/base/accountOptimizer';
import { sustainableOutput, WORK_KINDS, type OwnedOperator } from '../../lib/base/baseOptimizer';
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import { simulateBase } from '../../lib/base/baseSimulation';
import { evaluate, type Genome } from '../../lib/base/planGenome';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { FORMATIONS, SHEET_SPOTS, SHEET_LEVELS, SHEET_FACILITIES, assignmentsOf, everyoneMaxed } from './sheet-342';
import { SHEET252_NAMES, SHEET252_FACILITIES, sheet252Shifts } from './sheet-252';

const seconds = Number(process.argv[3] ?? 60);
const requested = (process.argv[2] ?? 'tiny,small,mid,maxed,sheet252,sheet342').split(',');
const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name) && !op.isFuture);
const maxed = everyoneMaxed(operators);
const pick = (rarity: number, count: number) => {
  const names = operators.filter(op => op.rarity === rarity).map(op => op.name).sort();
  return names.filter((_, index) => index % Math.max(1, Math.floor(names.length / count)) === 0).slice(0, count);
};
const rosterOf = (names: string[], eliteLevel: OwnedOperator['eliteLevel'], level: number) => Object.fromEntries(names.map(name => [name, { eliteLevel, level }]));
const sheet342Names = [...new Set(FORMATIONS.flatMap(formation => Object.values(formation.teams).flat()).concat('Fiammetta'))];
const rosters: Record<string, Record<string, OwnedOperator>> = {
  tiny: rosterOf([...pick(6, 3), ...pick(5, 6), ...pick(4, 6)], 'Base', 30),
  small: rosterOf([...pick(6, 10), ...pick(5, 15), ...pick(4, 15)], 'Elite 1', 60),
  mid: Object.fromEntries(operators.map((op, index) => [op.name, (op.rarity ?? 0) < 3
    ? { eliteLevel: 'Base', level: 30 }
    : index % 20 === 0 ? { eliteLevel: 'Elite 2', level: 60 } : { eliteLevel: 'Elite 1', level: 50 }])),
  maxed,
  sheet252: Object.fromEntries(SHEET252_NAMES.map(name => [name, maxed[name]])),
  sheet342: Object.fromEntries(sheet342Names.map(name => [name, maxed[name]])),
};
const base = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes };
const dataRevision: string = JSON.parse(fs.readFileSync('.cache/data-source.json', 'utf8')).revision;
const report = {
  source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), dataRevision, seconds,
  implementationSha256: createHash('sha256').update(fs.readFileSync('lib/base/annealBase.ts')).update(fs.readFileSync('lib/base/planGenome.ts')).update(fs.readFileSync('lib/base/accountOptimizer.ts')).digest('hex'),
  rows: [] as { tier: string; operators: number; mode: string; layout: string; score: number; seconds: number; firstPlanSeconds: number; evaluations: number; target?: number; referenceExhaustions?: number }[],
};
for (const tier of requested) {
  assert.ok(rosters[tier], `unknown tier: ${tier}`);
  assert.ok(Object.values(rosters[tier]).every(Boolean), `${tier} references an operator absent from this catalogue`);
  const reference = tier.startsWith('sheet');
  const snapshot = tier === 'sheet342' ? { productionSpots: SHEET_SPOTS, facilityLevels: SHEET_LEVELS }
    : tier === 'sheet252' ? { productionSpots: presetSpots('2-5-2-right'), facilityLevels: presetLevels('2-5-2-right') } : undefined;
  const formations = reference && process.env.FORMATIONS !== '0';
  const input: AccountOptimizerInput = { base, roster: rosters[tier], snapshot: snapshot as AccountOptimizerInput['snapshot'],
    loginInterval: reference ? 8 : 12, objective: 'balanced', externalGold: 0, drones: true, compareLayouts: !reference, formations, searchSeconds: seconds };
  const start = Date.now(); let firstPlanSeconds = 0;
  const result = optimizeAccountBase(input, (_done, _total, _label, partial) => {
    if (!firstPlanSeconds && partial?.recommendations.length) firstPlanSeconds = (Date.now() - start) / 1000;
  });
  const elapsed = (Date.now() - start) / 1000;
  const best = result.recommendations[0];
  assert.ok(best, `${tier}: no result`);
  assert.ok(best.plan.simulation.periodic, `${tier}: nonrepeating plan`);
  assert.equal(best.plan.simulation.events.filter(event => event.kind === 'exhausted').length, 0, `${tier}: exhaustion`);
  assert.ok(elapsed < seconds + 10, `${tier}: ${elapsed.toFixed(1)} s exceeds its budget`);
  const facilities = getFacilities(best.spots, best.levels);
  for (const shift of best.plan.shifts) {
    const names = Object.values(shift.assignments).flatMap(staff => (staff ?? []).flatMap(slot => slot ? [slot.operatorName] : []));
    assert.equal(new Set(names).size, names.length, `${tier}: double placement`);
    for (const name of names) assert.ok(input.roster[name], `${tier}: unowned ${name}`);
    for (const room of facilities) assert.ok((shift.assignments[room.id] ?? []).filter(Boolean).length <= room.capacity, `${tier}: ${room.id} over capacity`);
  }
  const funded = sustainableOutput(best.plan.simulation.perDay, 0);
  assert.ok(Math.abs(best.score - funded.lmd - best.plan.simulation.perDay.exp) < 1e-6, `${tier}: inconsistent funded score`);
  const row: typeof report.rows[number] = { tier, operators: Object.keys(input.roster).length, mode: formations ? 'formations' : 'main',
    layout: best.label, score: best.score, seconds: elapsed, firstPlanSeconds, evaluations: result.searched };
  if (tier === 'sheet342') {
    const rooms = SHEET_FACILITIES.filter(room => room.capacity > 0 && WORK_KINDS.includes(room.kind)).map(room => room.id);
    // The previously established feasible interpretation of the sheet: its three
    // formations, four full-time refill targets and the simulator's normal dorm seating.
    const genome: Genome = { steps: 3, k: 1, crews: FORMATIONS.map(formation => assignmentsOf(Object.fromEntries(rooms.map(room =>
      [room, (formation.teams[room] ?? []).filter(name => name !== 'Fiammetta')])), input.roster)),
    assign: Object.fromEntries(rooms.map(room => [room, [0, 1, 2]])), core: ['Shamare', 'Bibeak', 'Tequila', 'Proviso'],
    parked: {}, products: FORMATIONS[0].products, fillBeds: true, restAll: true, refillLowest: true };
    const target = evaluate(genome, { ...input, base: { ...base, facilities: SHEET_FACILITIES }, sustainable: true });
    assert.ok(target.sim.periodic && !target.sim.events.some(event => event.kind === 'exhausted'), 'reference fixture is no longer feasible');
    row.target = target.value; row.referenceExhaustions = 0;
  } else if (tier === 'sheet252') {
    const targets = (['rotation', 'lowest'] as const).map(refillPolicy => simulateBase({ base: { ...base, facilities: SHEET252_FACILITIES },
      shifts: sheet252Shifts(input.roster), loginInterval: 8, drones: true, droneFunding: { externalGold: 0 }, refillPolicy }));
    targets.sort((a, b) => sustainableOutput(b.perDay, 0).lmd + b.perDay.exp - sustainableOutput(a.perDay, 0).lmd - a.perDay.exp);
    row.target = sustainableOutput(targets[0].perDay, 0).lmd + targets[0].perDay.exp;
    row.referenceExhaustions = targets[0].events.filter(event => event.kind === 'exhausted').length;
  }
  report.rows.push(row);
  if (process.argv[4]) fs.writeFileSync(process.argv[4], JSON.stringify(report, null, 2) + '\n');
  console.log(`${tier}: ${row.layout}, funded ${row.score.toFixed(0)}${row.target ? ` / reference ${row.target.toFixed(0)} (${(100 * row.score / row.target).toFixed(1)}%)` : ''}, ${elapsed.toFixed(1)} s, first plan ${firstPlanSeconds.toFixed(1)} s; repeating, no exhaustion or duplicate placements`);
}
if (process.env.BASELINE_JSON) {
  const baseline = JSON.parse(fs.readFileSync(process.env.BASELINE_JSON, 'utf8')) as typeof report;
  assert.equal(baseline.dataRevision, report.dataRevision, 'baseline uses different game records');
  for (const row of report.rows) {
    const old = baseline.rows.find(candidate => candidate.tier === row.tier && candidate.mode === row.mode);
    assert.ok(old && row.score >= old.score - 1e-6, `${row.tier}: regression against baseline ${old?.score}`);
  }
}
if (process.env.REQUIRE_REFERENCE_MATCH === '1') for (const row of report.rows) {
  if (row.target) assert.ok(row.score >= row.target, `${row.tier}: the reference remains ahead`);
}
