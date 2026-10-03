import { type IncomeSettings } from './incomeSettings';
import type { WishingWallMode } from './wishingWall';
import { bannerFreePulls, type UpcomingBanner } from './pulls';

export const PULL_PLAN_KEY = 'arkpedia.pull-plan.v1';
export const MAX_PLAN_FILE_SIZE = 250_000;
export const MAX_GOALS = 40;
export interface BannerGoal { banner: string; pulls: number; spendOn: string; ticketUsed?: boolean; targets?: { name: string; copies: number }[]; includeSpark?: boolean; rateUpRoster?: string[] }
/** The planner forecasts through each banner's end; migrate former custom dates
 * when a saved/imported plan is opened. Keep missing banners available to remove. */
export function goalsAtBannerEnd(goals: readonly BannerGoal[], banners: readonly UpcomingBanner[]): BannerGoal[] {
  const current = new Map(banners.flatMap(banner => [banner.name, ...(banner.aliases ?? [])].map(name => [name, banner] as const)));
  return goals.map(goal => ({ ...goal, banner: current.get(goal.banner)?.name ?? goal.banner, spendOn: current.get(goal.banner)?.end ?? goal.spendOn }));
}

export interface SavedPullPlan {
  version: 1;
  orundum: string; originite: string; permits: string; reservedOP: string;
  until: string; manualEventDate: string; bannerName: string;
  monthlyCard: boolean; includeBacklog: boolean; annihilationDone: boolean;
  /** Whether the Skin wishlist's OP is held back from the pulls; absent (older plans) means yes. */
  includeSkins?: boolean;
  doneEvents: string[]; doneKeys: string[]; clearedReruns: string[];
  future: Record<string, number>;
  goals: BannerGoal[];
  skinIds?: string[];
  wishingWallMode?: WishingWallMode;
  yellowCerts?: string;
  incomeSettings?: IncomeSettings;
  /** The account import (its importedAt) the resources were last filled from: a newer import
   *  fills them again, and until then the reader's own edits stand. */
  walletFrom?: string;
  /** The account import the Past events ticks were last set from, the same way: a newer
   *  import ticks them again, and until then they are the reader's. */
  ticksFrom?: string;
}
export function validPlanDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function planNumber(value: string): number {
  return /^\d{1,8}$/.test(value) ? Math.min(10_000_000, Number(value)) : 0;
}
/** Parse only the fields this planner owns. Never merge imported objects into state. */
export function parsePullPlan(raw: string): SavedPullPlan {
  if (raw.length > MAX_PLAN_FILE_SIZE) throw new Error('This file is too large for a pull plan.');
  let p: unknown;
  try { p = JSON.parse(raw); } catch { throw new Error('This is not a valid JSON pull plan.'); }
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Choose an Arkpedia pull plan file.');
  const data = p as Record<string, unknown>;
  if (data.version !== 1) throw new Error('This pull plan version is not supported.');
  const text = (key: string, max = 200): string => {
    const value = data[key];
    if (typeof value !== 'string' || value.length > max) throw new Error(`Invalid ${key} in this plan.`);
    return value;
  };
  const amount = (key: string) => {
    const value = text(key, 8);
    if (value !== '' && (!/^\d+$/.test(value) || Number(value) > 10_000_000)) throw new Error(`Invalid ${key} amount.`);
    return value;
  };
  const date = (key: string) => {
    const value = text(key, 10);
    if (value && !validPlanDate(value)) throw new Error(`Invalid ${key} date.`);
    return value;
  };
  const flag = (key: string) => {
    if (typeof data[key] !== 'boolean') throw new Error(`Invalid ${key} setting.`);
    return data[key] as boolean;
  };
  const list = (key: string): string[] => {
    const value = data[key];
    if (!Array.isArray(value) || value.length > 2000 || value.some(v => typeof v !== 'string' || v.length > 200)) throw new Error(`Invalid ${key} list.`);
    return [...new Set(value)];
  };
  if (!data.future || typeof data.future !== 'object' || Array.isArray(data.future)) throw new Error('Invalid future events.');
  const future: Record<string, number> = {};
  for (const [key, count] of Object.entries(data.future)) {
    if (!['sidestory', 'ministory', 'special', 'branchline'].includes(key) || !Number.isInteger(count) || (count as number) < 0 || (count as number) > 100) throw new Error('Invalid future event count.');
    future[key] = count as number;
  }
  if (!Array.isArray(data.goals) || data.goals.length > MAX_GOALS) throw new Error('A plan supports up to 40 banners.');
  const goals = data.goals.map((goal: unknown): BannerGoal => {
    if (!goal || typeof goal !== 'object') throw new Error('Invalid banner goal.');
    const g = goal as Record<string, unknown>;
    if (typeof g.banner !== 'string' || !g.banner || g.banner.length > 200 || !validPlanDate(g.spendOn) || !Number.isInteger(g.pulls) || (g.pulls as number) < 0 || (g.pulls as number) > 100_000) throw new Error('Invalid banner goal.');
    if (g.ticketUsed !== undefined && typeof g.ticketUsed !== 'boolean') throw new Error('Invalid banner ticket setting.');
    if (g.includeSpark !== undefined && typeof g.includeSpark !== 'boolean') throw new Error('Invalid spark setting.');
    let targets: BannerGoal['targets'];
    if (g.targets !== undefined) {
      if (!Array.isArray(g.targets) || g.targets.length > 20) throw new Error('Invalid operator goals.');
      targets = g.targets.map((target: unknown) => {
        if (!target || typeof target !== 'object') throw new Error('Invalid operator goal.');
        const t = target as Record<string, unknown>;
        if (typeof t.name !== 'string' || !t.name || t.name.length > 200 || !Number.isInteger(t.copies) || (t.copies as number) < 1 || (t.copies as number) > 6) throw new Error('Invalid operator goal.');
        return { name: t.name, copies: t.copies as number };
      });
      if (new Set(targets.map(t => t.name)).size !== targets.length) throw new Error('Duplicate operator goals.');
    }
    if (g.rateUpRoster !== undefined && (!Array.isArray(g.rateUpRoster) || g.rateUpRoster.length > 6 || g.rateUpRoster.some(n => typeof n !== 'string' || !n || n.length > 200) || new Set(g.rateUpRoster).size !== g.rateUpRoster.length)) throw new Error('Invalid rate-up roster.');
    return { ...(targets ? { targets } : {}), ...(g.includeSpark === undefined ? {} : { includeSpark: g.includeSpark }), ...(g.rateUpRoster === undefined ? {} : { rateUpRoster: g.rateUpRoster as string[] }), banner: g.banner, spendOn: g.spendOn, pulls: g.pulls as number, ticketUsed: g.ticketUsed === true };
  });
  if (new Set(goals.map(g => g.banner)).size !== goals.length) throw new Error('A banner is listed more than once.');
  if (data.wishingWallMode !== undefined && !['minimum', 'average', 'lucky'].includes(data.wishingWallMode as string)) throw new Error('Invalid Wishing Wall setting.');
  let incomeSettings: IncomeSettings | undefined;
  if (data.incomeSettings !== undefined) {
    const value = data.incomeSettings as Record<string, unknown>;
    if (!value || typeof value !== 'object' || ['daily', 'weekly', 'annihilation', 'certificates'].some(key => typeof value[key] !== 'boolean')) throw new Error('Invalid income settings.');
    if (value.greenCertificates !== undefined && typeof value.greenCertificates !== 'boolean') throw new Error('Invalid green certificate setting.');
    incomeSettings = { ...(value.greenCertificates === undefined ? {} : { greenCertificates: value.greenCertificates as boolean }), daily: value.daily as boolean, weekly: value.weekly as boolean, annihilation: value.annihilation as boolean, certificates: value.certificates as boolean };
  }
  return { ...(incomeSettings ? { incomeSettings } : {}), ...(data.yellowCerts === undefined ? {} : { yellowCerts: amount('yellowCerts') }), ...(data.walletFrom === undefined ? {} : { walletFrom: text('walletFrom', 40) }), ...(data.ticksFrom === undefined ? {} : { ticksFrom: text('ticksFrom', 40) }), version: 1, orundum: amount('orundum'), originite: amount('originite'), permits: amount('permits'), reservedOP: amount('reservedOP'), until: date('until'), manualEventDate: date('manualEventDate'), bannerName: text('bannerName'), monthlyCard: flag('monthlyCard'), includeBacklog: flag('includeBacklog'), annihilationDone: flag('annihilationDone'), doneEvents: list('doneEvents'), doneKeys: list('doneKeys'), clearedReruns: list('clearedReruns'), future, goals, ...(data.skinIds === undefined ? {} : { skinIds: list('skinIds') }), ...(data.wishingWallMode === undefined ? {} : { wishingWallMode: data.wishingWallMode as WishingWallMode }), ...(data.includeSkins === undefined ? {} : { includeSkins: flag('includeSkins') }) };
}

/** Past daily freebies cannot be saved. An unused banner ticket can be kept
 * during that banner's run, so the player explicitly marks it when spent. */
export function availableBannerFreePulls(banner: UpcomingBanner, when: Date, now: Date, ticketUsed = false): number {
  if (when < now || now > new Date(`${banner.end}T23:59:59Z`)) return 0;
  const dayBeforeNow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 1);
  const pastDaily = Math.max(0, bannerFreePulls(banner, dayBeforeNow) - banner.freeTicket);
  return Math.max(0, bannerFreePulls(banner, when) - pastDaily - (ticketUsed ? banner.freeTicket : 0));
}

export interface BudgetRow {
  goal: BannerGoal;
  banner: UpcomingBanner | null;
  issue: string | null;
  available: number;
  free: number;
  paid: number;
  shortfall: number;
  remaining: number;
  spentBefore: number;
}
/** walletAt is cumulative ordinary savings, including fractional currency before
 * rounding to whole pulls. Banner-only free pulls never enter that wallet.
 * Negative balances remain negative: later rows must not forgive earlier debt. */
export function planBudgets(goals: readonly BannerGoal[], banners: readonly UpcomingBanner[], now: Date, walletAt: (date: Date) => number): BudgetRow[] {
  let spent = 0;
  return goals.map((goal, index) => ({ goal, index })).sort((a, b) => a.goal.spendOn.localeCompare(b.goal.spendOn) || a.index - b.index).map(({ goal }) => {
    const banner = banners.find(b => b.name === goal.banner || b.aliases?.includes(goal.banner)) ?? null;
    const when = new Date(`${goal.spendOn}T23:59:59Z`);
    const expired = when < now;
    const issue = !banner ? 'This banner is missing from the current schedule.' : expired ? 'This spending date has passed. Remove this goal and update your holdings with what you actually spent.' : goal.spendOn < banner.start || goal.spendOn > banner.end ? 'This date is outside the current banner dates. Choose a date during its run.' : null;
    // Past goals are not deducted again from today's updated holdings. Unknown
    // or rescheduled future goals retain their budget, but gain no free pulls.
    const free = !issue && banner ? availableBannerFreePulls(banner, when, now, goal.ticketUsed) : 0;
    const paid = expired ? 0 : Math.max(0, goal.pulls - free);
    const spentBefore = spent;
    const available = expired ? 0 : walletAt(when) - spentBefore + free;
    spent += paid;
    return { goal, banner, issue, available, free, paid, shortfall: expired ? 0 : Math.max(0, goal.pulls - available), remaining: expired ? 0 : walletAt(when) - spent, spentBefore };
  });
}

/** For a planned banner, use the same preceding paid budgets as its plan card.
 * Reserve them at both ends of its forecast range, even when banner runs overlap.
 * A standalone date forecast deducts only budgets scheduled through that date. */
export function priorForecastSpending(rows: readonly BudgetRow[], banner: string, until: string): number {
  const active = rows.find(row => row.goal.banner === banner);
  if (active) return active.spentBefore;
  return rows.filter(row => row.goal.spendOn <= until).reduce((sum, row) => sum + row.paid, 0);
}

/** How far the banner plan reaches: the last spending date among its goals, and never before
 *  today (a plan whose dates have all passed is judged as of today), or null for no goals. The
 *  plan's footer reports its budgets and savings through this date, whatever date the Pull
 *  calculation is set to. */
export function planHorizon(goals: readonly BannerGoal[], today: string): string | null {
  if (!goals.length) return null;
  const last = goals.reduce((latest, goal) => (goal.spendOn > latest ? goal.spendOn : latest), '');
  return last > today ? last : today;
}

/** Ordinary savings at the forecast date, after only the budgets due by then.
 * Banner-only freebies reduce each row's paid cost; they never become savings. */
export function savingsAfterPlanAt(wallet: number, rows: readonly BudgetRow[], until: string): number {
  return wallet - rows.filter(row => row.goal.spendOn <= until).reduce((sum, row) => sum + row.paid, 0);
}
