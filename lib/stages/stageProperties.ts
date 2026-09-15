import { StageGeometry, TileLegend } from './stageTypes';

/** What is mechanically special about a stage, derived rather than listed.
 *
 * The geometry's tile_legend carries a name and a description for every tile
 * key the map uses, and the dataset uses 85 distinct keys across the game --
 * far more than any hand-written list would keep up with (tile_toxichill,
 * tile_quicksand, tile_dygmny_1, tile_codpsea...). So the rule is subtractive:
 * everything that is not ordinary floor, wall, spawn or objective is a
 * mechanic, and the legend supplies its own wording.
 */
const STRUCTURAL = new Set([
  'tile_forbidden',
  'tile_empty',
  'tile_road',
  'tile_character',
  'tile_floor',
  'tile_wall',
  'tile_start',
  'tile_flystart',
  'tile_end',
  'tile_hole',
  'tile_fence',
  'tile_fence_bound',
  'tile_passable_wall',
  'tile_passable_wall_forbidden',
  'tile_stairs',
]);

export interface StageProperty {
  key: string;
  name: string;
  description: string | null;
  /** How many tiles of this kind the map has. */
  count: number;
}

function prettyTile(key: string): string {
  return key
    .replace(/^tile_/, '')
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

export function stageProperties(geometry: StageGeometry | null, legend: TileLegend): StageProperty[] {
  if (!geometry?.tileGrid) return [];
  const counts = new Map<string, number>();
  geometry.tileGrid.forEach((row) =>
    row.forEach((i) => {
      const key = geometry.tileLegend[i]?.key;
      if (!key || STRUCTURAL.has(key)) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    })
  );
  // Grouped by NAME, not by key: one mechanic often has a key per surface it
  // sits on -- tile_toxic, tile_toxicroad and tile_toxicwall are all
  // "Originium Pollution" -- and listing it once per key reads as three
  // different hazards.
  const byName = new Map<string, StageProperty>();
  for (const [key, count] of counts) {
    const entry = legend[key];
    const name = entry?.name || prettyTile(key);
    const existing = byName.get(name);
    if (existing) {
      existing.count += count;
      if (!existing.description && entry?.description) existing.description = entry.description;
    } else {
      byName.set(name, { key, name, description: entry?.description || null, count });
    }
  }
  return [...byName.values()].sort((a, b) => b.count - a.count);
}

/** Tokens the stage hands you -- deployable barricades, crates, the devices some
 * stages give you instead of an operator slot. */
export function stageTokens(geometry: StageGeometry | null): {
  fixedSquad: number; tokens: number; tokenKinds: number;
} {
  const tokens = geometry?.suppliedUnits?.deployable_tokens || [];
  return {
    fixedSquad: geometry?.suppliedUnits?.fixed_squad?.length || 0,
    // Each entry is one KIND of device carrying how many copies the stage starts
    // you with, so a count has to SUM them: 4-4 gives you ten Roadblocks as a
    // single entry, and reading the array length called that one device. 450 maps
    // have more copies than kinds.
    //
    // But `count` is the level file's initialCnt -- what you START with -- and it
    // is 0 on 1,011 of the 1,760 token entries, where the stage grants the device
    // some other way. Summing alone therefore reports 0 and the row disappears,
    // so both numbers are returned and the caller falls back to the kinds.
    tokens: tokens.reduce((total, token) => total + (token.count ?? 0), 0),
    tokenKinds: tokens.length,
  };
}
