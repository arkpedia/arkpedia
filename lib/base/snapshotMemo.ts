import { calculateBase } from './calculateBase';
import { settle } from './settle';
import type { SimulationBase } from './baseSimulation';
import type { BaseAssignments, FactoryProducts } from './baseTypes';

/** The snapshot calculator's three scored totals for one staffing: what one login collects, at full Morale. */
export interface SnapshotTotals { lmd: number; exp: number; goldMade: number }

/** A search asks the snapshot calculator the same question many times over: the annealer's proxy sums every
 * staffing change of a proposal, most of which the proposal left alone, and the team blocks rebuilt as the crews
 * change score the same placements again wherever the crew did not. The totals depend only on the staffing, the
 * products and the login interval for one base, so they are remembered by content, per base object; the memo is
 * emptied once it is large rather than evicted, which keeps it cheap. */
const memos = new WeakMap<object, Map<string, SnapshotTotals>>();
const MEMO_LIMIT = 40_000;
let hits = 0, misses = 0;

const slotKey = (s: BaseAssignments[string][number]) => s ? `${s.operatorName}/${s.eliteLevel}/${s.level ?? ''}/${s.manualValue ?? ''}` : '';
export function snapshotKey(assignments: BaseAssignments, products: FactoryProducts, loginInterval: number): string {
  const rooms = Object.keys(assignments).sort().flatMap(room => {
    const slots = (assignments[room] ?? []).map(slotKey);
    return slots.some(Boolean) ? [`${room}:${slots.join(',')}`] : [];
  });
  return `${loginInterval}|${Object.entries(products).sort().map(([f, p]) => `${f}=${p}`).join(',')}|${rooms.join(';')}`;
}

export function snapshotTotals(base: Omit<SimulationBase, 'facilities'> & Pick<SimulationBase, 'facilities'>, assignments: BaseAssignments, products: FactoryProducts, loginInterval: number): SnapshotTotals {
  let memo = memos.get(base);
  if (!memo) { memo = new Map(); memos.set(base, memo); }
  const key = snapshotKey(assignments, products, loginInterval);
  const known = memo.get(key);
  if (known) { hits++; return known; }
  misses++;
  const r = calculateBase({ ...base, assignments, factoryProducts: products, loginInterval, swapPolicy: 'onLogin' });
  const totals = { lmd: settle(r.dailyGoldWorthGreen), exp: settle(r.dailyExpGreen), goldMade: settle(r.dailyGoldMadeGreen) };
  if (memo.size >= MEMO_LIMIT) memo.clear();
  memo.set(key, totals);
  return totals;
}

/** For benchmarks: how often the memo answered. */
export const snapshotMemoStats = () => ({ hits, misses });
