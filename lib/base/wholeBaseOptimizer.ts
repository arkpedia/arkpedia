import { evalTradingPost, evalFactory, TP_CANDIDATES, FACTORY_CANDIDATES, combinations, TpResult, FactoryResult, DynamicContextOverrides } from './optimizerLogic';

/** These operators are needed in CC/Office/Dormitory (support rooms, NOT
 * one of the 6 production rooms) to unlock bonuses OTHER placed operators
 * depend on. Placing them costs a support-room slot, not a production
 * slot, so they're placed unconditionally and removed from the
 * production candidate pool so they can't be double-booked. */
const CC_OFFICE_DORM_ENABLERS: { name: string; room: string; unlocks: string }[] = [
  { name: 'Gnosis', room: 'Control Center', unlocks: 'Karlan Trade Trading Post bonus' },
  { name: 'Kirin R Yato', room: 'Control Center', unlocks: 'Felvine generation (Terra Research Commission)' },
  { name: 'Rathalos S Noir Corne', room: 'Control Center', unlocks: 'Felvine generation (Terra Research Commission)' },
  { name: 'Mulberry', room: 'Office', unlocks: 'Worldly Plight generation (Mr. Nothing, Shu, Jieyun, etc.)' },
  { name: 'Senshi', room: 'Dormitory', unlocks: 'Monster Meal generation (Laios, Marcille)' },
];

/** Gummy is different -- her ONLY use here is unlocking Leto's Factory
 * bonus, but she has to occupy an actual TRADING POST slot (one of the 6
 * production rooms) to do it, which has a real opportunity cost. This
 * gets decided by comparing actual total value with and without her,
 * not assumed for free. */
const GUMMY = 'Gummy';

function excludeNames(candidates: Record<string, unknown>, names: string[]): string[] {
  const excludeSet = new Set(names);
  return Object.keys(candidates).filter((id) => !excludeSet.has(id));
}

function fullySortedTp(ids: string[], overrides?: DynamicContextOverrides): TpResult[] {
  const results: TpResult[] = [];
  for (const combo of combinations(ids, 3)) {
    const r = evalTradingPost(combo, overrides);
    if (r) results.push(r);
  }
  results.sort((a, b) => b.dailyLmd - a.dailyLmd);
  return results;
}

function fullySortedFactory(ids: string[], product: 'Battle Records' | 'Precious Metals', overrides?: DynamicContextOverrides): FactoryResult[] {
  const results: FactoryResult[] = [];
  for (let r = 1; r <= 3; r++) {
    for (const combo of combinations(ids, r)) {
      const res = evalFactory(combo, product, overrides);
      if (res) results.push(res);
    }
  }
  results.sort((a, b) => b.dailyOutput - a.dailyOutput);
  return results;
}

function firstAvailable<T extends { combo: string[] }>(ranked: T[], used: Set<string>): T | null {
  for (const r of ranked) {
    if (r.combo.every((op) => !used.has(op))) return r;
  }
  return null;
}

interface RoomSlot {
  label: string;
  kind: 'tp' | 'goldFactory' | 'expFactory';
  combo: string[] | null;
  value: number;
}

export interface WholeBaseResult {
  strategy: 'balanced' | 'total';
  rooms: { label: string; operators: string[]; value: number; unit: string }[];
  totals: { lmd: number; gold: number; exp: number };
  supportPlacements: { name: string; room: string; unlocks: string }[];
  gummyPlaced: boolean;
  verifiedContext: DynamicContextOverrides;
}

function allocate(
  strategy: 'balanced' | 'total',
  tpIds: string[],
  goldIds: string[],
  expIds: string[],
  overrides: DynamicContextOverrides
): { slots: RoomSlot[]; used: Set<string> } {
  const used = new Set<string>();
  const tpRanked = fullySortedTp(tpIds, overrides);
  const goldRanked = fullySortedFactory(goldIds, 'Precious Metals', overrides);
  const expRanked = fullySortedFactory(expIds, 'Battle Records', overrides);
  const slots: RoomSlot[] = [
    { label: 'Trading Post 1', kind: 'tp', combo: null, value: 0 },
    { label: 'Trading Post 2', kind: 'tp', combo: null, value: 0 },
    { label: 'Factory (Precious Metals) 1', kind: 'goldFactory', combo: null, value: 0 },
    { label: 'Factory (Precious Metals) 2', kind: 'goldFactory', combo: null, value: 0 },
    { label: 'Factory (Battle Records) 1', kind: 'expFactory', combo: null, value: 0 },
    { label: 'Factory (Battle Records) 2', kind: 'expFactory', combo: null, value: 0 },
  ];
  const bestSingle = { lmd: tpRanked[0]?.dailyLmd ?? 1, gold: goldRanked[0]?.dailyOutput ?? 1, exp: (expRanked[0]?.dailyOutput ?? 1) * 1000 };

  function fillOneSlot(kind: RoomSlot['kind']) {
    const slot = slots.find((s) => s.kind === kind && s.combo === null);
    if (!slot) return;
    if (kind === 'tp') {
      const r = firstAvailable(tpRanked, used);
      if (r) {
        slot.combo = r.combo;
        slot.value = r.dailyLmd;
        r.combo.forEach((op) => used.add(op));
      }
    } else {
      const ranked = kind === 'goldFactory' ? goldRanked : expRanked;
      const r = firstAvailable(ranked, used);
      if (r) {
        slot.combo = r.combo;
        slot.value = kind === 'expFactory' ? r.dailyOutput * 1000 : r.dailyOutput;
        r.combo.forEach((op) => used.add(op));
      }
    }
  }

  if (strategy === 'total') {
    const order: RoomSlot['kind'][] = ['tp', 'goldFactory', 'expFactory', 'tp', 'goldFactory', 'expFactory'];
    for (const kind of order) fillOneSlot(kind);
  } else {
    for (let step = 0; step < 6; step++) {
      const lmdSoFar = slots.filter((s) => s.kind === 'tp').reduce((sum, s) => sum + s.value, 0);
      const goldSoFar = slots.filter((s) => s.kind === 'goldFactory').reduce((sum, s) => sum + s.value, 0);
      const expSoFar = slots.filter((s) => s.kind === 'expFactory').reduce((sum, s) => sum + s.value, 0);
      const options: { kind: RoomSlot['kind']; frac: number }[] = [];
      if (slots.some((s) => s.kind === 'tp' && s.combo === null)) options.push({ kind: 'tp', frac: lmdSoFar / (bestSingle.lmd * 2) });
      if (slots.some((s) => s.kind === 'goldFactory' && s.combo === null)) options.push({ kind: 'goldFactory', frac: goldSoFar / (bestSingle.gold * 2) });
      if (slots.some((s) => s.kind === 'expFactory' && s.combo === null)) options.push({ kind: 'expFactory', frac: expSoFar / (bestSingle.exp * 2) });
      if (options.length === 0) break;
      options.sort((a, b) => a.frac - b.frac);
      fillOneSlot(options[0].kind);
    }
  }
  return { slots, used };
}

function totalValue(slots: RoomSlot[]): number {
  return slots.reduce((sum, s) => sum + (s.kind === 'goldFactory' ? s.value * 400 : s.value), 0);
}

function runStrategy(strategy: 'balanced' | 'total'): WholeBaseResult {
  const enablerNames = CC_OFFICE_DORM_ENABLERS.map((e) => e.name);
  const tpIdsNoGummy = excludeNames(TP_CANDIDATES, enablerNames);
  const goldIds = excludeNames(FACTORY_CANDIDATES, enablerNames);
  const expIds = excludeNames(FACTORY_CANDIDATES, enablerNames);

  const contextWithoutGummy: DynamicContextOverrides = { worldlyPlight: 20, felvineTotal: 8 + 4, monsterMealTotal: 5, gummyInTradingPost: false };
  const contextWithGummy: DynamicContextOverrides = { ...contextWithoutGummy, gummyInTradingPost: true };

  const withoutGummy = allocate(strategy, tpIdsNoGummy, goldIds, expIds, contextWithoutGummy);

  const gummyPairResults: TpResult[] = [];
  for (const pair of combinations(tpIdsNoGummy, 2)) {
    const r = evalTradingPost([GUMMY, ...pair], contextWithGummy);
    if (r) gummyPairResults.push(r);
  }
  gummyPairResults.sort((a, b) => b.dailyLmd - a.dailyLmd);
  const bestGummyRoom = gummyPairResults[0] ?? null;

  let withGummy: { slots: RoomSlot[]; used: Set<string> } | null = null;
  if (bestGummyRoom) {
    const preUsed = new Set(bestGummyRoom.combo);
    const remainingTpIds = tpIdsNoGummy.filter((id) => !preUsed.has(id));
    const rest = allocate(strategy, remainingTpIds, goldIds, expIds, contextWithGummy);
    const slots: RoomSlot[] = [{ label: 'Trading Post 1 (with Gummy)', kind: 'tp', combo: bestGummyRoom.combo, value: bestGummyRoom.dailyLmd }];
    const restTp = rest.slots.filter((s) => s.kind === 'tp' && s.combo !== null);
    if (restTp[0]) slots.push({ ...restTp[0], label: 'Trading Post 2' });
    slots.push(...rest.slots.filter((s) => s.kind !== 'tp'));
    const used = new Set([...preUsed, ...rest.used]);
    withGummy = { slots, used };
  }

  const chosen = withGummy && totalValue(withGummy.slots) > totalValue(withoutGummy.slots) ? withGummy : withoutGummy;
  const gummyPlaced = chosen === withGummy;
  const finalContext = gummyPlaced ? contextWithGummy : contextWithoutGummy;

  const totals = {
    lmd: chosen.slots.filter((s) => s.kind === 'tp').reduce((sum, s) => sum + s.value, 0),
    gold: chosen.slots.filter((s) => s.kind === 'goldFactory').reduce((sum, s) => sum + s.value, 0),
    exp: chosen.slots.filter((s) => s.kind === 'expFactory').reduce((sum, s) => sum + s.value, 0),
  };

  return {
    strategy,
    rooms: chosen.slots.map((s) => ({
      label: s.label,
      operators: s.combo ?? [],
      value: s.value,
      unit: s.kind === 'tp' ? 'LMD/day' : s.kind === 'goldFactory' ? 'Precious Metals/day' : 'EXP/day',
    })),
    totals,
    supportPlacements: CC_OFFICE_DORM_ENABLERS.map((e) => ({ name: e.name, room: e.room, unlocks: e.unlocks })),
    gummyPlaced,
    verifiedContext: finalContext,
  };
}

export function runWholeBaseOptimizer(): { balanced: WholeBaseResult; total: WholeBaseResult } {
  return {
    balanced: runStrategy('balanced'),
    total: runStrategy('total'),
  };
}