/**
 * The best single staffing of a base's work rooms by integer programming (HiGHS), and a rest-aware ceiling over
 * every rotation by linear programming, for benches: how close the search's plans come to the best they could be.
 * Not shipped; scripts/bench/staffing-gap.ts runs it over the Krooster fixtures, staffing-mip-verify.ts holds the
 * single staffing to a brute force on small bases.
 *
 * Score: funded output, as plans are judged (`sustainableOutput`): EXP plus the LMD of the gold the Trading Posts
 * sell, scaled down where the Factories make less gold than the posts would sell. One staffing at full Morale, from
 * the calculator's snapshot (`calculateBase`, green figures).
 *
 * Candidates per room are teams (teamBlocks.ts, or whatever `candidates` returns). A team's contribution is what it
 * changes, room emptied versus room staffed, with the rest of the base held as `context` staffs it (its members
 * taken out wherever the context had them): EXP, gold made, gold sold and the LMD those sales bring. The program adds
 * the contributions, which is exact for rooms that do not affect each other; a Control Center's bonus for the posts,
 * or a faction count, is seen only as the context has it. `additiveValue` measures that error on a staffing.
 * Funding, LMD x min(1, gold made / gold sold), is two linear programs: `balanced` keeps the gold sold within the
 * gold made and counts every post's LMD in full (exact there); `rationed` gives each team's sales its own LMD per
 * gold and funds them up to the gold made, best first (exact for one post, and above the game's proportional
 * rationing otherwise, so a valid relaxation for the ceiling). The single staffing solves both and keeps the one the
 * calculator scores higher.
 */
import loadHighs from 'highs';
import { teamBlocks } from '../../lib/base/teamBlocks';
import { calculateBase } from '../../lib/base/calculateBase';
import { settle } from '../../lib/base/settle';
import { snapshotKey } from '../../lib/base/snapshotMemo';
import { WORK_KINDS } from '../../lib/base/baseOptimizer';
import type { GenomeContext } from '../../lib/base/planGenome';
import type { BaseAssignments, FactoryProducts } from '../../lib/base/baseTypes';

type Highs = { solve: (lp: string) => { Status: string; ObjectiveValue: number; Columns: Record<string, { Primal: number }> } };
let solver: Highs | undefined;
async function highs(): Promise<Highs> {
  solver ??= (await loadHighs()) as unknown as Highs;
  return solver;
}

export interface Team { room: string; names: string[] }
interface Totals { exp: number; made: number; sold: number; lmd: number }

const memo = new WeakMap<object, Map<string, Totals>>();
/** The snapshot's day: EXP, gold made, gold sold, and the LMD the posts' sales bring. */
export function totalsOf(ctx: GenomeContext, a: BaseAssignments, products: FactoryProducts): Totals {
  let m = memo.get(ctx.base);
  if (!m) memo.set(ctx.base, m = new Map());
  const key = snapshotKey(a, products, ctx.loginInterval);
  let t = m.get(key);
  if (!t) {
    const r = calculateBase({ ...ctx.base, assignments: a, factoryProducts: products, loginInterval: ctx.loginInterval, swapPolicy: 'onLogin' });
    t = { exp: settle(r.dailyExpGreen), made: settle(r.dailyGoldMadeGreen), sold: settle(r.dailyGoldSoldGreen), lmd: settle(r.dailyGoldWorthGreen) };
    if (m.size > 50_000) m.clear();
    m.set(key, t);
  }
  return t;
}
const funded = (t: Totals) => t.exp + (t.sold > 0 ? t.lmd * Math.min(1, t.made / t.sold) : t.lmd);
/** Funded output of a work-room staffing: EXP + LMD, LMD scaled to the gold the factories make. */
export const fundedValue = (ctx: GenomeContext, a: BaseAssignments, products: FactoryProducts) => funded(totalsOf(ctx, a, products));

const workRooms = (ctx: GenomeContext) => ctx.base.facilities.filter(f => f.capacity > 0 && WORK_KINDS.includes(f.kind));
const slotOf = (ctx: GenomeContext, name: string) => ({ operatorName: name, eliteLevel: ctx.roster[name].eliteLevel, level: ctx.roster[name].level });
const namesIn = (a: BaseAssignments, room: string) => (a[room] ?? []).flatMap(s => s ? [s.operatorName] : []);
const emptyBase = (ctx: GenomeContext): BaseAssignments => Object.fromEntries(workRooms(ctx).map(f => [f.id, Array(f.capacity).fill(null)]));

/** `context` with `names` taken out everywhere and `room` staffed by `names` (empty when `names` is empty). */
function placing(ctx: GenomeContext, context: BaseAssignments, room: string, names: string[]): BaseAssignments {
  const capacity = workRooms(ctx).find(f => f.id === room)!.capacity;
  const out: BaseAssignments = Object.fromEntries(Object.entries(context).map(([id, slots]) => [id, (slots ?? []).map(s => s && names.includes(s.operatorName) ? null : s)]));
  out[room] = [...names.map(n => slotOf(ctx, n)), ...Array(Math.max(0, capacity - names.length)).fill(null)];
  return out;
}
/** What a team changes in its room, in the context. */
function contribution(ctx: GenomeContext, products: FactoryProducts, context: BaseAssignments, t: Team): Totals {
  const on = totalsOf(ctx, placing(ctx, context, t.room, t.names), products), off = totalsOf(ctx, placing(ctx, context, t.room, []), products);
  return { exp: on.exp - off.exp, made: on.made - off.made, sold: on.sold - off.sold, lmd: on.lmd - off.lmd };
}

function teamsFor(ctx: GenomeContext, context: BaseAssignments, byRoom: Record<string, Team[]>): Team[] {
  const teams: Team[] = [];
  for (const f of workRooms(ctx)) {
    const seen = new Set<string>();
    // The context's own teams stay candidates, so the program can always keep the staffing it starts from.
    for (const t of [{ room: f.id, names: namesIn(context, f.id) }, ...(byRoom[f.id] ?? [])]) {
      const key = [...t.names].sort().join('|');
      if (!t.names.length || seen.has(key)) continue;
      seen.add(key); teams.push(t);
    }
  }
  return teams;
}
const blocksAsTeams = (ctx: GenomeContext, products: FactoryProducts, opts: { top?: number; shortlist?: number; maxCombos?: number }) => (context: BaseAssignments) =>
  Object.fromEntries(Object.entries(teamBlocks(ctx, context, products, { top: opts.top ?? 48, shortlist: opts.shortlist ?? 18, maxCombos: opts.maxCombos ?? 4000 })).map(([room, bs]) => [room, bs.map(b => ({ room, names: b.names }))]));

const term = (c: number, v: string) => `${c >= 0 ? '+' : '-'} ${Math.abs(c).toFixed(6)} ${v}`;
type Funding = 'balanced' | 'rationed';
/** The funded objective and its constraints over share variables (x or y), for one funding case. */
function fundedModel(teams: Team[], parts: Totals[], base: Totals, v: string, funding: Funding) {
  const madeSum = teams.map((_, i) => term(-parts[i].made, `${v}${i}`)).join(' ');
  if (funding === 'balanced') return {
    objective: ` obj: ${teams.map((_, i) => term(parts[i].exp + parts[i].lmd, `${v}${i}`)).join(' ')}`,
    // Gold sold within gold made, both as the empty base plus each team's change.
    constraints: [` fund: ${teams.map((_, i) => term(parts[i].sold, `${v}${i}`)).join(' ')} ${madeSum} <= ${(base.made - base.sold).toFixed(6)}`],
    extra: [] as string[], constant: base.exp + base.lmd,
  };
  // u_i: the gold team i's sales are funded with, at the team's own LMD per gold; LMD with no gold behind it as is.
  const sells = teams.map((_, i) => parts[i].sold > 1e-9);
  return {
    objective: ` obj: ${teams.map((_, i) => sells[i] ? `${term(parts[i].exp, `${v}${i}`)} ${term(parts[i].lmd / parts[i].sold, `u${i}`)}` : term(parts[i].exp + parts[i].lmd, `${v}${i}`)).join(' ')}`,
    constraints: [
      ...teams.flatMap((_, i) => sells[i] ? [` s${i}: u${i} ${term(-parts[i].sold, `${v}${i}`)} <= 0`] : []),
      ` fund: ${teams.flatMap((_, i) => sells[i] ? [`+ u${i}`] : []).join(' ') || '0 u0'} ${madeSum} <= ${base.made.toFixed(6)}`,
    ],
    extra: teams.flatMap((_, i) => sells[i] ? [` u${i} >= 0`] : []), constant: base.exp,
  };
}

/** Per round: the program's own value of its choice in that round's context, the calculator's, the teams offered. */
export interface MipResult { assignments: BaseAssignments; value: number; rounds: { predicted: number; actual: number; candidates: number }[] }

export async function bestStaffing(ctx: GenomeContext, products: FactoryProducts, start: BaseAssignments, opts: {
  top?: number; shortlist?: number; maxCombos?: number; maxRounds?: number;
  candidates?: (context: BaseAssignments) => Record<string, Team[]>;
} = {}): Promise<MipResult> {
  const rooms = workRooms(ctx);
  const candidates = opts.candidates ?? blocksAsTeams(ctx, products, opts);
  let context: BaseAssignments = Object.fromEntries(rooms.map(f => [f.id, Array.from({ length: f.capacity }, (_, i) => start[f.id]?.[i] ?? null)]));
  let value = fundedValue(ctx, context, products);
  const rounds: MipResult['rounds'] = [];
  const base = totalsOf(ctx, emptyBase(ctx), products);
  for (let round = 0; round < (opts.maxRounds ?? 6); round++) {
    const teams = teamsFor(ctx, context, candidates(context));
    const parts = teams.map(t => contribution(ctx, products, context, t));
    const operators = [...new Set(teams.flatMap(t => t.names))];
    let best: { next: BaseAssignments; actual: number; predicted: number } | undefined;
    for (const funding of ['balanced', 'rationed'] as const) {
      const model = fundedModel(teams, parts, base, 'x', funding);
      const lp = [
        'Maximize', model.objective, 'Subject To', ...model.constraints,
        ...rooms.flatMap(f => { const ids = teams.flatMap((t, i) => t.room === f.id ? [`x${i}`] : []); return ids.length ? [` r_${f.id}: ${ids.join(' + ')} <= 1`] : []; }),
        ...operators.flatMap((n, k) => { const ids = teams.flatMap((t, i) => t.names.includes(n) ? [`x${i}`] : []); return ids.length > 1 ? [` o${k}: ${ids.join(' + ')} <= 1`] : []; }),
        'Bounds', ...model.extra, 'Binary', ` ${teams.map((_, i) => `x${i}`).join(' ')}`, 'End',
      ].join('\n');
      const r = (await highs()).solve(lp);
      if (r.Status === 'Infeasible') continue;
      if (r.Status !== 'Optimal') throw new Error(`HiGHS: ${r.Status}`);
      const next = emptyBase(ctx);
      teams.forEach((t, i) => { if ((r.Columns[`x${i}`]?.Primal ?? 0) > 0.5) next[t.room] = placing(ctx, next, t.room, t.names)[t.room]; });
      const actual = fundedValue(ctx, next, products);
      if (!best || actual > best.actual) best = { next, actual, predicted: model.constant + r.ObjectiveValue };
    }
    if (!best) break;
    const { next, actual } = best;
    rounds.push({ predicted: best.predicted, actual, candidates: teams.length });
    if (actual <= value + 1e-6) break;
    context = next; value = actual;
  }
  return { assignments: context, value, rounds };
}

/** The program's view of a staffing: the empty base plus each room's team contribution in the staffing as context,
 *  funded the same way. Against `fundedValue` of the same staffing, how far the additive model strays. */
export function additiveValue(ctx: GenomeContext, products: FactoryProducts, staffing: BaseAssignments): number {
  const sum = { ...totalsOf(ctx, emptyBase(ctx), products) };
  for (const f of workRooms(ctx)) {
    const names = namesIn(staffing, f.id);
    if (!names.length) continue;
    const p = contribution(ctx, products, staffing, { room: f.id, names });
    sum.exp += p.exp; sum.made += p.made; sum.sold += p.sold; sum.lmd += p.lmd;
  }
  return funded(sum);
}

/**
 * A rest-aware ceiling: the best time-share of teams a rotation could run, as a linear program (the master problem of
 * the cyclic-rostering literature, without integrality). Each team gets a share of the time (at most 1 per room);
 * an operator works only while their Morale allows: at a drain d in a team and a recovery r in a Dormitory, each hour
 * of work needs d / r hours of rest, so work plus rest is at most the whole time; and the rest fits the beds. A
 * relaxation of every rotation (any number of setups, fractional shift lengths, Morale never wasted at 24, the best
 * recovery for everyone), within the additive model's error.
 */
export async function restAwareCeiling(ctx: GenomeContext, products: FactoryProducts, context: BaseAssignments, opts: {
  recovery: number; beds: number; top?: number; shortlist?: number; maxCombos?: number;
}): Promise<{ value: number; teams: number; busiest: { name: string; share: number }[] }> {
  const rooms = workRooms(ctx);
  const teams = teamsFor(ctx, context, blocksAsTeams(ctx, products, opts)(context));
  const parts = teams.map(t => contribution(ctx, products, context, t));
  const drains = teams.map(t => {
    const room = calculateBase({ ...ctx.base, assignments: placing(ctx, context, t.room, t.names), factoryProducts: products, loginInterval: ctx.loginInterval, swapPolicy: 'onLogin' }).rooms[t.room];
    return Object.fromEntries(t.names.map(n => [n, Math.max(0, room.perOperatorMorale?.[n] ?? room.combinedMoraleRate)]));
  });
  // Rationed funding is at or above the game's proportional rule for every mix of teams: a relaxation, as a ceiling needs.
  const base = totalsOf(ctx, emptyBase(ctx), products);
  const model = fundedModel(teams, parts, base, 'y', 'rationed');
  const operators = [...new Set(teams.flatMap(t => t.names))];
  const lp = [
    'Maximize', model.objective, 'Subject To', ...model.constraints,
    ...rooms.flatMap(f => { const ids = teams.flatMap((t, i) => t.room === f.id ? [`y${i}`] : []); return ids.length ? [` r_${f.id}: ${ids.join(' + ')} <= 1`] : []; }),
    ...operators.map((n, k) => ` o${k}: ${teams.flatMap((t, i) => t.names.includes(n) ? [term(1 + drains[i][n] / opts.recovery, `y${i}`)] : []).join(' ')} <= 1`),
    ` beds: ${teams.flatMap((t, i) => { const rest = t.names.reduce((s, n) => s + drains[i][n] / opts.recovery, 0); return rest > 0 ? [term(rest, `y${i}`)] : []; }).join(' ') || '0 y0'} <= ${opts.beds}`,
    'Bounds', ...model.extra, ...teams.map((_, i) => ` 0 <= y${i} <= 1`), 'End',
  ].join('\n');
  const r = (await highs()).solve(lp);
  if (r.Status !== 'Optimal') throw new Error(`HiGHS: ${r.Status}`);
  const share = new Map<string, number>();
  teams.forEach((t, i) => { const y = r.Columns[`y${i}`]?.Primal ?? 0; for (const n of t.names) share.set(n, (share.get(n) ?? 0) + y); });
  return { value: model.constant + r.ObjectiveValue, teams: teams.length, busiest: [...share].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, s]) => ({ name, share: s })) };
}

interface Column { assignments: BaseAssignments; totals: Totals; drains: Record<string, number> }
/** A setup as a column: its exact totals and each working operator's drain there. */
function columnOf(ctx: GenomeContext, products: FactoryProducts, assignments: BaseAssignments): Column {
  const r = calculateBase({ ...ctx.base, assignments, factoryProducts: products, loginInterval: ctx.loginInterval, swapPolicy: 'onLogin' });
  const drains: Record<string, number> = {};
  for (const f of workRooms(ctx)) for (const n of namesIn(assignments, f.id)) drains[n] = Math.max(0, r.rooms[f.id]?.perOperatorMorale?.[n] ?? r.rooms[f.id]?.combinedMoraleRate ?? 0);
  return { assignments, totals: totalsOf(ctx, assignments, products), drains };
}

/**
 * The best time-share of whole setups, each scored exactly by the calculator, by column generation: the master
 * linear program mixes the setups it has (a share of the time each; an operator's work plus the rest it needs at most
 * the whole time, at the best recovery the plan reaches; the rest within the beds; gold made in one setup funding the
 * sales of another, each setup's sales at its own LMD per gold), and a pricing step asks the staffing program for a
 * setup worth more than the master's duals charge for its operators, beds and time. Exact values, a heuristic pricing
 * (the additive model), so not a bound; and a relaxation of rotations (fractional shares, no preset limit, Morale
 * never wasted at 24). Run once with only the plan's own setups (`price: false`) to see how much the relaxation alone
 * adds.
 */
export async function rotationMix(ctx: GenomeContext, products: FactoryProducts, initial: BaseAssignments[], opts: {
  recovery: number; beds: number; price?: boolean; iterations?: number; top?: number; shortlist?: number; maxCombos?: number;
  /** Fiammetta's refill targets: she restores their Morale, so they work without rest or a bed. */
  refilled?: ReadonlySet<string>;
}): Promise<{ value: number; columns: number; mix: { share: number; value: number; assignments: BaseAssignments }[]; added: number[] }> {
  const refilled = opts.refilled ?? new Set<string>();
  const restOf = (n: string, d: number) => refilled.has(n) ? 0 : d / opts.recovery;
  const rooms = workRooms(ctx);
  const columns: Column[] = [];
  const seen = new Set<string>();
  const add = (a: BaseAssignments) => { const k = snapshotKey(a, products, ctx.loginInterval); if (seen.has(k)) return false; seen.add(k); columns.push(columnOf(ctx, products, a)); return true; };
  initial.forEach(add);
  const added: number[] = [];
  let result = { value: 0, duals: new Map<string, number>(), shares: [] as number[] };
  const master = async () => {
    const ops = [...new Set(columns.flatMap(c => Object.keys(c.drains)))].filter(n => !refilled.has(n));
    const lp = [
      'Maximize',
      ` obj: ${columns.map((c, s) => c.totals.sold > 1e-9 ? `${term(c.totals.exp, `w${s}`)} ${term(c.totals.lmd / c.totals.sold, `u${s}`)}` : term(c.totals.exp + c.totals.lmd, `w${s}`)).join(' ')}`,
      'Subject To',
      ` time: ${columns.map((_, s) => `+ w${s}`).join(' ')} <= 1`,
      ...ops.map((n, k) => ` op${k}: ${columns.flatMap((c, s) => n in c.drains ? [term(1 + restOf(n, c.drains[n]), `w${s}`)] : []).join(' ')} <= 1`),
      ` beds: ${columns.map((c, s) => term(Object.entries(c.drains).reduce((a, [n, d]) => a + restOf(n, d), 0), `w${s}`)).join(' ')} <= ${opts.beds}`,
      ...columns.flatMap((c, s) => c.totals.sold > 1e-9 ? [` sell${s}: u${s} ${term(-c.totals.sold, `w${s}`)} <= 0`] : []),
      ` fund: ${columns.flatMap((c, s) => c.totals.sold > 1e-9 ? [`+ u${s}`] : []).join(' ') || '0 w0'} ${columns.map((c, s) => term(-c.totals.made, `w${s}`)).join(' ')} <= 0`,
      'Bounds', ...columns.map((_, s) => ` w${s} >= 0`), ...columns.flatMap((c, s) => c.totals.sold > 1e-9 ? [` u${s} >= 0`] : []), 'End',
    ].join('\n');
    const r = (await highs()).solve(lp) as unknown as { Status: string; ObjectiveValue: number; Columns: Record<string, { Primal: number }>; Rows: { Name: string; Dual: number }[] };
    if (r.Status !== 'Optimal') throw new Error(`HiGHS master: ${r.Status}`);
    const duals = new Map(r.Rows.map(row => [row.Name, Math.abs(row.Dual)]));
    const opDual = new Map(ops.map((n, k) => [n, duals.get(`op${k}`) ?? 0]));
    result = { value: r.ObjectiveValue, duals: new Map([...opDual, ['#time', duals.get('time') ?? 0], ['#beds', duals.get('beds') ?? 0], ['#fund', duals.get('fund') ?? 0]]), shares: columns.map((_, s) => r.Columns[`w${s}`]?.Primal ?? 0) };
  };
  await master();
  for (let it = 0; opts.price !== false && it < (opts.iterations ?? 12); it++) {
    // Price in the context of the setup the master leans on most.
    const lead = columns[result.shares.indexOf(Math.max(...result.shares))].assignments;
    const teams = teamsFor(ctx, lead, blocksAsTeams(ctx, products, opts)(lead));
    const parts = teams.map(t => contribution(ctx, products, lead, t));
    const phi = result.duals.get('#fund')!, beta = result.duals.get('#beds')!;
    const charge = teams.map(t => {
      const room = calculateBase({ ...ctx.base, assignments: placing(ctx, lead, t.room, t.names), factoryProducts: products, loginInterval: ctx.loginInterval, swapPolicy: 'onLogin' }).rooms[t.room];
      return t.names.reduce((sum, n) => { const d = Math.max(0, room.perOperatorMorale?.[n] ?? room.combinedMoraleRate); return sum + (result.duals.get(n) ?? 0) * (1 + restOf(n, d)) + beta * restOf(n, d); }, 0);
    });
    // A unit of time in the new setup earns its EXP, its gold made at the funding dual, its sales' LMD less the gold
    // they use at that dual, and pays its operators' and beds' duals.
    const worth = teams.map((_, i) => parts[i].exp + phi * parts[i].made + parts[i].lmd - phi * parts[i].sold - charge[i]);
    const operators = [...new Set(teams.flatMap(t => t.names))];
    const lp = [
      'Maximize', ` obj: ${teams.map((_, i) => term(worth[i], `x${i}`)).join(' ')}`, 'Subject To',
      ...rooms.flatMap(f => { const ids = teams.flatMap((t, i) => t.room === f.id ? [`x${i}`] : []); return ids.length ? [` r_${f.id}: ${ids.join(' + ')} <= 1`] : []; }),
      ...operators.flatMap((n, k) => { const ids = teams.flatMap((t, i) => t.names.includes(n) ? [`x${i}`] : []); return ids.length > 1 ? [` o${k}: ${ids.join(' + ')} <= 1`] : []; }),
      'Binary', ` ${teams.map((_, i) => `x${i}`).join(' ')}`, 'End',
    ].join('\n');
    const r = (await highs()).solve(lp);
    if (r.Status !== 'Optimal') throw new Error(`HiGHS pricing: ${r.Status}`);
    const next = emptyBase(ctx);
    teams.forEach((t, i) => { if ((r.Columns[`x${i}`]?.Primal ?? 0) > 0.5) next[t.room] = placing(ctx, next, t.room, t.names)[t.room]; });
    // The setup's exact reduced cost; a column only when it pays.
    const c = columnOf(ctx, products, next);
    const reduced = c.totals.exp + phi * c.totals.made + Math.max(0, c.totals.lmd - phi * c.totals.sold) - result.duals.get('#time')!
      - Object.entries(c.drains).reduce((s, [n, d]) => s + (result.duals.get(n) ?? 0) * (1 + restOf(n, d)) + beta * restOf(n, d), 0);
    if (reduced <= 1e-6 || !add(next)) break;
    const before = result.value;
    await master();
    added.push(result.value - before);
  }
  return { value: result.value, columns: columns.length, mix: columns.map((c, s) => ({ share: result.shares[s], value: funded(c.totals), assignments: c.assignments })).filter(m => m.share > 1e-6), added };
}
