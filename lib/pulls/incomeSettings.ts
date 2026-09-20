import { CERT_MONTHLY_COST, CERT_MONTHLY_PULLS, type Income } from './pulls';

export interface IncomeSettings { daily: boolean; weekly: boolean; annihilation: boolean; certificates: boolean; greenCertificates?: boolean }
export const DEFAULT_INCOME_SETTINGS: IncomeSettings = { daily: true, weekly: true, annihilation: true, certificates: false, greenCertificates: false };
export function selectedIncome(income: Income, settings: IncomeSettings): Income {
  const daily = settings.daily ? income.daily : 0;
  const weekly = settings.weekly ? income.weekly : 0;
  const annihilation = settings.annihilation ? income.annihilation : 0;
  return { ...income, daily, weekly, annihilation, orundum: daily + weekly + annihilation };
}
/** Full monthly shop sets only, paid from certificates already owned. The current
 * shop is assumed unclaimed when enabled. Shop months follow Global server time. */
export function certificatePulls(from: Date, to: Date, certificates: number, enabled: boolean): number {
  if (!enabled || !(to >= from) || !Number.isFinite(certificates) || certificates < CERT_MONTHLY_COST) return 0;
  const serverDate = (date: Date) => new Date(date.getTime() - 7 * 60 * 60 * 1000);
  const start = serverDate(from), end = serverDate(to);
  const shops = 1 + (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  return Math.min(shops, Math.floor(certificates / CERT_MONTHLY_COST)) * CERT_MONTHLY_PULLS;
}

/** Future monthly shop refreshes; current-month purchases belong in holdings.
 * Tier 1: 600 Orundum and 2 permits; tier 2: 2 permits.
 * https://arknights.wiki.gg/wiki/Store/Certificate */
export function greenCertificateIncome(from: Date, to: Date, enabled: boolean) {
  if (!enabled || !(to >= from) || !Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return { months: 0, orundum: 0, permits: 0 };
  const start = new Date(from.getTime() - 7 * 60 * 60 * 1000);
  const end = new Date(to.getTime() - 7 * 60 * 60 * 1000);
  const months = Math.max(0, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth());
  return { months, orundum: months * 600, permits: months * 4 };
}
