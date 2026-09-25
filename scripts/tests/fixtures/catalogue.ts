/**
 * The smallest input checkCompleteness passes: nothing expected from the CN tables and
 * nothing published. A test adds only the records it is about, so its result never
 * depends on what the day's refresh left in data/: npm test runs in the release job
 * against freshly refreshed data, where any enemy icon or reward name may be new.
 */
export function emptyCatalogue(parts: object = {}) {
  return {
    inventory: { operators: [], skins: [], events: [], banners: [] },
    operators: [], skins: [], banners: [], events: [], bundles: [],
    assets: new Set<string>(),
    // No confirmed outfit windows, at a fixed instant: never the real date.
    skinWindows: [] as object[], now: new Date('2026-09-23T00:00:00Z'),
    stageEnemies: new Map<string, string>(),
    enemyRecords: new Map<string, { name: string; icon?: string }>(), enemyIndex: new Set<string>(),
    ...parts,
  };
}
