import { serverCalendarTime, type GameServer } from '@/lib/time/servers.mjs';
import { CERT_MONTHLY_COST, CERT_MONTHLY_PULLS, type Income } from './pulls';

export interface IncomeSettings { daily: boolean; weekly: boolean; annihilation: boolean; certificates: boolean; greenCertificates?: boolean }
export const DEFAULT_INCOME_SETTINGS: IncomeSettings = { daily: true, weekly: true, annihilation: true, certificates: false, greenCertificates: false };
export function selectedIncome(income: Income, settings: IncomeSettings): Income {
  const daily = settings.daily ? income.daily : 0;
  const weekly = settings.weekly ? income.weekly : 0;
  const annihilation = settings.annihilation ? income.annihilation : 0;
  return { ...income, daily, weekly, annihilation, orundum: daily + weekly + annihilation };
}
/** Explicit monthly budgets buy sequential tiers from the balance already owned.
 * Older callers without a budget retain full-set estimates. Months follow the selected server's wall calendar, preserving the existing shop boundary convention. */
export function certificatePulls(from: Date, to: Date, certificates: number, enabled: boolean, spending?: Readonly<Record<string, number>>, server: GameServer = 'en'): number {
  if (spending) return enabled ? certificateSpending(from, to, certificates, spending, server).pulls : 0;
  if (!enabled || !(to >= from) || !Number.isFinite(certificates) || certificates < CERT_MONTHLY_COST) return 0;
  const start = serverCalendarTime(from, server), end = serverCalendarTime(to, server);
  const shops = 1 + (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  return Math.min(shops, Math.floor(certificates / CERT_MONTHLY_COST)) * CERT_MONTHLY_PULLS;
}

/** Future monthly shop refreshes; current-month purchases belong in holdings.
 * Tier 1: 600 Orundum and 2 permits; tier 2: 2 permits.
 * https://arknights.wiki.gg/wiki/Store/Certificate */
export function greenCertificateIncome(from: Date, to: Date, enabled: boolean, server: GameServer = 'en') {
  if (!enabled || !(to >= from) || !Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return { months: 0, orundum: 0, permits: 0 };
  const start = serverCalendarTime(from, server);
  const end = serverCalendarTime(to, server);
  const months = Math.max(0, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth());
  return { months, orundum: months * 600, permits: months * 4 };
}

/** Distinction shop's five sequential tiers. A budget can buy only complete tiers. */
export const YELLOW_CERT_TIERS = [{ cost: 10, pulls: 1 }, { cost: 18, pulls: 2 }, { cost: 40, pulls: 5 }, { cost: 70, pulls: 10 }, { cost: 120, pulls: 20 }] as const;
export function certShopPurchase(budget: number) {
  let spent = 0, pulls = 0;
  for (const tier of YELLOW_CERT_TIERS) {
    if (spent + tier.cost > budget) break;
    spent += tier.cost; pulls += tier.pulls;
  }
  return { spent, pulls };
}
export function certificateMonths(from: Date, to: Date, server: GameServer = 'en'): string[] {
  if (!(to >= from)) return [];
  const start = serverCalendarTime(from, server), end = serverCalendarTime(to, server);
  const months: string[] = [];
  for (let year = start.getUTCFullYear(), month = start.getUTCMonth(); year < end.getUTCFullYear() || (year === end.getUTCFullYear() && month <= end.getUTCMonth());) {
    months.push(`${year}-${String(month + 1).padStart(2, '0')}`);
    if (months.length >= 120) break;
    month++; if (month === 12) { month = 0; year++; }
  }
  return months;
}
export function certificateSpending(from: Date, to: Date, holdings: number, spending: Readonly<Record<string, number>>, server: GameServer = 'en') {
  let left = Math.max(0, Number.isFinite(holdings) ? holdings : 0), pulls = 0, spent = 0;
  const rows = certificateMonths(from, to, server).map(month => {
    const budget = Math.max(0, Number.isFinite(spending[month]) ? spending[month] : 0);
    const bought = certShopPurchase(Math.min(budget, left));
    left -= bought.spent; spent += bought.spent; pulls += bought.pulls;
    return { month, budget, ...bought, short: certShopPurchase(budget).spent - bought.spent };
  });
  return { rows, spent, pulls, left };
}
