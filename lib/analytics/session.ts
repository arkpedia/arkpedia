/** A per-tab session sample, without a visitor identifier. Keep whole navigation journeys. */
export const ANALYTICS_SAMPLE_RATE = 0.2;
export const ANALYTICS_SAMPLE_KEY = 'arkpedia:analytics:sample:v1';
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

/** The in-memory decision also survives navigation when browser storage is unavailable. */
export function createSessionSampler() {
  let sampled: boolean | undefined;
  return (storage: () => Storage, random: () => number = Math.random): boolean => {
    if (sampled !== undefined) return sampled;
    try {
      const saved = storage().getItem(ANALYTICS_SAMPLE_KEY);
      if (saved === '1' || saved === '0') return (sampled = saved === '1');
    } catch { /* Private browsing can refuse storage. */ }
    sampled = random() < ANALYTICS_SAMPLE_RATE;
    try { storage().setItem(ANALYTICS_SAMPLE_KEY, sampled ? '1' : '0'); } catch { /* Keep the memory decision. */ }
    return sampled;
  };
}

/** Filters and in-page anchors are interactions, rather than additional page views. */
export function analyticsPath(asPath: string): string {
  return asPath.split(/[?#]/, 1)[0];
}
