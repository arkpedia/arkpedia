import { activeBaseSkills } from './activeBaseSkills';
import { operatorDependency } from './dependencyClass';
import { snapshotTotals } from './snapshotMemo';
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

/** The shortlist each build ranked per room, kept beside its blocks so a refresh can start from it. */
const shortlistsOf = new WeakMap<Record<string, TeamBlock[]>, Record<string, string[]>>();
let builds = 0, buildMs = 0, scored = 0;
/** For benchmarks: how many block sets were built, the time they took and the placements they scored. */
export const teamBlocksStats = () => ({ builds, buildMs, scored });

/**
 * The best `top` teams for every work room, scored with the snapshot calculator inside `crew` (the rest of the
 * base as one crew staffs it), so cross-room effects -- Control Center bonuses, Worldly Plight, Perception --
 * count. Each room's candidates are the owned operators with a skill there at their actual promotion, cut to
 * the `shortlist` best alone, plus a few plain workers for rooms where anyone adds the base rate. With `known`
 * (a room's blocks from an earlier build) those teams are scored again in the new context beside the new
 * combinations, over the `shortlist` best of that build's own ranking rather than a fresh ranking of every
 * candidate, so a refresh keeps the strong teams a full build found at a fraction of its cost.
 */
export function teamBlocks(ctx: GenomeContext, crew: BaseAssignments, products: FactoryProducts, opts: { top?: number; shortlist?: number; maxCombos?: number; known?: Record<string, TeamBlock[]> } = {}): Record<string, TeamBlock[]> {
  const started = Date.now(); builds++;
  const top = opts.top ?? 8, shortlist = opts.shortlist ?? 14, maxCombos = opts.maxCombos ?? 2500;
  const w = ctx.weights ?? DEFAULT_WEIGHTS;
  const byName = new Map(ctx.base.operators.map(o => [o.name, o]));
  const owned = Object.keys(ctx.roster).filter(n => byName.has(n) && n !== 'Fiammetta' && !(ctx.lockedDorm ?? []).includes(n));
  // Remembered by content (snapshotMemo.ts): a rebuild after a move in one room scores that room's teams again
  // for nothing otherwise.
  const value = (a: BaseAssignments) => {
    scored++;
    const r = snapshotTotals(ctx.base, a, products, ctx.loginInterval);
    return r.lmd * w.lmd + r.exp * w.exp + r.goldMade * w.goldMade;
  };
  // A team placed in a room leaves wherever its members were in the reference crew.
  const placing = (room: string, names: string[], capacity: number): BaseAssignments => {
    const a: BaseAssignments = Object.fromEntries(Object.entries(crew).map(([id, slots]) => [id, (slots ?? []).map(s => s && names.includes(s.operatorName) ? null : s)]));
    a[room] = [...names.map(n => ({ operatorName: n, eliteLevel: ctx.roster[n].eliteLevel, level: ctx.roster[n].level })), ...Array(Math.max(0, capacity - names.length)).fill(null)];
    return a;
  };
  const blocks: Record<string, TeamBlock[]> = {};
  const shortlists: Record<string, string[]> = {};
  const knownShortlists = opts.known ? shortlistsOf.get(opts.known) : undefined;
  for (const f of ctx.base.facilities.filter(x => x.capacity > 0 && WORK_KINDS.includes(x.kind))) {
    const dependency = (n: string) => operatorDependency(byName.get(n)!, f.label, ctx.roster[n].eliteLevel, ctx.base.skillSlots, ctx.roster[n].level);
    const teamDependency = (names: string[]) => names.reduce((sum, n) => sum + dependency(n), 0);
    const ranked = () => {
      const skilled = owned.filter(n => activeBaseSkills(byName.get(n)!, f.label, ctx.roster[n].eliteLevel, ctx.base.skillSlots, ctx.roster[n].level).length > 0);
      const plain = f.kind === 'tradingPost' || f.kind === 'factory' ? owned.filter(n => !skilled.includes(n)).slice(0, 3) : [];
      const empty = value(placing(f.id, [], f.capacity));
      // Equal gains: the operator whose skills need the least from others first (docs/development/base-design-notes.md).
      return [...skilled, ...plain].map(n => ({ n, gain: value(placing(f.id, [n], f.capacity)) - empty })).sort((x, y) => y.gain - x.gain || dependency(x.n) - dependency(y.n) || x.n.localeCompare(y.n)).map(x => x.n);
    };
    // A refresh starts from the ranking its full build made (ranking every candidate alone costs as much as the
    // combinations); a full build ranks afresh.
    const alone = knownShortlists?.[f.id] ?? ranked();
    // Keep the room's combinations under maxCombos: a 5-place Control Center over 14 names is 2,002 teams.
    let list = alone.slice(0, shortlist);
    shortlists[f.id] = alone;
    const size = Math.min(f.capacity, list.length);
    while (list.length > size && combinations(list, size).length > maxCombos) list = list.slice(0, -1);
    const scored = (size ? combinations(list, size) : []).map(names => ({ room: f.id, names, value: value(placing(f.id, names, f.capacity)) }));

    // Smaller teams too, for rooms where a full one is not the best (a strong pair over a weak trio): over the whole
    // shortlist in rooms of up to three places (a pair is often two names that are weak alone, Bubble and Vulcan),
    // over its best eight in larger rooms.
    const smallFrom = size <= 3 ? list : list.slice(0, 8);
    for (let n = 1; n < size; n++) for (const names of combinations(smallFrom, n)) scored.push({ room: f.id, names, value: value(placing(f.id, names, f.capacity)) });
    const seen = new Set(scored.map(b => b.names.join('|')));
    for (const b of opts.known?.[f.id] ?? []) {
      if (seen.has(b.names.join('|')) || !b.names.every(n => owned.includes(n))) continue;
      seen.add(b.names.join('|'));
      scored.push({ room: f.id, names: b.names, value: value(placing(f.id, b.names, f.capacity)) });
    }
    blocks[f.id] = scored.sort((x, y) => y.value - x.value || teamDependency(x.names) - teamDependency(y.names) || x.names.length - y.names.length || x.names.join().localeCompare(y.names.join())).slice(0, top);
  }
  buildMs += Date.now() - started;
  shortlistsOf.set(blocks, shortlists);
  return blocks;
}
