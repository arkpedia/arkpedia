import { tradingPostExpectedMinutes } from './baseProductivity';
/** Expected-time queue model: empty after collection, no collection until login.
 * Each step uses its own speed; this is an expectation, not a random-order simulator. */
export function jayeContribution(baseLimit: number, otherEfficiency: number, snowCap: number, promoted: boolean, grey: number, hours: number, level: number, expectedMinutes = tradingPostExpectedMinutes('base', level)) {
  const snow = (value: number) => Math.min(snowCap, Math.floor((Math.max(0, value) + 1e-9) / 0.05) * 0.05);
  // cc.t.strong2: Snowsant copies other skills first; Jaye does not feed back into it at E1.
  const snowBase = snow(otherEfficiency);
  const reduction = promoted ? Math.max(0, Math.floor((otherEfficiency + snowBase + 1e-9) / 0.1)) : 0;
  const capacity = Math.max(1, baseLimit - reduction);
  if (promoted) return { jaye: 0.04 * capacity, snowsant: snowBase, limitReduction: capacity - baseLimit };
  const minutes = expectedMinutes;
  const window = Math.max(0.001, hours);
  let elapsed = 0, weightedJaye = 0, weightedSnow = 0;
  for (let queued = 0; queued < capacity && elapsed < window; queued++) {
    const bonus = 0.04 * (capacity - queued), snowBonus = snow(otherEfficiency + bonus);
    const duration = Math.min(window - elapsed, minutes / 60 / Math.max(0.01, grey + otherEfficiency + bonus + snowBonus));
    weightedJaye += bonus * duration;
    weightedSnow += snowBonus * duration;
    elapsed += duration;
  }
  // Average over productive hours only. The caller applies storage idle time once.
  return { jaye: weightedJaye / elapsed, snowsant: weightedSnow / elapsed, limitReduction: 0 };
}
