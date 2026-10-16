export interface StatsRow {
  operator_name: string;
  n: number;
  mean: number;
  p5: number;
  p95: number;
  q1: number;
  q3: number;
  median: number;
  mode: number;
}

// 5.8 to 7.2 in 0.1 steps, descending (7.2 first, for tier rows top-to-bottom)
export const POWER_VALUES: string[] = (() => {
  const vals: string[] = [];
  for (let v = 72; v >= 58; v -= 1) vals.push((v / 10).toFixed(1));
  return vals;
})();
