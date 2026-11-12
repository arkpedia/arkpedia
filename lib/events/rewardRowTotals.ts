import type { SummaryRow } from './rewardSummary';

// Older content releases lack totals; these stable denominations preserve their exports.

export function withRewardRowTotal(row: SummaryRow, exp: ReadonlyMap<string, number> = new Map([['Strategic Battle Record', 2000], ['Tactical Battle Record', 1000], ['Frontline Battle Record', 400], ['Drill Battle Record', 200]])): SummaryRow {
  if (row.total) return row;
  if (row.label === 'EXP' && row.items.every(item => exp.has(item.name))) return { ...row, total: { value: row.items.reduce((sum, item) => sum + item.count * (exp.get(item.name) ?? 0), 0), unit: 'EXP' } };
  if (row.label === 'Headhunting') return { ...row, total: { value: row.items.reduce((sum, item) => sum + item.count * (/^(Orundum|合成玉)$/.test(item.name) ? 1 / 600 : /^(Originite Prime|源石)$/.test(item.name) ? 180 / 600 : /ten-roll|十连/.test(item.name) ? 10 : /Headhunting Permit|寻访凭证|^Daily free headhunting roll$/.test(item.name) ? 1 : 0), 0), unit: 'pulls · incl. OP' } };
  return row;
}
