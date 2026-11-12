/**
 * The search compares scores and rates that two sums of the same numbers can put a last bit apart (0.35 + 0.3
 * + 0.25 is not 0.25 + 0.3 + 0.35 in floating point), and a greedy fill or an anneal that breaks a tie by that
 * bit walks a different path from then on. Every number a search compares is settled to a fixed decimal first,
 * so the path depends on the staffing alone.
 */
export const settle = (n: number): number => Number.isFinite(n) ? Math.round(n * 1e9) / 1e9 : n;
