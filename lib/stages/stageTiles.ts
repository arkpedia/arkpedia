import { StageTileKind } from './stageTypes';

/** Tile presentation.
 *
 * The palette is sampled from the game's own map renders, which average #534a43 -- a
 * warm neutral grey. Arknights' tactical view is a desaturated grey ramp, not the
 * blue-grey a dark UI tempts you into, and the objective is blue while spawns are red
 * (matching the game and PRTS.Map). The ramp runs void < floor (no deploy) < ground
 * (melee) < high ground (ranged).
 *
 * TWO AXES, and keeping them apart is the whole design.
 *
 *   THEME is what a tile is made of, and it decides the fill. The gamedata carries no
 *   theme id -- checked: a level file has bgmEvent and a null environmentSe, and
 *   stage_table's appearanceStyle is the stage-select button's style, not the map's.
 *   What DOES encode it is the tile keys, which are per-environment reskins of the same
 *   three basics: tile_dygmny_* is Sui's garden, tile_woodrd is a plank walkway,
 *   tile_ristar_road is Rhodes' deck. So a theme's tiles are tinted, and still read as
 *   ground, floor or high ground.
 *
 *   MECHANIC is what a tile DOES, and it decides the mark: a small glyph drawn on the
 *   tile. Every tile that changes the fight gets one, and tiles that differ only in
 *   appearance get none -- which is what stops a map of reskinned ground from looking
 *   like a map of mechanisms.
 *
 * The names and descriptions are the game's own, out of data/stage-tile-legend.json, so
 * nothing here invents what a tile means. This file decides only how it looks.
 */
const GREY = { void: '#131313', floor: '#26262a', ground: '#3d3e40', high: '#6d6f70' };
const SPAWN = '#d8453a';
const OBJECTIVE = '#4a86d8';
const SPECIAL = '#c8912f';

/**
 * A theme's three shades: floor, ground, high ground. Written as one row per theme so a
 * reskin is three characters of table rather than three entries.
 */
const THEME = {
  water: { floor: '#16242c', ground: '#1b2a33', high: '#2c4351' },
  toxic: { floor: '#2b2e18', ground: '#3a3d1d', high: '#585c2c' },
  lava: { floor: '#2c1a13', ground: '#3d2318', high: '#5e3a25' },
  ice: { floor: '#1f2e36', ground: '#2b3d47', high: '#47606d' },
  wood: { floor: '#2a2118', ground: '#3b2f21', high: '#5b4832' },
  plant: { floor: '#1f2a1d', ground: '#2a3327', high: '#41513c' },
  dream: { floor: '#241d33', ground: '#302743', high: '#4a3d63' },
  sui: { floor: '#2a2333', ground: '#3a3145', high: '#584c68' },
  stone: { floor: GREY.floor, ground: GREY.ground, high: GREY.high },
} as const;

type ThemeName = keyof typeof THEME;

/** The glyph a tile carries, or none. Drawn by the map; see stageTileMark. */
export type TileMark =
  | 'hazard' | 'portal' | 'boon' | 'hide' | 'switch'
  | 'hint' | 'float' | 'rope' | 'stairs' | 'water' | 'block';

export interface TileStyle {
  fill: string;
  stroke?: string;
  box?: string;
  /** The mechanic glyph, or absent for a tile that only looks different. */
  mark?: TileMark;
  /** null for tiles that carry no meaning worth a legend entry. */
  label: string | null;
  /** Lower sorts earlier in the legend. Water and the deployables lead. */
  rank?: number;
}

/**
 * The tiles the reader most needs to find, in the order they should be found.
 *
 * Water first, then the things you can put something ON that are not ordinary ground --
 * floating platforms, rope bridges, the roadblock spots PRTS marks. These change where a
 * squad can go at all, so on a map that has them they are the first thing the legend
 * should say, not a row somewhere below Flat Ground.
 */
const LEADS: Record<string, number> = {
  water: 0, float: 1, rope: 2, hint: 3,
};

/** THEME per key: which of the three shades a tile takes. Absent means stone. */
const THEMED: Record<string, ThemeName> = {
  tile_deepwater: 'water', tile_deepsea: 'water', tile_shallowwater: 'water',
  tile_codpsea: 'water', tile_xbdpsea: 'water', tile_puddle: 'water',
  tile_toxic: 'toxic', tile_toxicroad: 'toxic', tile_toxicwall: 'toxic',
  tile_toxichill: 'toxic', tile_pollution_road: 'toxic', tile_pollution_roadf: 'toxic',
  tile_pollution_wall: 'toxic', tile_corrosion: 'toxic', tile_corrosion_2: 'toxic',
  tile_defbreak: 'toxic', tile_infection: 'toxic', tile_infection_dqq: 'toxic',
  tile_volcano: 'lava', tile_volcano_emp: 'lava', tile_volspread: 'lava',
  tile_steam: 'lava',
  tile_icestr: 'ice', tile_ice: 'ice', tile_icetur_lt: 'ice', tile_icetur_lb: 'ice',
  tile_icetur_rb: 'ice', tile_icetur_rt: 'ice',
  tile_woodrd: 'wood', tile_wooden_wall: 'wood', tile_gazebo: 'wood',
  tile_achand: 'wood', tile_acshop: 'wood',
  tile_grass: 'plant', tile_green: 'plant', tile_reed: 'plant', tile_reedf: 'plant',
  tile_reedw: 'plant', tile_mire: 'plant', tile_flower: 'plant', tile_flowerf: 'plant',
  tile_ftplant_road: 'plant', tile_ftplant_roadf: 'plant', tile_ftplant_wall: 'plant',
  tile_sleep_road: 'dream', tile_sleep_wall: 'dream', tile_magic_circle: 'dream',
  tile_magic_circle_h: 'dream', tile_yinyang_road: 'dream', tile_yinyang_wall: 'dream',
  tile_yinyang_switch: 'dream',
  tile_dygmny_1: 'sui', tile_dygmny_2: 'sui', tile_dygmny_3: 'sui',
};

/** MECHANIC per key: which glyph it carries. Absent means it only looks different. */
const MARKED: Record<string, TileMark> = {
  // Standing on it costs you something.
  tile_toxic: 'hazard', tile_toxicroad: 'hazard', tile_toxicwall: 'hazard',
  tile_toxichill: 'hazard', tile_pollution_road: 'hazard', tile_pollution_roadf: 'hazard',
  tile_pollution_wall: 'hazard', tile_corrosion: 'hazard', tile_corrosion_2: 'hazard',
  tile_defbreak: 'hazard', tile_volcano: 'hazard', tile_volcano_emp: 'hazard',
  tile_volspread: 'hazard', tile_steam: 'hazard', tile_mire: 'hazard',
  tile_quicksand: 'hazard', tile_sleep_road: 'hazard', tile_sleep_wall: 'hazard',
  tile_hole: 'hazard', tile_deepsea: 'hazard',
  // Somewhere else on the map.
  tile_telin: 'portal', tile_telout: 'portal', tile_green: 'portal',
  tile_mpprts_enemy_born: 'portal',
  // Standing on it gives you something.
  tile_healing: 'boon', tile_defup: 'boon', tile_gazebo: 'boon', tile_bigforce: 'boon',
  tile_magic_circle: 'boon', tile_magic_circle_h: 'boon', tile_bnspck_road: 'boon',
  tile_infection: 'boon', tile_yinyang_road: 'boon', tile_yinyang_wall: 'boon',
  tile_character: 'boon', tile_characterf: 'boon', tile_passable_wall: 'boon',
  // Out of sight.
  tile_grass: 'hide', tile_reed: 'hide', tile_reedf: 'hide', tile_reedw: 'hide',
  tile_smog: 'hide',
  // Something you or an enemy can flip.
  tile_grvtybtn: 'switch', tile_yinyang_switch: 'switch', tile_cnvfuse: 'switch',
  tile_cnvfuse_fbd: 'switch',
  // PRTS' own suggestion, which is advice and not terrain.
  tile_rcm_crate: 'hint', tile_rcm_operator: 'hint',
  // Deployable only once it is floating.
  tile_balloon: 'float', tile_balloon_fbd: 'float',
  // A bridge that has to be built or crossed.
  tile_sandrope: 'rope', tile_sandrope_2: 'rope', tile_woodrd: 'rope',
  tile_stairs: 'stairs',
  // Water, which is terrain rather than a mechanism, but the one terrain a reader
  // scanning a map looks for first.
  tile_deepwater: 'water', tile_shallowwater: 'water', tile_codpsea: 'water',
  tile_xbdpsea: 'water', tile_puddle: 'water',
  // Blocks the way without being high ground.
  tile_fence: 'block', tile_fence_bound: 'block',
};

/** The handful whose fill is not a theme shade: spawns, objectives, voids. */
const SPECIALS: Record<string, TileStyle> = {
  tile_forbidden: { fill: 'none', label: null },
  tile_empty: { fill: 'none', label: null },
  tile_hole: { fill: '#0d0d0e', label: 'Hole' },
  tile_start: { fill: '#2e1512', stroke: SPAWN, box: SPAWN, label: 'Enemy spawn' },
  tile_start_cooperate: { fill: '#2e1512', stroke: SPAWN, box: SPAWN, label: 'Enemy spawn' },
  tile_start_dqq: { fill: '#2e1512', stroke: SPAWN, box: SPAWN, label: 'Enemy spawn' },
  tile_ftstart: { fill: '#2e1512', stroke: SPAWN, box: SPAWN, label: 'Enemy spawn' },
  tile_flystart: { fill: '#2e1512', stroke: SPAWN, box: SPAWN, label: 'Air spawn' },
  tile_mpprts_enemy_born: { fill: '#2e1512', stroke: SPAWN, label: 'Enemy spawn' },
  tile_end: { fill: '#14243a', stroke: OBJECTIVE, box: OBJECTIVE, label: 'Protection objective' },
  tile_end_cooperate: { fill: '#14243a', stroke: OBJECTIVE, box: OBJECTIVE, label: 'Protection objective' },
  tile_end_dqq: { fill: '#14243a', stroke: OBJECTIVE, box: OBJECTIVE, label: 'Protection objective' },
  tile_allygoal: { fill: '#14243a', stroke: OBJECTIVE, label: 'Ally objective' },
  tile_enemygoal: { fill: '#2e1512', stroke: SPAWN, label: 'Enemy objective' },
  tile_telin: { fill: '#2a2110', stroke: SPECIAL, label: 'Tunnel entry' },
  tile_telout: { fill: '#2a2110', stroke: SPECIAL, label: 'Tunnel exit' },
  tile_grvtybtn: { fill: '#2a2110', stroke: SPECIAL, label: 'Gravity switch' },
  tile_yinyang_switch: { fill: '#2a2110', stroke: SPECIAL, label: 'Switch' },
  tile_rcm_crate: { fill: '#22301c', stroke: '#7fb069', label: 'Roadblock spot' },
  tile_rcm_operator: { fill: '#22301c', stroke: '#7fb069', label: 'Deploy spot' },
  tile_balloon: { fill: '#1e2a33', stroke: '#5aa9c9', label: 'Levitatable zone' },
  tile_balloon_fbd: { fill: '#18222a', stroke: '#3d7d94', label: 'Levitatable zone' },
  tile_sandrope: { fill: '#33291a', stroke: SPECIAL, label: 'Rope bridge' },
  tile_sandrope_2: { fill: '#2a2216', stroke: '#8a6a2a', label: 'Rope bridge' },
  tile_creep: { fill: '#2f2136', label: 'Corrupted' },
  tile_creepf: { fill: '#231a29', label: 'Corrupted (floor)' },
};

/** "tile_yinyang_road" -> "Yinyang road", for keys not named by the game. */
function prettyTile(k: string): string {
  return String(k)
    .replace(/^tile_/, '')
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Driven by the tables first and the tile's own properties second, so a tile type added
 * in a future update still renders sanely instead of vanishing -- it lands on the stone
 * ramp at the right height with no mark, which is exactly what an unknown tile is.
 */
export function tileStyle(t: StageTileKind): TileStyle {
  const mark = MARKED[t.k];
  const rank = mark ? LEADS[mark] : undefined;
  const special = SPECIALS[t.k];
  if (special) return { ...special, mark: special.mark ?? mark, rank: special.rank ?? rank };

  // Nothing walks or flies over it and it is not named: a void, drawn as an outline.
  if (!t.walk && !t.fly && !THEMED[t.k]) return { fill: 'none', label: prettyTile(t.k) };

  const shades = THEME[THEMED[t.k] ?? 'stone'];
  const fill = t.high ? shades.high : t.build === 'none' || t.build === 'NONE' ? shades.floor : shades.ground;
  return { fill, mark, label: prettyTile(t.k), rank };
}

/**
 * The glyph for a mechanic, as an SVG path inside a tile of side `cell` at (x, y).
 *
 * Small and monochrome on purpose: it says "something happens here, and it is this KIND
 * of something", and the tile's own tooltip carries the game's sentence about what.
 */
export function stageTileMark(mark: TileMark, x: number, y: number, cell: number): string {
  const m = cell / 2;
  const cx = x + m;
  const cy = y + m;
  const r = cell * 0.19;
  switch (mark) {
    // A warning slash pair.
    case 'hazard':
      return `M${cx - r} ${cy - r} l${r * 2} ${r * 2} M${cx + r} ${cy - r} l${-r * 2} ${r * 2}`;
    // An arc going in and coming out elsewhere.
    case 'portal':
      return `M${cx - r} ${cy + r * 0.6} a${r} ${r} 0 1 1 ${r * 2} 0`;
    case 'boon':
      return `M${cx} ${cy - r} v${r * 2} M${cx - r} ${cy} h${r * 2}`;
    // A dashed outline: you are in here but not seen.
    case 'hide':
      return `M${cx - r} ${cy - r * 0.4} h${r * 0.7} M${cx + r * 0.3} ${cy - r * 0.4} h${r * 0.7}`
        + ` M${cx - r} ${cy + r * 0.5} h${r * 0.7} M${cx + r * 0.3} ${cy + r * 0.5} h${r * 0.7}`;
    case 'switch':
      return `M${cx - r} ${cy + r * 0.5} h${r * 2} M${cx + r * 0.4} ${cy - r} l${r * 0.6} ${r * 1.5}`;
    // A tick, for PRTS' recommendation.
    case 'hint':
      return `M${cx - r} ${cy} l${r * 0.8} ${r * 0.8} l${r * 1.2} ${-r * 1.8}`;
    case 'float':
      return `M${cx - r} ${cy + r * 0.7} h${r * 2} M${cx} ${cy + r * 0.2} v${-r}`;
    // Rungs across, for a bridge.
    case 'rope':
      return `M${cx - r} ${cy - r} v${r * 2} M${cx + r} ${cy - r} v${r * 2}`
        + ` M${cx - r} ${cy - r * 0.35} h${r * 2} M${cx - r} ${cy + r * 0.45} h${r * 2}`;
    case 'stairs':
      return `M${cx - r} ${cy + r} h${r} v${-r} h${r} v${-r}`;
    // Two waves.
    case 'water':
      return `M${cx - r} ${cy - r * 0.3} q${r * 0.5} ${-r * 0.5} ${r} 0 q${r * 0.5} ${r * 0.5} ${r} 0`
        + ` M${cx - r} ${cy + r * 0.6} q${r * 0.5} ${-r * 0.5} ${r} 0 q${r * 0.5} ${r * 0.5} ${r} 0`;
    case 'block':
      return `M${cx - r} ${cy - r * 0.5} h${r * 2} M${cx - r} ${cy + r * 0.5} h${r * 2}`;
    default:
      return '';
  }
}

/** One colour per route, so two enemy paths crossing stay tellable apart. */
export const ROUTE_COLORS = ['#4de8d1', '#f5a623', '#f0665a', '#7aa2f7', '#bb9af7', '#9ece6a', '#e0af68', '#2ac3de'];
