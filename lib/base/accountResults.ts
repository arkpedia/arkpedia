import type { AccountOptimizerResult, LayoutRecommendation } from './accountOptimizer';

// Kept apart from accountOptimizer.ts so the page can merge results without loading the optimizer itself, which
// runs only in the Worker.

/** Best score first; on a tie the imported layout, then by name. */
export const byScore = (a: LayoutRecommendation, b: LayoutRecommendation) => b.score - a.score || (a.id === 'mine' ? -1 : b.id === 'mine' ? 1 : a.label.localeCompare(b.label));

/** Results of searches run side by side (the main search and the formations one): each layout's better plan. */
export function mergeAccountResults(...results: (AccountOptimizerResult | null | undefined)[]): AccountOptimizerResult | null {
  const present = results.filter((r): r is AccountOptimizerResult => !!r);
  if (!present.length) return null;
  const best = new Map<string, LayoutRecommendation>();
  for (const r of present) for (const rec of r.recommendations) if (!best.has(rec.id) || rec.score > best.get(rec.id)!.score) best.set(rec.id, rec);
  return { recommendations: [...best.values()].sort(byScore), searched: present.reduce((n, r) => n + r.searched, 0), rejected: present.reduce((n, r) => n + r.rejected, 0) };
}
