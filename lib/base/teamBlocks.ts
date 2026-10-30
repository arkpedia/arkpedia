import { calculateBase } from './calculateBase';
import { activeBaseSkills } from './activeBaseSkills';
import { DEFAULT_WEIGHTS, WORK_KINDS } from './baseOptimizer';
import type { GenomeContext } from './planGenome';
import type { BaseAssignments, FactoryProducts } from './baseTypes';

/** One room's whole team, as a single move for the search: synergies only pay with the full set (Shamare,
 * Bibeak and Tequila; Proviso and Mr. Nothing; a Sui Control Center), which single swaps never reach. */
export interface TeamBlock { room: string; names: string[]; value: number }

function combinations<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const pick = (start: number, chosen: T[]) => {
    if (chosen.length === k) { out.push([...chosen]); return; }
    for (let i = start; i < arr.length; i++) { chosen.push(arr[i]); pick(i + 1, chosen); chosen.pop(); }
  };
  pick(0, []);
  return out;
}

/**
 * The best `top` teams for every work room, scored with the snapshot calculator inside `crew` (the rest of the
 * base as one crew staffs it), so cross-room effects -- Control Center bonuses, Worldly Plight, Perception --
 * count. Each room's candidates are the owned operators with a skill there at their actual promotion, cut to
 * the `shortlist` best alone, plus a few plain workers for rooms where anyone adds the base rate.
 */
export function teamBlocks(ctx: GenomeContext, crew: BaseAssignments, products: FactoryProducts, opts: { top?: number; shortlist?: number; maxCombos?: number } = {}): Record<string, TeamBlock[]> {
  const top = opts.top ?? 8, shortlist = opts.shortlist ?? 14, maxCombos = opts.maxCombos ?? 2500;
  const w = ctx.weights ?? DEFAULT_WEIGHTS;
  const byName = new Map(ctx.base.operators.map(o => [o.name, o]));
  const owned = Object.keys(ctx.roster).filter(n => byName.has(n) && n !== 'Fiammetta' && !(ctx.lockedDorm ?? []).includes(n));
  const value = (a: BaseAssignments) => {
    const r = calculateBase({ ...ctx.base, assignments: a, factoryProducts: products, loginInterval: ctx.loginInterval, swapPolicy: 'onLogin' });
    return r.dailyGoldWorthGreen * w.lmd + r.dailyExpGreen * w.exp + r.dailyGoldMadeGreen * w.goldMade;
  };
  // A team placed in a room leaves wherever its members were in the reference crew.
  const placing = (room: string, names: string[], capacity: number): BaseAssignments => {
    const a: BaseAssignments = Object.fromEntries(Object.entries(crew).map(([id, slots]) => [id, (slots ?? []).map(s => s && names.includes(s.operatorName) ? null : s)]));
    a[room] = [...names.map(n => ({ operatorName: n, eliteLevel: ctx.roster[n].eliteLevel, level: ctx.roster[n].level })), ...Array(Math.max(0, capacity - names.length)).fill(null)];
    return a;
  };
  const blocks: Record<string, TeamBlock[]> = {};
  for (const f of ctx.base.facilities.filter(x => x.capacity > 0 && WORK_KINDS.includes(x.kind))) {
    const skilled = owned.filter(n => activeBaseSkills(byName.get(n)!, f.label, ctx.roster[n].eliteLevel, ctx.base.skillSlots, ctx.roster[n].level).length > 0);
    const plain = f.kind === 'tradingPost' || f.kind === 'factory' ? owned.filter(n => !skilled.includes(n)).slice(0, 3) : [];
    const empty = value(placing(f.id, [], f.capacity));
    const alone = [...skilled, ...plain].map(n => ({ n, gain: value(placing(f.id, [n], f.capacity)) - empty })).sort((x, y) => y.gain - x.gain);
    // Keep the room's combinations under maxCombos: a 5-place Control Center over 14 names is 2,002 teams.
    let list = alone.slice(0, shortlist).map(x => x.n);
    const size = Math.min(f.capacity, list.length);
    while (list.length > size && combinations(list, size).length > maxCombos) list = list.slice(0, -1);
    const scored = (size ? combinations(list, size) : []).map(names => ({ room: f.id, names, value: value(placing(f.id, names, f.capacity)) }));
    // Smaller teams too, for rooms where a full one is not the best (a strong pair over a weak trio).
    for (let n = 1; n < size; n++) for (const names of combinations(list.slice(0, Math.min(list.length, 8)), n)) scored.push({ room: f.id, names, value: value(placing(f.id, names, f.capacity)) });
    blocks[f.id] = scored.sort((x, y) => y.value - x.value).slice(0, top);
  }
  return blocks;
}
