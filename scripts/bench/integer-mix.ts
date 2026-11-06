/**
 * The integer version of the column-generation ceiling: from the setups rotationMix finds, choose at most three and
 * give each a whole number of logins, under the LP's Morale/beds/funding constraints, then simulate that rotation
 * exactly (the rest order is the planGenome rule: whoever just came off shift rests). This is the offline test of
 * whether a server-side setup generator could beat the 5-minute plan by the +0.5% bar.
 *
 *   npx tsx scripts/bench/integer-mix.ts <fixture.json> [more...] [--seconds 300 | --rounds 60] [--max-columns 20]
 *
 * The MIP is the master LP with m_s integer logins summing to a cycle L, binary z_s (m_s <= L z_s, sum z_s <= 3),
 * and the same operator, beds, sales and funding rows scaled by L. Its objective / L is the LP's funded total at
 * those shares; the score that counts is the simulator's on the built rotation.
 */
import fs from 'node:fs';
import path from 'node:path';
import loadHighs from 'highs';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { getFacilities } from '../../lib/base/baseConfig';
import { WORK_KINDS, type OwnedOperator } from '../../lib/base/baseOptimizer';
import { ownedBaseRoster } from '../../lib/base/optimizerRoster';
import { profileFromData, accountFromKrooster } from '../../lib/account-import/krooster';
import { optimizeAccountBase } from '../../lib/base/accountOptimizer';
import { calculateBase } from '../../lib/base/calculateBase';
import { simulateBase, type SimulationShift } from '../../lib/base/baseSimulation';
import { scoreOf, type GenomeContext } from '../../lib/base/planGenome';
import { totalsOf, rotationMix } from './staffingMip';
import type { BaseAssignments, FactoryProducts } from '../../lib/base/baseTypes';
import type { BaseOperator } from '../../lib/operators/operatorTypes';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import map from '../../data/game-account-map.json';

type Highs = { solve: (lp: string) => Promise<{ Status: string; ObjectiveValue: number; Columns: Record<string, { Primal: number }> }> };
const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : undefined; };
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const operators: BaseOperator[] = getAllOperators().filter(op => !/^Amiya \(/.test(op.name) && !op.isFuture).map(op => ({ name: op.name, rarity: op.rarity, faction: op.faction, class: op.class, branch: op.branch, baseSkills: op.baseSkills, ...(op.aliases?.length ? { aliases: op.aliases } : {}) }));
const known = new Set(operators.map(o => o.name));
const base = { operators, rosters: toBaseRosters(groups), skillSlots: slots as never, workshopRecipes: recipes as never };
const term = (c: number, v: string) => `${c >= 0 ? '+' : '-'} ${Math.abs(c).toFixed(6)} ${v}`;
const funded = (t: { exp: number; made: number; sold: number; lmd: number }) => t.exp + (t.sold > 0 ? t.lmd * Math.min(1, t.made / t.sold) : t.lmd);

async function main() {
  const solver = (await loadHighs()) as unknown as Highs;
  for (const file of files) {
    const profile = profileFromData(JSON.parse(fs.readFileSync(file, 'utf8')))!;
    const roster: Record<string, OwnedOperator> = ownedBaseRoster(accountFromKrooster(profile, map as never).record, known).roster;
    const loginInterval = 12;
    const result = optimizeAccountBase({ base, roster, snapshot: undefined, loginInterval, objective: 'balanced', externalGold: 0, compareLayouts: true, ...(flag('--seconds') ? { searchSeconds: flag('--seconds') } : { searchSeconds: 6, annealRounds: flag('--rounds') ?? 60 }), drones: true });
    const r = result.recommendations[0];
    const plan = r.plan;
    const products = r.products as FactoryProducts;
    const facilities = getFacilities(r.spots, r.levels);
    const ctx: GenomeContext = { base: { ...base, facilities }, roster, loginInterval, weights: { lmd: 1, exp: 1, goldMade: 500 }, sustainable: true, externalGold: 0, drones: true };
    const work = new Set(facilities.filter(f => f.capacity > 0 && WORK_KINDS.includes(f.kind)).map(f => f.id));
    const workShifts = plan.shifts.map(s => Object.fromEntries(Object.entries(s.assignments).filter(([id]) => work.has(id))));
    const dormRooms = facilities.filter(f => f.kind === 'dormitory' && f.capacity);
    const beds = dormRooms.reduce((sum, f) => sum + f.capacity, 0);
    const recovery = Math.max(...plan.shifts.map(s => Math.max(...Object.values(calculateBase({ ...ctx.base, assignments: s.assignments, factoryProducts: products, loginInterval, swapPolicy: 'onLogin' }).dormitoryRecoveryByFacility).flat().map(x => x.base + x.bonus), 0)));
    const refilled = new Set(plan.shifts.flatMap(s => s.refill ?? []));
    const mixed = await rotationMix(ctx, products, workShifts, { recovery, beds, refilled, iterations: 12, price: true });
    // The MIP's pool: the plan's own three work shifts first (the LP may give them zero share, and they are the
    // feasible fallback), then the LP's positive columns by share.
    const seen = new Set<string>();
    const pool = [...workShifts, ...mixed.mix.slice().sort((a, b) => b.share - a.share).map(m => m.assignments)]
      .filter(a => { const k = JSON.stringify(a); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, flag('--max-columns') ?? 20);
    const columns = pool.map(a => {
      const totals = totalsOf(ctx, a, products);
      const calc = calculateBase({ ...ctx.base, assignments: a, factoryProducts: products, loginInterval, swapPolicy: 'onLogin' });
      const drains: Record<string, number> = {};
      for (const f of facilities.filter(f => f.capacity > 0 && WORK_KINDS.includes(f.kind))) for (const slot of a[f.id] ?? []) if (slot) drains[slot.operatorName] = Math.max(0, calc.rooms[f.id]?.perOperatorMorale?.[slot.operatorName] ?? calc.rooms[f.id]?.combinedMoraleRate ?? 0);
      const restOf = (n: string, d: number) => refilled.has(n) ? 0 : d / recovery;
      const restTotal = Object.entries(drains).reduce((sum, [n, d]) => sum + restOf(n, d), 0);
      return { assignments: a, totals, drains, restOf, restTotal, funded: funded(totals) };
    });
    const ops = [...new Set(columns.flatMap(c => Object.keys(c.drains)))];
    const box = (m: string, c: typeof columns[number], L: number, s: number) => {
      const parts = [term(c.totals.exp, m)];
      const u = c.totals.sold > 0 ? `u${s}` : null;
      if (u) parts.push(term(c.totals.lmd / c.totals.sold * L, u)); else parts.push(term(c.totals.lmd, m));
      return parts.join(' ');
    };
    let best = { score: scoreOf(plan.simulation, ctx), label: 'plan' };
    console.log(`${path.basename(file).replace(/\.json$/, '')}: plan ${best.score.toFixed(0)}, LP mix ${mixed.value.toFixed(0)} from ${mixed.columns} columns`);
    if (process.argv.includes('--debug')) {
      const L = 3;
      console.log(`  debug recovery ${recovery.toFixed(3)}, beds ${beds}, refilled ${[...refilled].join(',') || 'none'}`);
      console.log('  debug plan drains: ' + columns.slice(0, 3).map(c => Object.entries(c.drains).slice(0, 4).map(([n, d]) => `${n}:${d.toFixed(2)}/${c.restOf(n, d).toFixed(2)}`).join(' ')).join(' | '));
      const planOps = ops.map(n => ({ n, lhs: columns.slice(0, 3).reduce((sum, c, s) => sum + (n in c.drains ? (1 + c.restOf(n, c.drains[n])) * 1 : 0), 0) })).filter(x => x.lhs > L + 1e-6).sort((a, b) => b.lhs - a.lhs);
      console.log(`  debug plan-mix operator violations: ${planOps.length}` + (planOps.length ? ' e.g. ' + planOps.slice(0, 5).map(x => `${x.n} ${x.lhs.toFixed(2)}`).join(', ') : ''));
      const rows = {
        time: ` time: ${columns.map((_, s) => `m${s}`).join(' + ')} = ${L}`,
        ops: ops.map((n, k) => ` op${k}: ${columns.flatMap((c, s) => n in c.drains ? [term(1 + c.restOf(n, c.drains[n]), `m${s}`)] : []).join(' ')} <= ${L}`),
        beds: ` beds: ${columns.map((c, s) => term(c.restTotal, `m${s}`)).join(' ')} <= ${(beds * L).toFixed(6)}`,
        fund: ` fund: ${columns.flatMap((c, s) => c.totals.sold > 0 ? [`+ ${L.toFixed(6)} u${s}`] : []).join(' ') || '0 u0'} ${columns.map((c, s) => term(-c.totals.made, `m${s}`)).join(' ')} <= 0`,
        card: ` card: ${columns.map((_, s) => `z${s}`).join(' + ')} <= 3`,
        sells: columns.flatMap((c, s) => c.totals.sold > 0 ? [` sell${s}: ${term(L, `u${s}`)} ${term(-c.totals.sold, `m${s}`)} <= 0`] : []),
        caps: columns.map((_, s) => ` cap${s}: m${s} - ${L} z${s} <= 0`),
      };
      const build = (omit: string[]) => ['Maximize', ` obj: ${columns.map((c, s) => box(`m${s}`, c, L, s)).join(' ')}`, 'Subject To',
        rows.time, ...(omit.includes('ops') ? [] : rows.ops), ...(omit.includes('beds') ? [] : [rows.beds]),
        ...rows.sells, ...(omit.includes('fund') ? [] : [rows.fund]), ...(omit.includes('card') ? [] : [rows.card]), ...rows.caps,
        'Binary', ` ${columns.map((_, s) => `z${s}`).join(' ')}`, 'General', ` ${columns.map((_, s) => `m${s}`).join(' ')}`,
        'Bounds', ...columns.flatMap((c, s) => c.totals.sold > 0 ? [` u${s} >= 0`] : []), 'End'].join('\n');
      for (const omit of [[], ['beds'], ['ops'], ['card'], ['fund'], ['ops', 'beds', 'card', 'fund']]) {
        const res = await solver.solve(build(omit as string[]));
        console.log(`  debug L=3 omit [${omit.join(',') || 'nothing'}]: ${res.Status}`);
      }
      return;
    }
    for (const L of [3, 4, 5, 6, 8, 10, 12]) {
      const lines: string[] = ['Maximize', ` obj: ${columns.map((c, s) => box(`m${s}`, c, L, s)).join(' ')}`, 'Subject To',
        ` time: ${columns.map((_, s) => `m${s}`).join(' + ')} = ${L}`,
        ...ops.map((n, k) => ` op${k}: ${columns.flatMap((c, s) => n in c.drains ? [term(1 + c.restOf(n, c.drains[n]), `m${s}`)] : []).join(' ')} <= ${L}`),
        ` beds: ${columns.map((c, s) => term(c.restTotal, `m${s}`)).join(' ')} <= ${(beds * L).toFixed(6)}`,
        ...columns.flatMap((c, s) => c.totals.sold > 0 ? [` sell${s}: ${term(L, `u${s}`)} ${term(-c.totals.sold, `m${s}`)} <= 0`] : []),
        ` fund: ${columns.flatMap((c, s) => c.totals.sold > 0 ? [`+ ${L.toFixed(6)} u${s}`] : []).join(' ') || '0 u0'} ${columns.map((c, s) => term(-c.totals.made, `m${s}`)).join(' ')} <= 0`,
        ` card: ${columns.map((_, s) => `z${s}`).join(' + ')} <= 3`,
        ...columns.map((_, s) => ` cap${s}: m${s} - ${L} z${s} <= 0`),
        'Binary', ` ${columns.map((_, s) => `z${s}`).join(' ')}`,
        'General', ` ${columns.map((_, s) => `m${s}`).join(' ')}`,
        'Bounds', ...columns.flatMap((c, s) => c.totals.sold > 0 ? [` u${s} >= 0`] : []), 'End'];
      let res: Awaited<ReturnType<Highs['solve']>>;
      try { res = await solver.solve(lines.join('\n')); } catch (e) { console.log(`  L=${L}: solver error ${(e as Error).message}`); continue; }
      if (res.Status !== 'Optimal') { console.log(`  L=${L}: ${res.Status}`); continue; }
      const chosen = columns.map((c, s) => ({ c, m: Math.round(res.Columns[`m${s}`]?.Primal ?? 0) })).filter(x => x.m > 0);
      const mipValue = res.ObjectiveValue / L;
      // Simulate the rotation, trying each order of the chosen setups. The rest rule is decode()'s: whoever came off
      // shift rests, Fiammetta keeps the head bed if the plan had a refill core.
      const everyone = new Set(chosen.flatMap(({ c }) => Object.values(c.assignments).flatMap(x => (x ?? []).flatMap(v => v ? [v.operatorName] : []))));
      const parked = plan.initialMorale ?? {};
      let bestHere = { score: -Infinity, order: [] as number[] };
      const perms = (xs: number[]): number[][] => xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map(p => [x, ...p]));
      for (const order of perms(chosen.map((_, i) => i))) {
        const shifts: SimulationShift[] = order.map((ci, step) => {
          const c = chosen[ci].c, m = chosen[ci].m;
          const prev = chosen[order[(step + order.length - 1) % order.length]].c;
          const working = new Set(Object.values(c.assignments).flatMap(x => (x ?? []).flatMap(v => v ? [v.operatorName] : [])));
          const justWorked = new Set(Object.values(prev.assignments).flatMap(x => (x ?? []).flatMap(v => v ? [v.operatorName] : [])));
          const resting = [...everyone].filter(n => !working.has(n) && !(n in parked) && justWorked.has(n));
          const dorm: BaseAssignments = {};
          const q = [...resting];
          for (const d of dormRooms) dorm[d.id] = Array.from({ length: d.capacity }, () => q.length ? (() => { const n = q.shift()!; return { operatorName: n, eliteLevel: roster[n].eliteLevel, level: roster[n].level }; })() : null);
          const core = plan.shifts[0].refill ?? [];
          return { assignments: { ...c.assignments, ...dorm }, factoryProducts: products, hours: m * loginInterval, ...(core.length ? { refill: core.filter(n => everyone.has(n)) } : {}) };
        });
        const sim = simulateBase({ base: ctx.base, shifts, loginInterval, initialMorale: plan.initialMorale, drones: true, refillPolicy: plan.refillPolicy as never, lean: true, droneWeights: ctx.weights, droneFunding: { externalGold: 0 } });
        if (!sim.periodic || sim.events.some(e => e.kind === 'exhausted')) continue;
        const value = scoreOf(sim, ctx);
        if (value > bestHere.score) bestHere = { score: value, order };
      }
      const delta = bestHere.score > -Infinity ? (bestHere.score - best.score) / best.score * 100 : NaN;
      console.log(`  L=${L}: ${chosen.map(x => `${x.m} logins`).join(' + ')}, MIP ${mipValue.toFixed(0)}, simulated ${bestHere.score > -Infinity ? bestHere.score.toFixed(0) : 'exhausts'} ${Number.isFinite(delta) ? `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%` : ''}`);
      if (bestHere.score > best.score) best = { score: bestHere.score, label: `${L}-login rotation` };
    }
    console.log(`  best: ${best.label} ${best.score.toFixed(0)} ${((best.score - scoreOf(plan.simulation, ctx)) / scoreOf(plan.simulation, ctx) * 100).toFixed(2)}%`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
