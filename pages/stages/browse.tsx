import { useContentUrl, useContentTable } from '@/lib/content/context';
import { ContentImg } from '@/components/content/ContentImage';
import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import StageList from '@/components/stages/StageList';
import { ExpandGlyph, GlyphName, HudBar, HudChip, HudDp, StatLabel } from '@/components/stages/StageHud';
import StageDeployBar, { DeployData, DeployOperator, phaseAt } from '@/components/stages/StageDeployBar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getStageBySlug, getStageSlugs, getStageGeometryFor, getStageEnemyDetails, getStageSiblings, getStageTypeCounts, getStagePreviewFile, getStageEmergency, getStageDevices } from '@/lib/stages/stages';
import { buildPlaybackPaths, buildSchedule, stateAt, PlaybackPath } from '@/lib/stages/stagePlayback';
import { Stage, StageDevice, StageDrop, StageGeometry, StageEnemyDetail, StageEnemyEntry, StageSummary, TileLegend, TYPE_LABELS, RARITY_ORDER, UNRANKED, VARIANT_ORDER, baseFormLabel, rosterRank, variantLabel } from '@/lib/stages/stageTypes';
import tileLegendData from '@/data/stage-tile-legend.json';
import { tileStyle, stageTileMark, ROUTE_COLORS, TileMark } from '@/lib/stages/stageTiles';
import { stageProperties, stageTokens } from '@/lib/stages/stageProperties';
import { getDropIcons } from '@/lib/stages/dropIcon';
import { describeStage } from '@/lib/stages/stageText';

/**
 * The operator catalogue, fetched once per session and shared.
 *
 * Module level rather than per page for two reasons. It survives navigation between
 * stages, so the 96 kB is paid once instead of per map. And it cannot be thrown away
 * half-loaded: an in-component `let live = true` guard -- the usual shape -- discards
 * the response when React unmounts and remounts, which StrictMode does on every mount
 * in development, and the bar then sat on "loading operators" with a 200 in the network
 * log. A shared promise has no such window.
 */
let operatorCache: DeployData | null = null;
let operatorCacheUrl = '';
let operatorPromise: Promise<DeployData | null> | null = null;

function loadOperators(url: string): Promise<DeployData | null> {
  if (operatorCacheUrl !== url) { operatorCacheUrl = url; operatorCache = null; operatorPromise = null; }
  if (operatorCache) return Promise.resolve(operatorCache);
  if (!operatorPromise) {
    operatorPromise = fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<DeployData>) : null))
      .then((json) => { operatorCache = json; return json; })
      .catch(() => {
        // Cleared so a later open tries again rather than being stuck on one bad
        // network moment.
        operatorPromise = null;
        return null;
      });
  }
  return operatorPromise;
}

/** 0 right, 1 down, 2 left, 3 up -- the four ways an operator can be turned. */
type Facing = 0 | 1 | 2 | 3;

const FACING_WORDS = ['right', 'down', 'left', 'up'];

/** The unit vector of a facing, in SCREEN terms: x right, y down. */
function heading(facing: Facing): [number, number] {
  switch (facing) {
    case 1: return [0, 1];
    case 2: return [-1, 0];
    case 3: return [0, -1];
    default: return [1, 0];
  }
}

/**
 * The arrowhead on a deployed operator's ring, on the side it faces -- the amber wedge
 * the game puts outside the pale circle.
 */
function arrowMark(cx: number, cy: number, r: number, facing: Facing): string {
  const [hx, hy] = heading(facing);
  // Across the heading, for the arrow's two back corners.
  const [ax, ay] = [-hy, hx];
  const base = r + 1.5;
  const tip = r + 5.5;
  const half = 4;
  return `M${cx + hx * tip} ${cy + hy * tip}`
    + ` L${cx + hx * base + ax * half} ${cy + hy * base + ay * half}`
    + ` L${cx + hx * base - ax * half} ${cy + hy * base - ay * half} Z`;
}

/**
 * One quarter of the aiming diamond: the 90-degree cone toward a facing.
 *
 * Bounded by the two diagonals through the centre, so the four cones tile the square
 * that the diamond is inscribed in and every point aims at exactly one direction. A
 * click anywhere in the cone counts, which is what makes it forgiving.
 */
function cone(cx: number, cy: number, r: number, facing: Facing): string {
  const [hx, hy] = heading(facing);
  const [ax, ay] = [-hy, hx];
  const far = r;
  return `M${cx} ${cy}`
    + ` L${cx + (hx + ax) * far} ${cy + (hy + ay) * far}`
    + ` L${cx + (hx - ax) * far} ${cy + (hy - ay) * far} Z`;
}

/**
 * The border around a set of covered tiles: only the edges that face a tile outside the
 * set, so the result is one outline of the region rather than a box per tile.
 *
 * Drawn on the tile SLOT -- the cell plus the gap between cells -- so neighbouring
 * edges meet exactly instead of leaving a 2px nick at every seam.
 *
 * Row + 1 is UP on screen, which is why the top edge tests r + 1. Same flip as map.y.
 */
function rangeOutline(
  cells: Set<string>,
  at: { x: (c: number) => number; y: (r: number) => number },
  cell: number,
  gap: number,
): string {
  const slot = cell + gap;
  const parts: string[] = [];
  for (const key of cells) {
    const [c, r] = key.split(',').map(Number);
    const x = at.x(c) - gap / 2;
    const y = at.y(r) - gap / 2;
    if (!cells.has(`${c},${r + 1}`)) parts.push(`M${x} ${y} h${slot}`);
    if (!cells.has(`${c},${r - 1}`)) parts.push(`M${x} ${y + slot} h${slot}`);
    if (!cells.has(`${c - 1},${r}`)) parts.push(`M${x} ${y} v${slot}`);
    if (!cells.has(`${c + 1},${r}`)) parts.push(`M${x + slot} ${y} v${slot}`);
  }
  return parts.join(' ');
}

/** The chevron drawn inside a cone, pointing the way it aims. */
function chevron(cx: number, cy: number, at: number, facing: Facing): string {
  const [hx, hy] = heading(facing);
  const [ax, ay] = [-hy, hx];
  const w = 7;
  const d = 7;
  const bx = cx + hx * at;
  const by = cy + hy * at;
  return `M${bx - hx * d + ax * w} ${by - hy * d + ay * w}`
    + ` L${bx} ${by}`
    + ` L${bx - hx * d - ax * w} ${by - hy * d - ay * w}`;
}

/** An operator under the cursor, on its way to a tile. */
interface Dragging {
  op: DeployOperator;
  /** Viewport coordinates, for the ghost that follows the pointer. */
  x: number;
  y: number;
  /** The tile it would land on, or null over anything that will not take it. */
  over: [number, number] | null;
}

/** A tile that has an operator on it and is waiting for a direction. */
interface Pending {
  op: DeployOperator;
  elite: number;
  col: number;
  row: number;
}

interface Placed {
  key: string;
  op: DeployOperator;
  /** The promotion it was placed at, kept per unit so changing the bar's E-level
   *  does not silently redraw a range the reader already positioned. */
  elite: number;
  col: number;
  row: number;
  facing: Facing;
}

/**
 * A range offset, turned to face a direction. Returns a [col, row] step in the tile
 * grid's own coordinates.
 *
 * The game stores every grid facing RIGHT: `forward` is the way the operator looks,
 * `lateral` is across it.
 *
 * The rotation is worked in the GRID's space, not the screen's, and the two differ:
 * row 0 is the bottom row as drawn in game -- see map.y above, which flips it -- so
 * row grows UPWARD on screen. Rotating as if row grew downward put the range behind
 * the operator on the two turned facings: the wedge pointed down and the covered
 * tiles ran up. Hence facing down being row MINUS forward.
 *
 * The lateral sign is unobservable today -- all 35 ranges any operator uses are
 * symmetric across the forward axis -- but it is written the way the grid means it
 * rather than the way that happens not to show.
 */
function turn(forward: number, lateral: number, facing: Facing): [number, number] {
  switch (facing) {
    case 1: return [lateral, -forward];        // down the screen
    case 2: return [-forward, -lateral];       // left
    case 3: return [-lateral, forward];        // up the screen
    default: return [forward, lateral];        // right, as stored
  }
}

interface StageDetailData {
  stage: Stage;
  geometry: StageGeometry | null;
  /** Set when the map above is the base form's, not this stage's own. */
  borrowedGeometryFrom: string | null;
  /** enemy slug -> icon, stats, flavour text, abilities. */
  enemyDetails: Record<string, StageEnemyDetail>;
  /** drop item id -> icon path. Operator rewards resolve to operator art. */
  dropIcons: Record<string, string>;
  /** The file in public/stages-images/, or null when the game has no render. */
  previewFile: string | null;
  /** The Emergency Ops form of an IS node: its own render and condition. */
  emergency: { render: string; condition: string } | null;
  /** Towers, pillars, crates and supplied operators already on the field. */
  devices: StageDevice[];
  /** The pathfound routes the waves use. The schedule over them is derived in the
   *  browser -- see buildSchedule. */
  playbackPaths: Record<number, PlaybackPath>;
  /** This stage's own forms -- Normal, Challenge, Adverse -- for the toggle. */
  family: StageSummary[];
}

interface Props {
  /** Enough rail rows to paint immediately; the full index arrives on mount. */
  stages: StageSummary[];
  typeCounts: Record<string, number>;
  /** The build's clock, in unix seconds. */
  now: number;
  /** What the page opens on when the URL names no stage. */
  firstSlug: string;
}

/**
 * The game's names and descriptions for tile types -- 77 keys, 10.4 kB, the same on
 * every stage in the game.
 *
 * Imported rather than passed through getStaticProps, which is where it used to come
 * from: identical props are not free, they are copied into all 3,786 stage payloads.
 * That one was 10.4 kB per page and 39 MB of the static export, re-downloaded on
 * every stage-to-stage navigation. As an import it lands in the route's own JS chunk,
 * which the browser fetches once and caches.
 */
const defaultTileLegend = tileLegendData as TileLegend;

const CELL = 34;
const GAP = 2;
const PAD = 16;

/** A dozen paths on a map is still readable where forty is a scribble, so a map
 *  above this opens with its paths down rather than painting 66 polylines. 478 of
 *  3,786 pages start that way. Past ROUTE_COLORS.length (8) the colours repeat, so
 *  a busy map is not a colour legend either -- which is why there is one control
 *  for all the lines and none per route. */
const ROUTE_LINE_LIMIT = 20;

function StageDetailPanel({ stage, geometry, borrowedGeometryFrom, enemyDetails, dropIcons, previewFile, emergency, devices, playbackPaths, family, now }: StageDetailData & { now: number }) {
  /* The spawn schedule, built here rather than shipped.
   *
   * Every field of it -- the times, the enemy, the route, the speed -- is a function
   * of geometry.waves and the roster's move speeds, both of which are already props,
   * so shipping it too was 44 kB of the heaviest page saying what the page could
   * work out. No pathfinding happens here: the paths came with the page.
   *
   * Computed in a memo rather than an effect so the server render and the first
   * client render produce the same thing -- showRoutes' initial state reads the path
   * count, and a mismatch there is a hydration error. */
  const playback = useMemo(() => {
    const speedByEnemy: Record<string, number> = {};
    for (const d of Object.values(enemyDetails)) {
      if (d.moveSpeed != null) speedByEnemy[d.name] = d.moveSpeed;
    }
    return buildSchedule(geometry, speedByEnemy, playbackPaths);
  }, [geometry, enemyDetails, playbackPaths]);
  // Playback clock, in seconds from the start of the battle. Driven by rAF while
  // playing; the scrubber writes it directly.
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  // How fast the clock runs. 1x is real time -- a second of the fight per second --
  // which for a three-minute stage is three minutes of watching.
  const [rate, setRate] = useState(1);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!playing || !playback) return;
    // The frame delta is measured HERE, in the callback, and never read from a ref
    // inside the setTime updater. React runs an updater at dispatch time only while
    // that hook's queue is empty; for a once-per-frame update the condition
    // alternates, because a deferred frame produced no state change, so the render
    // bailed out and cleared the stale lane, making the next dispatch eager again.
    // On every deferred frame the updater ran AFTER this callback had already
    // stored `now`, so its delta was exactly 0 and that frame's real time was lost.
    // Strict every-other-frame alternation, so 1x ran at half speed: measured 0.49
    // seconds of fight per second of real time. It is now 1.00.
    let previous: number | null = null;
    const step = (now: number) => {
      const delta = previous == null ? 0 : (now - previous) / 1000;
      previous = now;
      if (delta > 0) setTime((t) => Math.min(playback.duration, t + delta * rate));
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [playing, playback, rate]);

  // Stopping is its own effect rather than a setPlaying call inside the updater,
  // which React may run twice.
  useEffect(() => {
    if (playing && playback && time >= playback.duration) setPlaying(false);
  }, [playing, playback, time]);

  /**
   * Fullscreen, on the map section.
   *
   * The standard API only. Safari has taken it unprefixed since 16.4, and where it is
   * missing it is missing for good -- iOS Safari gives fullscreen to <video> and to
   * nothing else -- so the button is not rendered rather than rendered and inert.
   * `fullscreenEnabled` is read after mount because the server cannot know it, and
   * rendering the button on the server and not on the client is a hydration mismatch.
   *
   * The state comes from the fullscreenchange EVENT rather than from the click, so Esc
   * and the browser's own chrome put the arrows back the right way round.
   */
  const simulator = useRef<HTMLElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  useEffect(() => {
    setCanFullscreen(!!document.fullscreenEnabled);
    const sync = () => setFullscreen(document.fullscreenElement === simulator.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggleFullscreen = useCallback(() => {
    // Rejected promises are swallowed: a browser may refuse -- a permissions policy, or
    // a gesture it did not consider a gesture -- and an unhandled rejection in a click
    // handler is noise in the console over a button that simply did not fire.
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void simulator.current?.requestFullscreen().catch(() => {});
  }, []);

  /**
   * Deploying an operator on the map: which promotion, who is armed, and who is placed.
   *
   * The catalogue is fetched rather than imported -- 78 kB of operators has no business
   * in the bundle of a page most readers open to look at a map -- and only once, the
   * first time the bar is shown, which today means the first time fullscreen is opened.
   */
  const contentUrl = useContentUrl();
  const tileLegend = useContentTable('stage-tile-legend', defaultTileLegend);
  const [deployData, setDeployData] = useState<DeployData | null>(() => operatorCacheUrl === contentUrl('/operator-deploy.json') ? operatorCache : null);
  const [elite, setElite] = useState(2);
  const [armed, setArmed] = useState<DeployOperator | null>(null);
  const [placed, setPlaced] = useState<Placed[]>([]);
  /* Its own control rather than a side effect of fullscreen. iOS Safari grants
     fullscreen to <video> and nothing else, so gating the bar on it meant the whole
     feature was unreachable on a phone -- and on any desktop browser where fullscreen
     is refused. */
  const [deployOpen, setDeployOpen] = useState(false);
  const wantOperators = deployOpen;
  useEffect(() => {
    if (!wantOperators || deployData) return;
    loadOperators(contentUrl('/operator-deploy.json')).then((json) => { if (json) setDeployData(json); });
  }, [wantOperators, deployData, contentUrl]);

  /**
   * Dragging an operator out of the bar, and the direction picker that follows.
   *
   * The game's order, and the reason it is two steps: an operator's facing is half of
   * where you put it, so the drop chooses the tile and the picker chooses the way it
   * looks. `dragging` is the portrait under the cursor; `pending` is a tile waiting for
   * a direction. Nothing is placed until a direction is chosen, and Escape or the
   * Cancel mark drops it.
   */
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  /**
   * The deployed operator being looked at: its range outlined, and a retreat mark over
   * it. Clicking one selects it, clicking anywhere else puts it away, and the mark is
   * the only thing that removes anything -- so a stray click can never cost you a
   * placement.
   */
  const [selected, setSelected] = useState<string | null>(null);
  const undeploy = useCallback((key: string) => {
    setPlaced((list) => list.filter((p) => p.key !== key));
    setSelected(null);
  }, []);

  /** The tiles the SELECTED operator covers, for the border drawn around them. */
  const selectedCells = useMemo(() => {
    const unit = placed.find((p) => p.key === selected);
    const out = new Set<string>();
    if (!unit || !deployData) return out;
    const grid = deployData.ranges[phaseAt(unit.op, unit.elite).range] || [];
    for (const [forward, lateral] of grid) {
      const [dc, dr] = turn(forward, lateral, unit.facing);
      out.add(`${unit.col + dc},${unit.row + dr}`);
    }
    return out;
  }, [placed, selected, deployData]);

  /** Every tile any placed operator covers, and who covers it. */
  const covered = useMemo(() => {
    const out = new Map<string, string[]>();
    if (!deployData) return out;
    for (const unit of placed) {
      const grid = deployData.ranges[phaseAt(unit.op, unit.elite).range] || [];
      for (const [forward, lateral] of grid) {
        const [dc, dr] = turn(forward, lateral, unit.facing);
        const at = `${unit.col + dc},${unit.row + dr}`;
        const who = out.get(at);
        if (who) who.push(unit.key); else out.set(at, [unit.key]);
      }
    }
    return out;
  }, [placed, deployData]);


  const scrub = useCallback((value: number) => {
    setPlaying(false);
    setTime(value);
  }, []);

  // Who is on the field right now, where, and whether they are standing still.
  const live = useMemo(() => {
    if (!playback) return [];
    return playback.spawns
      .map((sp, i) => {
        const path = playback.paths[sp.routeIndex];
        if (!path) return null;
        const state = stateAt(path, sp, time);
        return state.pos
          ? {
              key: `${i}-${sp.enemy}`,
              enemy: sp.enemy,
              pos: state.pos,
              routeIndex: sp.routeIndex,
              waitRemaining: state.waitRemaining,
            }
          : null;
      })
      .filter(
        (x): x is { key: string; enemy: string; pos: [number, number]; routeIndex: number; waitRemaining: number | null } =>
          x !== null
      );
  }, [playback, time]);

  // Which enemy rows are expanded. Collapsed by default: a stage can field 40
  // enemies and the flavour text alone would bury the map.
  const [openEnemies, setOpenEnemies] = useState<Set<string>>(new Set());
  /** The game's briefing: its render of the stage, the description and the drops.
   *  Forced on where there is no schematic, since that is all the section has. */
  const [briefingOpen, setBriefingOpen] = useState(false);
  /** The legend, over the map rather than under it. */
  const [legendOpen, setLegendOpen] = useState(false);
  /** The tile whose description is open, in [col, row]. */
  const [openTile, setOpenTile] = useState<[number, number] | null>(null);
  const tilePopRef = useRef<HTMLDivElement>(null);
  const mapWrapRef = useRef<HTMLDivElement>(null);
  // Which form of an Integrated Strategies node is being read. Both forms are the
  // same level file -- what differs is the render and the condition -- so this
  // switches in place rather than being a route of its own the way Challenge Mode
  // and Adverse Combat are.
  const [emergencyOn, setEmergencyOn] = useState(false);
  const shownPreview = emergencyOn && emergency ? emergency.render : previewFile;
  // A crowded map should not paint 66 polylines and then have them turned off:
  // `playback` comes out of a memo over props, so server and client agree on this and
  // there is no hydration flash.
  const [showRoutes, setShowRoutes] = useState(
    () => Object.keys(playback?.paths || {}).length <= ROUTE_LINE_LIMIT
  );

  const map = useMemo(() => {
    if (!geometry?.tileGrid?.length) return null;
    const rows = geometry.rows;
    const cols = geometry.cols;
    return {
      rows,
      cols,
      width: cols * (CELL + GAP) - GAP + PAD * 2,
      height: rows * (CELL + GAP) - GAP + PAD * 2,
      x: (c: number) => PAD + c * (CELL + GAP),
      // The pipeline states its own orientation: row 0 is the BOTTOM row as
      // drawn in game (see geometry.coordinate_system), so drawing top-down
      // means flipping it here rather than trusting the array order.
      y: (r: number) => PAD + (rows - 1 - r) * (CELL + GAP),
    };
  }, [geometry]);

  // A tile map to draw, versus the game's own photograph. A stage can have the
  // photo and no schematic (a variant borrowing its base's render), so "showing
  // the photo" is not the same as "the reader pressed In-game view".
  const hasSchematic = Boolean(map && geometry);

  /**
   * Where a pointer is, in the map's own coordinates.
   *
   * getScreenCTM is the browser's own answer to "where is this client point inside my
   * viewBox", so it survives whatever the svg is scaled or letterboxed to. The first
   * version of this asked the DOM instead -- elementFromPoint, then closest() for a
   * data attribute -- and that fails wherever something painted sits above the tiles:
   * a route polyline's STROKE is hit-testable, so dragging over a drawn path returned
   * the path and the drop found no tile at all.
   */
  const mapSvg = useRef<SVGSVGElement | null>(null);
  const localAt = useCallback((clientX: number, clientY: number) => {
    const svg = mapSvg.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const local = point.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }, []);

  /** The tile under a pointer, and what it will take, or null off the grid. */
  const cellAt = useCallback((clientX: number, clientY: number) => {
    if (!map || !geometry) return null;
    const local = localAt(clientX, clientY);
    if (!local) return null;
    const col = Math.floor((local.x - PAD) / (CELL + GAP));
    // The drawn row, flipped back: row 0 is the bottom one. Same flip as map.y.
    const row = map.rows - 1 - Math.floor((local.y - PAD) / (CELL + GAP));
    if (col < 0 || row < 0 || col >= map.cols || row >= map.rows) return null;
    const tile = geometry.tileLegend[geometry.tileGrid[row]?.[col] ?? -1];
    return tile ? { col, row, takes: tile.deployable } : null;
  }, [map, geometry, localAt]);

  /**
   * Whether a tile takes this operator -- the game's melee/ranged rule.
   *
   * The value is the pipeline's own: none, melee, ranged, or ANY. It was checked
   * against 'all' at first, which is not a value the data ever holds, so every
   * take-anything tile silently refused every operator.
   */
  const tileTakes = useCallback((takes: string, op: DeployOperator | null) => {
    if (!op) return false;
    return takes === 'any' || takes === op.reach;
  }, []);

  const beginPlace = useCallback((op: DeployOperator, col: number, row: number, takes: string) => {
    if (!tileTakes(takes, op)) return false;
    setPending({ op, elite: Math.min(elite, op.phases.length - 1), col, row });
    setAim(null);
    setArmed(null);
    setOpenTile(null);
    setLegendOpen(false);
    // Placing something else supersedes whatever was being looked at.
    setSelected(null);
    return true;
  }, [elite, tileTakes]);

  /**
   * Aiming: the direction under the pointer while the picker is open, or null for the
   * middle, which is the cancel.
   *
   * The game's gesture is a drag out of the centre -- "drag to central area to cancel"
   * -- so this follows the pointer whether a button is held or not, and the release
   * takes whatever it is on. A plain click lands as a press and a release on the same
   * spot, so it works out to the same thing without a special case.
   */
  const [aim, setAim] = useState<Facing | null>(null);
  const aimAt = useCallback((clientX: number, clientY: number, at: Pending) => {
    const local = localAt(clientX, clientY);
    if (!local || !map) return null;
    const dx = local.x - (map.x(at.col) + CELL / 2);
    const dy = local.y - (map.y(at.row) + CELL / 2);
    // The middle is the cancel, and it has to be big enough to hit deliberately.
    if (Math.hypot(dx, dy) < CELL * 0.55) return null;
    // The dominant axis, which is the same as picking the 90-degree cone.
    if (Math.abs(dx) >= Math.abs(dy)) return (dx > 0 ? 0 : 2) as Facing;
    return (dy > 0 ? 1 : 3) as Facing;
  }, [localAt, map]);

  const confirmPlace = useCallback((facing: Facing) => {
    setPending((p) => {
      if (!p) return null;
      setPlaced((list) => [
        // One operator to a tile: dropping onto an occupied tile replaces what was
        // there, which is what the game does too.
        ...list.filter((u) => u.col !== p.col || u.row !== p.row),
        { key: `${p.op.id}@${p.col},${p.row}`, op: p.op, elite: p.elite, col: p.col, row: p.row, facing },
      ]);
      return null;
    });
  }, []);

  // Escape gets out of either step, which is what a reader will try first.
  useEffect(() => {
    if (!pending && !dragging && !selected && !armed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      dragRef.current = null;
      setArmed(null);
      setAim(null);
      setPending(null);
      setDragging(null);
      setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, dragging, selected, armed]);

  /**
   * The drag itself.
   *
   * On window rather than on the tiles: a pointer that leaves the map still has to keep
   * the ghost with it, and the drop is resolved by asking the document what is under the
   * pointer rather than by every tile listening for a drag it will mostly not receive.
   *
   * Installed ONCE and reading a ref, not re-installed whenever the drag state changes.
   * The state changes on every pointermove, so effect-per-state tore the listeners down
   * and put them back between events -- and a pointerup landing in that gap was simply
   * lost, which is a drag that never finishes.
   */
  /* The ref is AUTHORITATIVE, written by the move handler itself -- not a mirror of the
     state assigned at render. Mirroring lags: the last pointermove sets the state, and a
     release before React has re-rendered read the previous `over`, which on a quick drop
     is null. That is a drag that lands on a tile and does nothing. */
  const dragRef = useRef<Dragging | null>(null);
  const beginPlaceRef = useRef(beginPlace);
  beginPlaceRef.current = beginPlace;
  const tileTakesRef = useRef(tileTakes);
  tileTakesRef.current = tileTakes;
  const cellAtRef = useRef(cellAt);
  cellAtRef.current = cellAt;

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const held = dragRef.current;
      if (!held) return;
      const cell = cellAtRef.current(e.clientX, e.clientY);
      const over: [number, number] | null =
        cell && tileTakesRef.current(cell.takes, held.op) ? [cell.col, cell.row] : null;
      dragRef.current = { ...held, x: e.clientX, y: e.clientY, over };
      setDragging(dragRef.current);
    };
    const up = (e: PointerEvent) => {
      const held = dragRef.current;
      if (!held) return;
      dragRef.current = null;
      // Resolve the release itself: a fast final move can outrun the hover state.
      const cell = cellAtRef.current(e.clientX, e.clientY);
      if (cell && tileTakesRef.current(cell.takes, held.op)) beginPlaceRef.current(held.op, cell.col, cell.row, cell.takes);
      setDragging(null);
    };
    const cancel = () => { dragRef.current = null; setDragging(null); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
    };
  }, []);


  const legend = useMemo(() => {
    if (!geometry) return [];
    const seen = new Set<string>();
    const out: { label: string; fill: string; stroke?: string; high: boolean; mark?: TileMark; rank: number }[] = [];
    geometry.tileLegend.forEach((t, at) => {
      const st = tileStyle({ k: t.key, high: t.height === 'high', build: t.deployable, walk: t.walkable, fly: t.flyable });
      const named = tileLegend[t.key]?.name;
      const label = named || st.label;
      if (!label || seen.has(label)) return;
      seen.add(label);
      out.push({
        label,
        fill: st.fill,
        stroke: st.stroke,
        high: t.height === 'high',
        mark: st.mark,
        // Ranked tiles lead; everything else keeps the order the map declares them in,
        // offset past them.
        rank: st.rank ?? 100 + at,
      });
    });
    // Water and the deployables first: they decide where a squad can go at all, so on a
    // map that has them they are the first thing the legend should say.
    return out.sort((a, b) => a.rank - b.rank);
  }, [geometry, tileLegend]);

  const drops = useMemo(() => {
    const byRarity = (a: { rarity: string | null }, b: { rarity: string | null }) =>
      RARITY_ORDER.indexOf(a.rarity || '') - RARITY_ORDER.indexOf(b.rarity || '');
    // Event currency is listed apart from the rest. It is a real drop in the
    // stage's data, but only while its event was running: 16-16 hands out Flint
    // (item act3mainss_token, the Episode 16 release campaign's token), which
    // reads as a first-clear reward you could still collect and is not one.
    // 1,832 drop rows across 1,770 event stages and 62 main ones are like this.
    // ACTIVITY_ITEM is most of it, but not all: the Dossoles Holiday coins are
    // typed CHARM (charm_coin_1..3) and the Obsidian Pass is ET_STAGE, and both
    // are event-scoped tokens that read as a first-clear reward you could still
    // go and collect. Leaving them out kept 9 stages showing the same coin twice.
    // CARD_EXP and MATERIAL also list an item twice on one stage each, but those
    // are ordinary items genuinely available both ways, which is worth saying.
    const currency = (d: StageDrop) => d.raw?.type === 'ACTIVITY_ITEM'
      || d.raw?.type === 'CHARM' || d.raw?.type === 'ET_STAGE';
    // One card per item within a group. 549 stages list their event token twice --
    // once as a farmable drop and once as the completion reward -- which folding
    // the two into one Event currency group turned into two identical cards.
    //
    // The farmable row is the one worth keeping: it is the drop a reader looking at
    // this group is asking about, and a completion reward pays once. This used to
    // prefer the row carrying a measured Penguin rate, which came to the same thing,
    // because a rate was only ever attached to a farmable row.
    const byItem = (drops: StageDrop[]) => {
      const out = new Map<string, StageDrop>();
      for (const drop of drops) {
        const seen = out.get(drop.item.id);
        if (!seen || (seen.kind !== 'farmable' && drop.kind === 'farmable')) out.set(drop.item.id, drop);
      }
      return [...out.values()];
    };
    // The main drop is the one the game files as the stage's REGULAR drop, and
    // drop_type is the only field that says why a row is there -- rarity is just
    // occPercent restated. `includes`, not equality: 193 rows read
    // ["ADDITIONAL","NORMAL"] and 4-6's Orirock Cluster is one of them, so an
    // equality test loses the main drop on exactly the stages people farm.
    // Checked against the community's farm targets: 1-7 Orirock Cube, 4-6 Orirock
    // Cluster, 11-8 Semi-Synthetic Solvent, 9-19 RMA70-12, 13-5 Fuscous Fiber.
    const farmable = byItem(stage.drops.filter((d) => !currency(d) && d.kind === 'farmable')).sort(byRarity);
    const mainIds = new Set(
      farmable.filter((d) => (d.raw?.drop_type || []).includes('NORMAL')).map((d) => d.item.id)
    );
    // Nothing to point at when every row is a main drop, which is 349 stages (the
    // T1 supply stages tag all six), or when there is only one row anyway (158).
    // That leaves 474 stages where the highlight actually distinguishes something.
    const highlightMain = mainIds.size > 0 && mainIds.size < farmable.length;
    const groups = [
      {
        title: 'Farmable',
        hint: highlightMain
          ? (mainIds.size === 1 ? "The highlighted row is this stage's main drop" : 'The highlighted rows are this stage\u2019s main drops')
          : (null as string | null),
        mainIds: highlightMain ? mainIds : new Set<string>(),
        drops: farmable,
      },
      {
        title: 'First clear only',
        hint: null as string | null,
        mainIds: new Set<string>(),
        drops: byItem(stage.drops.filter((d) => !currency(d) && d.kind !== 'farmable')).sort(byRarity),
      },
      {
        title: 'Event currency',
        hint: 'Only obtainable while the event was running',
        mainIds: new Set<string>(),
        drops: byItem(stage.drops.filter(currency)).sort(byRarity),
      },
    ];
    return groups.filter((g) => g.drops.length > 0);
  }, [stage]);

  const properties = useMemo(() => stageProperties(geometry, tileLegend), [geometry, tileLegend]);
  const tokens = useMemo(() => stageTokens(geometry), [geometry]);

  // The pre-placed units, grouped for the properties list: a map with eight
  // crates should read "Roadblock x8", not eight lines.
  const deviceGroups = useMemo(() => {
    const byName = new Map<string, { name: string; description: string | null; kind: string; count: number }>();
    for (const d of devices) {
      const seen = byName.get(d.name);
      if (seen) seen.count += 1;
      else byName.set(d.name, { name: d.name, description: d.description, kind: d.kind, count: 1 });
    }
    return [...byName.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [devices]);

  // Every form of this stage -- Normal, Challenge Mode, Adverse Environment,
  // Story, 6-star -- as a toggle, rather than each form being its own row in the
  // list beside it. They all share a content group, so the siblings this page
  // already ships carry them.
  /* Ordered by the emitter -- see familyOf in scripts/build-stage-details.ts. */

  /** Detail by NAME as well as by slug. A stage's enemy list carries rows with a
   *  null slug -- ones its own data never links to a handbook entry -- and those
   *  can only be found by what they are called. */
  const detailByName = useMemo(() => {
    const m: Record<string, StageEnemyDetail> = {};
    for (const d of Object.values(enemyDetails)) if (d.name) m[d.name] = d;
    return m;
  }, [enemyDetails]);

  // What this family calls its base form: Normal for most, Variation 1 for an
  // Integrated Strategies node, Basic Trial for a Trials for Navigator trial. The
  // vocabulary is in stageTypes beside the rest of it.
  const baseLabel = baseFormLabel(family.map((f) => f.variant?.kind));

  // The roster, one card per enemy per rank.
  //
  // An enemy can hold BOTH certain and conditional spawns -- upstream counts
  // conditional ones apart because a hidden group, a weighted pick or a branch
  // may never fire (arkpedia-database build_stages.py count_spawns), not because
  // they are different enemies. Rendering the two blocks as separate groups is
  // what printed Mudrock and Mudrock Colossus twice on CC2 02-02. Merging them
  // keeps the distinction on the card instead: "x1 -- 1 conditional".
  //
  // Both blocks also carry an `unranked` list -- props, summons, stage-local
  // things the handbook gives no rank (490 stage blocks have one, and 14-2's
  // Active Originium Storm is in it). They count toward the total, and were
  // being dropped entirely.
  const enemyGroups = useMemo(() => {
    const ranks = new Map<string, Map<string, { entry: StageEnemyEntry; certain: number; conditional: number }>>();
    const add = (rank: string, entry: StageEnemyEntry, conditional: boolean) => {
      let slot = ranks.get(rank);
      if (!slot) {
        slot = new Map();
        ranks.set(rank, slot);
      }
      const key = entry.slug || entry.name || 'unknown';
      const n = entry.count || 0;
      const cur = slot.get(key);
      if (!cur) {
        slot.set(key, { entry, certain: conditional ? 0 : n, conditional: conditional ? n : 0 });
        return;
      }
      if (conditional) cur.conditional += n;
      else cur.certain += n;
      // Whichever listing carries the in-stage label is the one worth keeping.
      if (!cur.entry.index && entry.index) cur.entry = entry;
    };
    const eat = (
      block: { by_rank?: Record<string, StageEnemyEntry[]>; unranked?: StageEnemyEntry[] } | null | undefined,
      conditional: boolean
    ) => {
      for (const [rank, list] of Object.entries(block?.by_rank || {})) {
        for (const e of list || []) add(rank, e, conditional);
      }
      for (const e of block?.unranked || []) add(UNRANKED, e, conditional);
    };
    eat(stage.enemies, false);
    eat(stage.enemies?.conditional, true);
    return [...ranks.entries()]
      .filter(([, slot]) => slot.size > 0)
      .sort(([a], [b]) => rosterRank(a) - rosterRank(b))
      .map(([title, slot]) => ({ key: title, title, list: [...slot.values()] }));
  }, [stage]);

  /**
   * The roster in two halves: what the stage always fields, and what it only may.
   *
   * A conditional spawn sits behind a hidden group, a weighted pick or a branch, so it
   * may never fire -- the difference between two runs of the same stage. It was noted
   * per card before ("x3 conditional"), which put a maybe and a certainty in one list
   * and left the reader to spot the word.
   *
   * An enemy is in ONE half only: with any certain spawn at all it is in Always, and
   * its conditional extras are noted on the card. Listing it twice is what printed
   * Mudrock and Mudrock Colossus twice on CC2 02-02, and the fix is not to undo it.
   *
   * The heading only appears where there is something to divide: on a stage with no
   * conditional spawns -- most of them -- this is the plain rank list it always was.
   */
  const enemySections = useMemo(() => {
    const half = (certain: boolean) => enemyGroups
      .map((g) => ({ ...g, list: g.list.filter((e) => (certain ? e.certain > 0 : e.certain === 0)) }))
      .filter((g) => g.list.length > 0);
    const may = half(false);
    if (!may.length) return [{ key: 'always', title: null, groups: half(true) }];
    return [
      { key: 'always', title: 'Always appears', groups: half(true) },
      { key: 'may', title: 'May appear', groups: may },
    ];
  }, [enemyGroups]);

  // Entries carry a count each, and they normally sum to the declared total --
  // on 278 stages they do not, and on 15 of those the roster is empty. Better to
  // say the data is short than to print a total over a list that misses it.
  const enemyTotals = useMemo(() => {
    const certain = stage.enemies?.total || 0;
    const conditional = stage.enemies?.conditional?.total || 0;
    const named = enemyGroups.reduce(
      (n, g) => n + g.list.reduce((m, e) => m + e.certain + e.conditional, 0),
      0
    );
    return { certain, conditional, declared: certain + conditional, named };
  }, [stage, enemyGroups]);

  // The stage's own numbers. They read as the map's HUD, laid out where the game
  // puts them, and fall back to a plain row on the stages that have no map at
  // all -- an empty string means the dataset does not state it.
  const hud = {
    sanity: stage.sanity_cost ? String(stage.sanity_cost) : '',
    exp: stage.exp ? String(stage.exp) : '',
    lmd: stage.lmd ? String(stage.lmd) : '',
    recommended: stage.difficulty?.recommended_level || '',
    limit: stage.battle?.unit_limit != null ? String(stage.battle.unit_limit) : '',
    life: stage.battle?.max_life != null ? String(stage.battle.max_life) : '',
    dp: stage.battle?.initial_dp != null ? String(stage.battle.initial_dp) : '',
    // Conditional spawns are shown as an addition rather than folded into the
    // count, because they may never fire -- but a stage whose whole roster is
    // conditional would otherwise read "0".
    enemies: enemyTotals.declared
      ? enemyTotals.conditional
        ? `${enemyTotals.certain} +${enemyTotals.conditional}`
        : String(enemyTotals.certain)
      : '',
  };

  /**
   * DP as the clock's own function, not a counter of its own.
   *
   * The game grants one point per recovery interval, so the reading at time t is the
   * initial DP plus however many intervals have gone by, stopped where the stage stops
   * it. Derived rather than accumulated, which buys three things: scrubbing backwards
   * counts it DOWN with no extra code, changing the rate or pausing cannot drift it out
   * of step with the fight, and the figure is right at any point on the scrubber rather
   * than only for a run watched from the start.
   *
   * The INTERVAL divides, not the rate: dp_per_second is 1/interval rounded to six
   * places, so a 3-second stage reads 0.333333 and floor(3 * 0.333333) is 0 when it
   * should be 1. The interval is what the game stores, and it divides exactly.
   */
  const dpNow = useMemo(() => {
    const b = stage.battle;
    if (b?.initial_dp == null) return null;
    const interval = b.dp_recovery_interval_seconds;
    const gained = interval && interval > 0 ? Math.floor(time / interval) : 0;
    const raw = b.initial_dp + gained;
    // 99 on nearly every stage, but 999 on 57 of them and 500 on one, so it comes from
    // the stage rather than from a constant here.
    return b.max_dp != null ? Math.min(raw, b.max_dp) : raw;
  }, [stage.battle, time]);

  /**
   * How many have turned up by now, over how many the MAP will show.
   *
   * The game's counter is defeated-over-total; ours is arrived-over-total, because
   * nothing here simulates a kill. The spawns are sorted, so this is a scan to the first
   * one still in the future.
   *
   * The denominator is the schedule's own length, NOT the stage's enemy count, and the
   * difference is the whole point. A level file's waves mark spawns three ways the
   * playback cannot honour: hiddenGroup, which fires on a condition; randomSpawnGroupKey,
   * where the game picks one group; and randomSpawnGroupPackKey, where it picks a pack.
   * The geometry keeps only the unconditional, non-random spawns, because an animation
   * cannot show an enemy that may not come. On ISW-NO To Market Variation 2 that is 26
   * of 57 -- so a counter reading 26/44 looked broken while both numbers were right
   * about different populations. Over the schedule it reads 26/26 and closes.
   *
   * What the stage fields in full is still stated, under the enemy list below.
   */
  const arrived = useMemo(() => {
    if (!playback) return 0;
    let n = 0;
    while (n < playback.spawns.length && playback.spawns[n].at <= time) n += 1;
    return n;
  }, [playback, time]);

  /** How many the schedule holds, and whether that is fewer than the stage fields. */
  const staged = playback?.spawns.length ?? 0;
  const heldBack = Math.max(0, enemyTotals.certain + enemyTotals.conditional - staged);

  const stats = [
    { label: 'Sanity', value: hud.sanity || '--', icon: 'sanity' as const },
    { label: 'EXP', value: hud.exp || '--' },
    { label: 'LMD', value: hud.lmd || '--' },
    { label: 'Recommended', value: hud.recommended || '--' },
    { label: 'Deploy limit', value: hud.limit || '--', icon: 'squad' as const },
    { label: 'Life points', value: hud.life || '--' },
    { label: 'Initial DP', value: hud.dp || '--', icon: 'cost' as const },
    { label: 'Enemies', value: hud.enemies || '--' },
  ];

  // Only routes with a usable path -- placeholders and routes no spawn uses
  // would otherwise get a chip that toggles nothing.
  const routeIndices = useMemo(
    () => Object.keys(playback?.paths || {}).map(Number).sort((a, b) => a - b),
    [playback]
  );

  // Whether anything would actually be drawn. The same test the polylines use, so
  // the control cannot offer to hide lines that were never there: 53 maps have no
  // spawn naming a route at all, and 3 more spawn their enemies on a standing tile
  // where start == end, so a route exists but covers no ground.
  const drawablePaths = useMemo(
    () => routeIndices.some((i) => (playback?.paths?.[i]?.points?.length || 0) >= 2),
    [playback, routeIndices]
  );

  const description = useMemo(() => describeStage(stage.description), [stage.description]);

  // What the briefing has to show. A stage with no schematic has nothing else the
  // section can show, so it opens on the briefing rather than on a bare photo --
  // which is what those 231 pages used to be.
  const hasBriefing = Boolean(shownPreview) || description.length > 0 || drops.length > 0;
  const showingBriefing = hasBriefing && (briefingOpen || !hasSchematic);

  /*
   * The detail column's tallest seen height, held as a floor.
   *
   * Switching to the briefing drops the playback controls AND the enemy roster --
   * the roster on purpose, since the game's stage screen has no roster on it -- so
   * the column lost 400px, the document shrank with it, and the browser clamped the
   * scroll. Everything above then rose in the viewport: the stage rail beside it
   * appeared to jump up by the difference. Reserving the height it has already had
   * means a toggle can only ever grow the page, never shorten it, so there is
   * nothing to clamp.
   *
   * Reset per stage, not per toggle -- another stage is a different page's worth of
   * content and should not inherit this one's floor.
   */
  const detailColRef = useRef<HTMLDivElement | null>(null);
  const [reservedDetailHeight, setReservedDetailHeight] = useState<number | null>(null);
  useEffect(() => { setReservedDetailHeight(null); }, [stage.slug]);
  useEffect(() => {
    const el = detailColRef.current;
    if (!el) return;
    // Measured after paint, so it is the height this state actually produced.
    const measure = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setReservedDetailHeight((prev) => (prev == null || h > prev ? h : prev));
    };
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [showingBriefing, emergencyOn, legendOpen, showRoutes, stage.slug]);

  // The units standing on each tile, so a click anywhere on the tile can name
  // them. A tile can hold more than one: 41 maps stack a device and a supplied
  // operator on the same square.
  const devicesByTile = useMemo(() => {
    const at = new Map<string, StageDevice[]>();
    for (const d of devices) {
      const key = `${d.col},${d.row}`;
      const seen = at.get(key);
      if (seen) seen.push(d);
      else at.set(key, [d]);
    }
    return at;
  }, [devices]);

  // The tile the reader clicked, resolved to what the map says about it.
  /**
   * Dismiss the tile description on a press anywhere else.
   *
   * Clicking a tile opened it and clicking that same tile closed it again, which
   * only helps if you remember which tile you pressed -- the panel renders at the
   * foot of the map rather than beside the tile, so there is nothing linking the
   * open panel to the square that opened it. Escape and the close button worked;
   * clicking away, which is what everyone tries, did nothing.
   *
   * Tile and device presses keep their own toggle/switch behavior. Empty map
   * space is an outside press too; excluding the whole SVG kept the popup stuck.
   */
  useEffect(() => {
    if (!openTile) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (tilePopRef.current?.contains(target)) return;
      if (target instanceof Element && mapWrapRef.current?.contains(target) && target.closest('.stage-tile, .stage-device')) return;
      setOpenTile(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenTile(null); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openTile]);

  const openTileInfo = useMemo(() => {
    if (!openTile || !geometry) return null;
    const [col, row] = openTile;
    const tile = geometry.tileLegend[geometry.tileGrid[row]?.[col] ?? -1];
    if (!tile) return null;
    const st = tileStyle({ k: tile.key, high: tile.height === 'high', build: tile.deployable, walk: tile.walkable, fly: tile.flyable });
    const named = tileLegend[tile.key];
    return {
      col,
      row,
      name: named?.name || st.label || tile.key,
      description: named?.description || null,
      key: tile.key,
      high: tile.height === 'high',
      walkable: tile.walkable,
      flyable: tile.flyable,
      deployable: tile.deployable,
      // The towers, pillars, vents and supplied operators standing here. These
      // used to be reachable only by hovering their marker for a tooltip, and
      // the marker is drawn with fill:none, so its middle did not even take the
      // pointer -- the only hit area was a 1.8px outline and a 2.6px dot.
      units: devicesByTile.get(`${col},${row}`) || [],
    };
  }, [openTile, geometry, devicesByTile, tileLegend]);

  return (
    <div
      className="stage-detail-col"
      ref={detailColRef}
      style={reservedDetailHeight ? { minHeight: reservedDetailHeight } : undefined}
    >
        <section className="op-section stage-brief">
          {emergency && (
            /* Metrics are identical across both states -- only the colour says
               which form you are reading. */
            <div className="stage-variant-toggle">
              <button
                type="button"
                className={`stage-variant-option${emergencyOn ? '' : ' current'}`}
                aria-pressed={!emergencyOn}
                onClick={() => setEmergencyOn(false)}
              >
                Normal
              </button>
              <button
                type="button"
                className={`stage-variant-option${emergencyOn ? ' current' : ''}`}
                aria-pressed={emergencyOn}
                onClick={() => setEmergencyOn(true)}
              >
                Emergency Ops
              </button>
            </div>
          )}
          {family.length > 1 && (
            <div className="stage-variant-toggle">
              {family.map((f) =>
                f.slug === stage.slug ? (
                  <span key={f.slug} className="stage-variant-option current" aria-current="page">
                    {f.variantOf ? variantLabel(f.variant) : baseLabel}
                  </span>
                ) : (
                  /* scroll={false} because this reads as a tab, not a link. Every form
                     of a stage is its own route, so Next scrolled to the top of the
                     document on each press -- which threw the reader back to the
                     breadcrumb from whatever they were looking at, the map most of
                     all. The forms lay the same page out the same way, so holding the
                     offset lands on the same thing in the new form. */
                  <Link prefetch={false}
                    key={f.slug}
                    href={`/stages/browse?s=${encodeURIComponent(f.slug)}`}
                    scroll={false}
                    className="stage-variant-option"
                  >
                    {f.variantOf ? variantLabel(f.variant) : baseLabel}
                  </Link>
                )
              )}
            </div>
          )}
          <div className="stage-badges">
            {/* The badge read "FOUR_STAR" before, from difficulty.tier. Every
                stage carrying a non-normal tier turned out to carry a variant as
                well, and the variant says the same thing in the game's own
                words -- so the tier is not a badge at all. With the toggle above
                naming the form, the variant badge is only worth printing when
                there is no toggle: the 19 variants whose base stage the source
                does not name. */}
            {family.length <= 1 && variantLabel(stage.variant) && (
              <span className="stage-variant-badge">{variantLabel(stage.variant)}</span>
            )}
            <span className="stage-kind-badge">{TYPE_LABELS[stage.stage_type] || stage.stage_type}</span>
          </div>
          {/* Only where there is no map to put them on. These eight cells used to
              sit here on every page, above the map, which is the one place the
              game never shows them. */}
          {!hasSchematic && !shownPreview && (
            <div className="stage-stats">
              {stats.map((s) => (
                <div key={s.label} className="stage-stat">
                  <span className="stage-stat-label">
                    <StatLabel label={s.label} icon={s.icon} />
                  </span>
                  <span className="stage-stat-value">{s.value}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* `shownPreview` alone is enough to earn this section: the 103 Story
            Environment forms have no map of their own but do borrow their base's
            render, and gating the whole section on `geometry` made that borrow
            dead code -- the briefing that shows the render lives in here.

            Everything inside keys off `showingBriefing`, never off `briefingOpen`
            directly: a page with no schematic is ALWAYS on the briefing, and
            gating the legend and the playback controls on `!briefingOpen` put
            route prose and an inert Paths button under a photograph on 231
            pages. */}
        {(hasSchematic || hasBriefing) && (
          /* The ref is what goes fullscreen: the whole section, so the play button and
             the scrubber come with the map rather than the reader being locked out of
             the controls at the moment the map is worth watching. */
          <section className="op-section" ref={simulator}>
            <div className="stage-section-head">
              {/* A stage with no schematic and no render has no map to head --
                  what the section holds there is the briefing itself. */}
              <h2>{hasSchematic || shownPreview ? 'Map' : 'Briefing'}</h2>
              <div className="stage-map-tools">
                {/* Only where there is a schematic to go back to: with no
                    schematic the briefing is the whole section, and a button that
                    cannot be switched off is not a toggle. */}
                {hasBriefing && hasSchematic && (
                  <button
                    type="button"
                    className={showingBriefing ? 'primary' : 'ghost'}
                    onClick={() => setBriefingOpen((v) => !v)}
                  >
                    Description
                  </button>
                )}
                {/* Both stay in the row while the briefing is open rather than
                    disappearing out from under the cursor: they act on the
                    schematic, so pressing one goes back to it. */}
                {hasSchematic && drawablePaths && (
                  <button
                    type="button"
                    className={showRoutes && !showingBriefing ? 'primary' : 'ghost'}
                    onClick={() => {
                      setBriefingOpen(false);
                      setShowRoutes((v) => (showingBriefing ? true : !v));
                    }}
                  >
                    <span className="wide-only">Toggle </span>Paths
                  </button>
                )}
                {hasSchematic && (
                  <button
                    type="button"
                    className={legendOpen && !showingBriefing ? 'primary' : 'ghost'}
                    onClick={() => {
                      setBriefingOpen(false);
                      setLegendOpen((v) => (showingBriefing ? true : !v));
                    }}
                  >
                    <span className="wide-only">Toggle </span>Legend
                  </button>
                )}
                {/* Operators. Its own button so the feature does not depend on
                    fullscreen being available, which on a phone it is not. */}
                {hasSchematic && (
                  <button
                    type="button"
                    className={deployOpen && !showingBriefing ? 'primary' : 'ghost'}
                    onClick={() => {
                      setBriefingOpen(false);
                      setDeployOpen((v) => (showingBriefing ? true : !v));
                    }}
                  >
                    Deploy
                  </button>
                )}
              </div>
            {/* Beside the heading rather than in the row of actions: it is a control
                on the VIEW, not a thing to do to the map, and keeping it out of that
                row is what lets the four buttons form an even grid on a phone. Only
                where the browser will actually do it: iOS Safari grants fullscreen to
                <video> and nothing else, and a button that cannot work is worse than
                no button. */}
              {hasSchematic && canFullscreen && (
                <button
                  type="button"
                  className={`ghost stage-fullscreen${fullscreen ? ' current' : ''}`}
                  onClick={toggleFullscreen}
                  title={fullscreen ? 'Leave fullscreen' : 'Fullscreen'}
                  aria-label={fullscreen ? 'Leave fullscreen' : 'Fullscreen'}
                  aria-pressed={fullscreen}
                >
                  <ExpandGlyph leaving={fullscreen} />
                </button>
              )}
            </div>
            {showingBriefing ? (
              /* The game's briefing, in the game's order: its own render of the
                 stage, then what the stage says about itself, then what it
                 drops. */
              <div className="stage-briefing">
                {shownPreview && (
                  <figure
                    className="stage-ingame stage-briefing-art"
                    /* The same box the schematic reserves, so the two views start at
                       the same height and switching between them does not resize the
                       section. Without it the briefing was 447px shorter on an IS
                       node, the page shrank, the browser clamped the scroll, and
                       everything above -- the stage rail included -- jumped up. */
                    style={map ? { aspectRatio: `${map.width} / ${map.height}` } : undefined}
                  >
                    {/* Plain img rather than next/image: these are pre-sized
                        screenshots served straight from public/, and the camera
                        perspective means a responsive srcset buys nothing. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <ContentImg
                      src={`/stages-images/${encodeURIComponent(shownPreview)}`}
                      alt={`In-game view of ${stage.code || stage.slug}${emergencyOn ? ', Emergency Ops' : ''}`}
                      loading="lazy"
                    />
                  </figure>
                )}
                {(description.length > 0 || (emergencyOn && emergency?.condition)) && (
                  <div className="stage-brief-desc">
                    {/* First, and only in the Emergency Ops form: it is a condition on
                        this run of the stage, so it belongs with the stage's own rules
                        rather than under the toggle -- where it sat between the two
                        toggles and read as a caption for both. Ahead of the flavour
                        text for the same reason the game puts conditions first: it
                        changes the fight, and the prose does not. */}
                    {emergencyOn && emergency?.condition && (
                      <p className="sub stage-desc-rule">
                        <span className="stage-desc-tag">Emergency Ops</span>
                        {emergency.condition}
                      </p>
                    )}
                    {description.map((line, at) =>
                      line.tag ? (
                        <p key={`${at}-${line.tag}`} className="sub stage-desc-rule">
                          <span className="stage-desc-tag">{line.tag}</span>
                          {line.text}
                        </p>
                      ) : (
                        <p key={at} className="sub">
                          {line.text}
                        </p>
                      )
                    )}
                  </div>
                )}
                {drops.length > 0 && (
                  <p className="hint">Rarity is the game&apos;s own wording</p>
                )}
                {drops.map((group) => (
                  <div key={`briefing-${group.title}`} className="stage-drop-group">
                    <h3 className="stage-drop-group-title">
                      {group.title}
                      {group.hint && <span className="hint"> -- {group.hint}</span>}
                    </h3>
                    <div className="stage-drops">
                      {group.drops.map((d) => (
                        <div
                          key={`briefing-${d.kind}-${d.item.id}`}
                          className={`stage-drop${group.mainIds.has(d.item.id) ? ' main' : ''}`}
                          title={group.mainIds.has(d.item.id) ? "This stage's main drop" : undefined}
                        >
                          {dropIcons[d.item.id] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <ContentImg
                              className={`stage-drop-icon${d.item.is_operator ? ' operator' : ''}`}
                              src={dropIcons[d.item.id]}
                              alt=""
                              loading="lazy"
                            />
                          ) : (
                            <span className="stage-drop-icon blank" aria-hidden="true" />
                          )}
                          <span className="stage-drop-text">
                            <span className="stage-drop-name">{d.item.name}</span>
                            <span className="stage-drop-sub">{d.rarity || ''}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
            /* The area keeps the schematic's aspect ratio so toggling the paths
               or the legend cannot resize the section and shove the page around. */
            <div className={`stage-map-area${dragging || pending ? ' dragging' : ''}`}
              style={map ? { aspectRatio: `${map.width} / ${map.height}` } : undefined}>
              {map && geometry ? (
              <div className="stage-mapwrap" ref={mapWrapRef}>
                <svg
                  ref={mapSvg}
                  viewBox={`0 0 ${map.width} ${map.height}`}
                  role="img"
                  aria-label={`Tile map for ${stage.code || stage.slug}, ${map.cols} by ${map.rows}`}
                >
                  {geometry.tileGrid.map((row, r) =>
                    row.map((tileIndex, c) => {
                      const tile = geometry.tileLegend[tileIndex];
                      if (!tile) return null;
                      const st = tileStyle({ k: tile.key, high: tile.height === 'high', build: tile.deployable, walk: tile.walkable, fly: tile.flyable });
                      const px = map.x(c);
                      const py = map.y(r);
                      // Clicking a tile says what it is. A second click on the
                      // same one closes it, and any click closes the legend --
                      // the legend sits over the map, so a press on the map is
                      // how you dismiss it.
                      const open = openTile?.[0] === c && openTile?.[1] === r;
                      const takesDrag = !!dragging
                        && tileTakes(tile.deployable, dragging.op);
                      const overThis = dragging?.over?.[0] === c && dragging?.over?.[1] === r;
                      const pick = () => {
                        setLegendOpen(false);
                        // An armed operator takes the click: the reader asked to put it
                        // somewhere, and a tile description is not what they wanted. This
                        // is the keyboard and click path -- dragging goes through the
                        // window listener instead -- and it lands in the same place, a
                        // tile waiting for a direction.
                        if (armed && beginPlace(armed, c, r, tile.deployable)) return;
                        setOpenTile(open ? null : [c, r]);
                      };
                      if (st.fill === 'none') {
                        return (
                          <rect
                            key={`${r}-${c}`}
                            className="stage-tile"
                            data-tile-col={c}
                            data-tile-row={r}
                            data-tile-takes={tile.deployable}
                            x={px + 4}
                            y={py + 4}
                            width={CELL - 8}
                            height={CELL - 8}
                            rx={2}
                            fill="none"
                            stroke={open ? '#4de8d1' : '#1c1c1e'}
                            onClick={pick}
                          />
                        );
                      }
                      const lift = tile.height === 'high' ? 3 : 0;
                      return (
                        <g
                          key={`${r}-${c}`}
                          className={`stage-tile${takesDrag ? ' takes-drag' : ''}${overThis ? ' drag-over' : ''}`}
                          data-tile-col={c}
                          data-tile-row={r}
                          data-tile-takes={tile.deployable}
                          onClick={pick}
                        >
                          {lift > 0 && <rect x={px} y={py + lift} width={CELL} height={CELL - lift} rx={2} fill="#191a1a" />}
                          <rect x={px} y={py - lift} width={CELL} height={CELL} rx={2} fill={st.fill}
                            stroke={st.stroke || (tile.height === 'high' ? '#8a8c8d' : '#1b1c1d')} strokeWidth={st.stroke ? 1.4 : 1} />
                          {/* What the tile DOES, as a glyph. Only tiles that change
                              the fight carry one -- a reskin of ordinary ground gets
                              its theme's tint and nothing else, so a themed map does
                              not read as a map full of mechanisms. */}
                          {st.mark && (
                            <path
                              className="stage-tile-mark"
                              d={stageTileMark(st.mark, px, py - lift, CELL)}
                            />
                          )}
                          {/* The clicked tile keeps a ring, so the panel at the
                              bottom is tied to something you can see. */}
                          {open && (
                            <rect x={px} y={py - lift} width={CELL} height={CELL} rx={2} fill="none" stroke="#4de8d1" strokeWidth={2} />
                          )}
                        </g>
                      );
                    })
                  )}
                  {/* The units the stage starts with: the towers, pillars, freezing
                      towers and crates a map is built around. Drawn under the
                      routes, because a route running past a tower is the point. */}
                  {devices.map((d, i) => {
                    const px = map.x(d.col);
                    const py = map.y(d.row);
                    return (
                      <g
                        key={`${d.key}-${d.row}-${d.col}-${i}`}
                        className="stage-device"
                        onClick={() => {
                          setLegendOpen(false);
                          setOpenTile((prev) => (prev && prev[0] === d.col && prev[1] === d.row ? null : [d.col, d.row]));
                        }}
                      >
                        <title>{d.description ? `${d.name} -- ${d.description}` : d.name}</title>
                        {/* An invisible square over the whole tile: the outline
                            below is fill:none, which takes the pointer only on
                            the stroke itself. Without this, the marker was the
                            one thing on the map you could not click. */}
                        <rect x={px} y={py} width={CELL} height={CELL} fill="transparent" />
                        <rect
                          x={px + 5}
                          y={py + 5}
                          width={CELL - 10}
                          height={CELL - 10}
                          rx={3}
                          fill="none"
                          stroke={d.kind === 'operator' ? '#4de8d1' : '#e0a63c'}
                          strokeWidth={1.8}
                          strokeDasharray={d.hidden ? '3 2' : undefined}
                        />
                        <circle cx={px + CELL / 2} cy={py + CELL / 2} r={2.6} fill={d.kind === 'operator' ? '#4de8d1' : '#e0a63c'} />
                      </g>
                    );
                  })}
                  {/* Drawn from the pathfound playback paths, not from the raw
                      checkpoints. A gamedata route is a list of checkpoints the
                      enemy walks BETWEEN, and its checkpoints are
                      {type, position:{row,col}} -- reading them as {row,col}
                      produced NaN for every point after the start, which is
                      what the browser was rejecting. Using the same paths the
                      timeline animates also means the line on the map is the
                      route the enemy actually walks. */}
                  {showRoutes &&
                    routeIndices.map((i) => {
                      const path = playback?.paths?.[i];
                      if (!path || path.points.length < 2) return null;
                      const colour = ROUTE_COLORS[i % ROUTE_COLORS.length];
                      const cx = (c: number) => map.x(c) + CELL / 2;
                      const cy = (r: number) => map.y(r) + CELL / 2;
                      // The corners the route turns at. The ends are dropped --
                      // they sit on the spawn and objective tiles, which are
                      // unmistakable already -- and a checkpoint on the same tile
                      // as the one before it would draw a second dot on top.
                      const nodes = (path.nodes || []).filter(
                        (point, at, all) =>
                          at > 0 &&
                          at < all.length - 1 &&
                          (point[0] !== all[at - 1][0] || point[1] !== all[at - 1][1])
                      );
                      return (
                        <g key={i} pointerEvents="none">
                          {/* One polyline per stretch the enemy actually walks. A
                              tunnel (appear_at_pos) is a break, and drawing across
                              it laid a straight line over whatever stands between
                              the two ends -- 806 maps have tunnel tiles. */}
                          {(() => {
                            const breaks = new Set(path.breaks || []);
                            const legs: [number, number][][] = [];
                            let leg: [number, number][] = [];
                            path.points.forEach((point, at) => {
                              if (breaks.has(at) && leg.length) {
                                legs.push(leg);
                                leg = [];
                              }
                              leg.push(point);
                            });
                            if (leg.length) legs.push(leg);
                            return legs
                              .filter((one) => one.length > 1)
                              .map((one, at) => (
                                <polyline
                                  key={`leg-${at}`}
                                  className={`stage-route-line${path.flying ? ' flying' : ''}`}
                                  points={one.map(([c, r]) => `${cx(c)},${cy(r)}`).join(' ')}
                                  fill="none"
                                  stroke={colour}
                                  strokeWidth={2}
                                  strokeLinecap="butt"
                                  strokeLinejoin="round"
                                  opacity={0.9}
                                />
                              ));
                          })()}
                          {nodes.map(([c, r], at) => (
                            <circle
                              key={`n-${at}-${c}-${r}`}
                              cx={cx(c)}
                              cy={cy(r)}
                              r={3}
                              fill={colour}
                              stroke="#0b0f14"
                              strokeWidth={1}
                            />
                          ))}
                        </g>
                      );
                    })}
                  {live.map((unit) => {
                    const detail = enemyDetails[Object.keys(enemyDetails).find((k) => enemyDetails[k].name === unit.enemy) || ''];
                    const cx = map.x(unit.pos[0]) + CELL / 2;
                    const cy = map.y(unit.pos[1]) + CELL / 2;
                    const colour = ROUTE_COLORS[unit.routeIndex % ROUTE_COLORS.length];
                    return (
                      <g key={unit.key} pointerEvents="none">
                        <circle cx={cx} cy={cy} r={11} fill="#0b0f14" stroke={colour} strokeWidth={1.6} />
                        {detail?.icon ? (
                          <image href={contentUrl(detail.icon)} x={cx - 9} y={cy - 9} width={18} height={18} clipPath="circle(9px at 9px 9px)" />
                        ) : (
                          /* Some spawns carry no name at all in the stage data, and a
                             few name something the handbook has no art for. They used
                             to leave the disc empty, which reads as a failed image
                             rather than as "the data does not say". */
                          <text
                            x={cx}
                            y={cy}
                            textAnchor="middle"
                            dominantBaseline="central"
                            className="stage-unit-unknown"
                            fill={colour}
                          >
                            ?
                          </text>
                        )}
                        {/* A clock rides above an enemy only while it is actually
                            standing still, counting down what is left of the wait.
                            The clocks used to be painted on the tiles that waits
                            happen on, all of them at once and none of them moving --
                            a map with waits on nine tiles carried nine rings whether
                            anything was standing on them or not. */}
                        {unit.waitRemaining != null && (
                          <g>
                            <circle cx={cx} cy={cy - 18} r={7.5} fill="#0b0f14" stroke={colour} strokeWidth={1.5} />
                            <path
                              d={`M ${cx} ${cy - 21.5} V ${cy - 18} H ${cx + 3.2}`}
                              fill="none"
                              stroke={colour}
                              strokeWidth={1.4}
                              strokeLinecap="round"
                            />
                            {/* Ceiling, so a wait reads "1s" for the whole of its
                                last second and shows 0 only once it is over. */}
                            <text className="stage-wait-label" x={cx + 11} y={cy - 15} fill={colour}>
                              {Math.ceil(unit.waitRemaining)}s
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {/* Deployed operators, over everything: the ground each covers, then
                      the operator itself. Drawn last so a range never hides under a
                      route line, and so the unit is on top of its own range. */}
                  {placed.length > 0 && (
                    <g className="stage-deployed-layer">
                      {/* Anywhere else on the map puts the selection away. Under the
                          units and the retreat mark, so it never takes their clicks. */}
                      {selected && (
                        <rect className="stage-deployed-dismiss" x={0} y={0}
                          width={map.width} height={map.height}
                          onClick={() => setSelected(null)} />
                      )}
                      {[...covered.entries()].map(([at, who]) => {
                        const [c, r] = at.split(',').map(Number);
                        if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) return null;
                        return (
                          <rect
                            key={at}
                            className="stage-covered"
                            x={map.x(c) + 1}
                            y={map.y(r) + 1}
                            width={CELL - 2}
                            height={CELL - 2}
                            rx={2}
                            /* Two operators covering the same tile reads darker, which
                               is the one thing overlapping ranges most want to show. */
                            opacity={Math.min(0.15 + who.length * 0.13, 0.55)}
                          />
                        );
                      })}
                      {/* The selected operator's range, bordered as one region. After
                          the fills so it reads over them, before the operators so they
                          stay on top. */}
                      {selectedCells.size > 0 && (
                        <path className="stage-range-border"
                          d={rangeOutline(selectedCells, map, CELL, GAP)} />
                      )}

                      {placed.map((unit) => {
                        const cx = map.x(unit.col) + CELL / 2;
                        const cy = map.y(unit.row) + CELL / 2;
                        const phase = phaseAt(unit.op, unit.elite);
                        const R = CELL * 0.42;
                        return (
                          <g key={unit.key} className="stage-deployed">
                            {/* The game's deployed marker: the operator in a pale ring
                                with an amber arrowhead on the side it faces. */}
                            <clipPath id={`clip-${unit.key}`}>
                              <circle cx={cx} cy={cy} r={R} />
                            </clipPath>
                            {unit.op.icon && (
                              <image
                                href={contentUrl(unit.op.icon)}
                                x={cx - R}
                                y={cy - R}
                                width={R * 2}
                                height={R * 2}
                                clipPath={`url(#clip-${unit.key})`}
                                preserveAspectRatio="xMidYMid slice"
                              />
                            )}
                            <circle className="stage-deployed-ring" cx={cx} cy={cy} r={R} />
                            <path className="stage-deployed-arrow" d={arrowMark(cx, cy, R, unit.facing)} />
                            {/* Selecting is the whole marker. It is the only thing a
                                click on an operator does -- removing is the mark that
                                appears afterwards, so no single click can cost you a
                                placement. */}
                            <circle className="stage-deployed-hit" cx={cx} cy={cy} r={R}
                              onClick={(e) => { e.stopPropagation(); setSelected(unit.key); }}>
                              <title>{`${unit.op.name} -- ${phase.cost} DP, facing ${FACING_WORDS[unit.facing]}`}</title>
                            </circle>
                            {unit.key === selected && (
                              <g className="stage-deployed-off"
                                onClick={(e) => { e.stopPropagation(); undeploy(unit.key); }}>
                                <circle cx={cx} cy={cy} r={R * 0.86} />
                                <path d={`M${cx - R * 0.4} ${cy - R * 0.4} l${R * 0.8} ${R * 0.8} M${cx + R * 0.4} ${cy - R * 0.4} l${-R * 0.8} ${R * 0.8}`} />
                                <title>{`Retreat ${unit.op.name}`}</title>
                              </g>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  )}

                  {/* The direction picker, a SIBLING of the deployed layer and not a
                      child of it: nested inside, it inherited `placed.length > 0`, so
                      the very first operator dropped on a map had nowhere to aim and
                      simply vanished. */}
                  {pending && (
                        <g
                          className="stage-aim"
                          /* One set of handlers for the whole picker, because the gesture
                             is "where is the pointer relative to the tile" rather than
                             "which shape is under it". Hover follows without a button
                             held, so the direction lights up before you commit. */
                          onPointerDown={(e) => {
                            /* Capture, so the rest of the drag comes here even once the
                               finger leaves the shape it started on. Touch dispatches
                               moves to whatever is under it otherwise, and the pull out
                               of the middle is a drag that ends somewhere else by
                               definition. Guarded: setPointerCapture throws on a pointer
                               id it does not hold, and an exception here would take the
                               handler down with it. */
                            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not held */ }
                            setAim(aimAt(e.clientX, e.clientY, pending));
                          }}
                          onPointerMove={(e) => setAim(aimAt(e.clientX, e.clientY, pending))}
                          onPointerUp={(e) => {
                            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
                            const facing = aimAt(e.clientX, e.clientY, pending);
                            if (facing == null) { setPending(null); setAim(null); return; }
                            confirmPlace(facing);
                            setAim(null);
                          }}
                          /* A cancelled pointer -- the browser taking over, a call
                             arriving -- leaves the picker open rather than placing
                             something the reader did not aim. */
                          onPointerCancel={() => setAim(null)}
                          /* Mouse only: with capture held, touch never leaves. */
                          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setAim(null); }}
                        >
                          {(() => {
                            const cx = map.x(pending.col) + CELL / 2;
                            const cy = map.y(pending.row) + CELL / 2;
                            const R = CELL * 2.4;
                            return (
                              <>
                                {/* Catches the gesture everywhere, so a drag that runs
                                    past the diamond still counts as that direction. */}
                                <rect className="stage-aim-out" x={0} y={0}
                                  width={map.width} height={map.height} />
                                <path className="stage-aim-frame"
                                  d={`M${cx} ${cy - R} L${cx + R} ${cy} L${cx} ${cy + R} L${cx - R} ${cy} Z`} />
                                {([0, 1, 2, 3] as Facing[]).map((facing) => (
                                  <g key={facing} className={`stage-aim-cone${aim === facing ? ' live' : ''}`}>
                                    <path className="stage-aim-lit" d={cone(cx, cy, R, facing)} />
                                    <path className="stage-aim-chevron" d={chevron(cx, cy, R * 0.62, facing)} />
                                  </g>
                                ))}
                                {/* The middle, which cancels. */}
                                <circle className={`stage-aim-cancel${aim === null ? ' live' : ''}`}
                                  cx={cx} cy={cy} r={CELL * 0.55} />
                                <path className="stage-aim-cancel-mark"
                                  d={`M${cx - 4} ${cy - 4} l8 8 M${cx + 4} ${cy - 4} l-8 8`} />
                              </>
                            );
                          })()}
                        </g>
                      )}
                </svg>
              </div>
              ) : null}
              {/* The battle HUD, laid out where the game puts it: life points and
                  the enemy count along the top, DP bottom-right with the
                  deployment limit under it, and the recommended level
                  bottom-left. These read as the stage's own numbers here rather
                  than as a table above the map -- which is what they were, an
                  eight-cell grid between the description and the map. */}
              <div className="stage-hud" aria-hidden="true">
                {/* Across the top, centred, as one plate: the game's own status line.
                    While a stage is playing the enemy figure counts what has arrived
                    out of what the stage fields; with no playback it is just the
                    total, because there is no clock for it to count against. */}
                <div className="stage-hud-corner tc">
                  <HudBar
                    items={[
                      ...(hud.enemies ? [{
                        icon: 'enemies' as const,
                        label: playback
                          ? `${arrived} of the ${staged} this map plays have arrived`
                            + (heldBack ? ` -- the stage fields ${heldBack} more on a condition or at random, which an animation cannot place` : '')
                          : 'Enemies',
                        // "+N" for what the stage fields and the map cannot place, the
                        // same convention the enemy list uses for conditional spawns.
                        value: playback
                          ? `${arrived}/${staged}${heldBack ? ` +${heldBack}` : ''}`
                          : hud.enemies,
                        // "26/26" plus the widest "+32" it can grow, so the plate does
                        // not move when the counter ticks.
                        width: playback
                          ? String(staged).length * 2 + 1 + (heldBack ? String(heldBack).length + 2 : 0)
                          : undefined,
                      }] : []),
                      ...(hud.life ? [{ icon: 'life' as const, label: 'Life', value: hud.life }] : []),
                    ]}
                  />
                </div>
                {/* EXP and LMD are gone from here. They are what the run PAYS, not
                    what it fields, and the four remaining readings are the ones the
                    game itself puts on the battlefield. Both are still in the stats
                    list, which is where a stage with no map states everything. */}
                {/* Sanity over the recommended level, stacked: what the run costs is
                    read before whether you can field it. */}
                <div className="stage-hud-corner bl">
                  {hud.sanity && <HudChip label="Sanity" value={hud.sanity} icon="sanity" iconLeft />}
                  {/* Rendered even with nothing to say, because the corner hangs from
                      the bottom: a form that states no recommended level -- every
                      Challenge Mode and Adverse Environment stage -- let the sanity
                      chip fall into this slot, so the same reading sat at two
                      different heights depending on which form you were looking at. */}
                  <HudChip
                    label="Recommended"
                    value={hud.recommended}
                    wide
                    reserved={!hud.recommended}
                  />
                </div>
                <div className="stage-hud-corner br">
                  {/* The stats list below keeps the INITIAL figure either way -- that is
                      a stated fact about the stage, where this is a reading of the
                      moment. */}
                  {dpNow != null && (
                    <HudDp
                      value={String(dpNow)}
                      limit={hud.limit || undefined}
                      width={String(stage.battle?.max_dp ?? dpNow).length}
                    />
                  )}
                </div>
              </div>

              {/* The legend over the map, where what it explains actually is.
                  Closing on a click anywhere in it -- including the map showing
                  through -- means the same press that opened it can dismiss it,
                  and it stays out of the way while the map is playing. */}
              {hasSchematic && (
                <div
                  className={`stage-legend-overlay${legendOpen && !playing ? ' open' : ''}`}
                  role="button"
                  tabIndex={legendOpen && !playing ? 0 : -1}
                  aria-hidden={!(legendOpen && !playing)}
                  onClick={() => setLegendOpen(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') setLegendOpen(false);
                  }}
                >
                  <div className="stage-legend-overlay-inner" onClick={() => setLegendOpen(false)}>
                    <h3>Map tiles</h3>
                    <div className="stage-legend">
                      {legend.map((l) => (
                        <span key={l.label}>
                          {/* The swatch carries the tile's own glyph, so the legend and
                              the map are read with the same eye rather than by
                              matching two shades of grey. */}
                          <i style={{
                            background: l.fill === 'none' ? 'transparent' : l.fill,
                            border: `1px solid ${l.stroke || (l.high ? '#8a8c8d' : '#1b1c1d')}`,
                          }}>
                            {l.mark && (
                              <svg viewBox="0 0 14 14" aria-hidden="true">
                                <path className="stage-tile-mark" d={stageTileMark(l.mark, 0, 0, 14)} />
                              </svg>
                            )}
                          </i>
                          {l.label}
                        </span>
                      ))}
                    </div>
                    {properties.length > 0 && (
                      <>
                        <h3>Special tiles</h3>
                        <div className="stage-legend-special">
                          {properties.map((prop) => (
                            <span key={`overlay-${prop.key}`}>
                              <b>{prop.name}</b>
                              <span className="stage-legend-count">
                                {prop.count} {prop.count === 1 ? 'tile' : 'tiles'}
                              </span>
                              {prop.description ? ` -- ${prop.description}` : ''}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                    {(deviceGroups.length > 0 || tokens.tokenKinds > 0 || tokens.fixedSquad > 0) && (
                      <>
                        <h3>On the field</h3>
                        <div className="stage-legend-special">
                          {deviceGroups.map((d) => (
                            <span key={`overlay-unit-${d.name}`}>
                              <b>{d.name}</b>
                              {d.count > 1 && <span className="stage-legend-count">x{d.count}</span>}
                              {d.description ? ` -- ${d.description}` : ''}
                            </span>
                          ))}
                          {tokens.tokenKinds > 0 && (
                            <span>
                              <b>Deployable devices</b>
                              {/* The copies where the level file states them, else
                                  how many kinds -- see stageTokens: initialCnt is 0
                                  on more than half the entries, and a stage that
                                  hands you a device should not lose the row. */}
                              <span className="stage-legend-count">{tokens.tokens || tokens.tokenKinds}</span>
                              {' -- this stage hands you '}
                              {(tokens.tokens || tokens.tokenKinds) === 1 ? 'a device' : 'devices'}
                              {' to place, on top of your squad.'}
                            </span>
                          )}
                          {tokens.fixedSquad > 0 && (
                            <span>
                              <b>Fixed squad</b>
                              <span className="stage-legend-count">{tokens.fixedSquad}</span>
                              {' -- operators the stage supplies rather than you choosing.'}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* What one tile is, for the reader who clicked it. Pinned to the
                  bottom of the map rather than floated beside the tile: the
                  schematic scales to fit its box, so a tile's position on screen
                  is not a position this could be placed at. */}
              {openTileInfo && !playing && (
                <div className="stage-tile-pop" ref={tilePopRef}>
                  <button
                    type="button"
                    className="stage-tile-pop-close"
                    aria-label="Close tile description"
                    onClick={() => setOpenTile(null)}
                  >
                    x
                  </button>
                  <span className="stage-tile-pop-name">
                    {openTileInfo.name}
                    <span className="stage-tile-pop-at">
                      col {openTileInfo.col}, row {openTileInfo.row}
                    </span>
                  </span>
                  {openTileInfo.description && <span className="stage-tile-pop-desc">{openTileInfo.description}</span>}
                  <span className="stage-tile-pop-facts">
                    {openTileInfo.high ? 'High ground' : 'Ground level'}
                    {' \u00b7 '}
                    {openTileInfo.walkable ? 'walkable' : 'not walkable'}
                    {' \u00b7 '}
                    {openTileInfo.flyable ? 'fliers pass' : 'blocks fliers'}
                  </span>
                  {/* The towers, pillars, vents and supplied operators standing
                      here, named where they were a hover tooltip on a marker you
                      could barely hit. */}
                  {openTileInfo.units.map((unit) => (
                    <span key={`${unit.key}-${unit.kind}`} className="stage-tile-pop-unit">
                      <b>{unit.name}</b>
                      <span className="stage-tile-pop-at">
                        {unit.kind === 'operator' ? 'supplied operator' : 'device'}
                        {unit.hidden ? ' \u00b7 hidden until the stage reveals it' : ''}
                      </span>
                      {unit.description && <span className="stage-tile-pop-desc">{unit.description}</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
            )}
            {/* The operator under the pointer on its way to a tile. Fixed to the
                viewport rather than placed in the map, because a drag that wanders off
                the map still has to keep its ghost. */}
            {dragging && (
              <span
                className={`stage-drag-ghost${dragging.over ? ' over' : ''}`}
                style={{ left: dragging.x, top: dragging.y }}
                aria-hidden="true"
              >
                {dragging.op.icon && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <ContentImg src={dragging.op.icon} alt="" width={52} height={52} draggable={false} />
                )}
              </span>
            )}

            {/* Fullscreen only. It is a wide row of portraits and the page has the
                stage rail down its left; the screen is where there is room for it. */}
            {deployOpen && hasSchematic && !showingBriefing && (
              <StageDeployBar
                data={deployData}
                elite={elite}
                onElite={setElite}
                armed={armed}
                onArm={setArmed}
                placedCount={placed.length}
                onClear={() => { dragRef.current = null; setDragging(null); setPlaced([]); setArmed(null); setPending(null); setSelected(null); setAim(null); }}
                onDragStart={(op, x, y) => {
                  // Keep the prior arm until drop/click so a second click can toggle it off.
                  setPending(null);
                  dragRef.current = { op, x, y, over: null };
                  setDragging(dragRef.current);
                }}
              />
            )}

            {!showingBriefing && playback && playback.spawns.length > 0 && (
              <div className="stage-playback">
                <button type="button" className={playing ? 'primary' : 'ghost'} onClick={() => setPlaying((v) => !v)}>
                  {playing ? 'Pause' : 'Play'}
                </button>
                <input
                  type="range"
                  className="stage-scrub"
                  min={0}
                  max={Math.ceil(playback.duration)}
                  step={0.5}
                  value={time}
                  onChange={(e) => scrub(Number(e.target.value))}
                  aria-label="Scrub the battle timeline"
                />
                <span className="stage-clock">
                  {Math.floor(time / 60)}:{String(Math.floor(time % 60)).padStart(2, '0')}
                  <span className="stage-clock-total"> / {Math.floor(playback.duration / 60)}:{String(Math.floor(playback.duration % 60)).padStart(2, '0')}</span>
                </span>
                {/* Metrics identical across the three, so changing rate cannot
                    shift the row. */}
                <span className="stage-playback-rates">
                  {[1, 2, 4].map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`stage-playback-rate${rate === option ? ' current' : ''}`}
                      aria-pressed={rate === option}
                      onClick={() => setRate(option)}
                    >
                      {option}x
                    </button>
                  ))}
                </span>
                <button type="button" className="ghost" onClick={() => scrub(0)}>Reset</button>
              </div>
            )}

            {/* Said only where the form has no level file of its own. A Challenge
                Mode form shares its parent's outright, so there is nothing to
                disclose; a Story Environment form names one that exists in neither
                dump. Story Environment changes the player's side and not the stage,
                so what is borrowed is what the form fields -- the note says whose map
                it is, and names the one figure the game withholds. */}
            {borrowedGeometryFrom && stage.variant && !stage.variant.shares_parent_level_file && (
              <p className="hint stage-provenance">
                {stage.variant.kind === 'story_environment' ? (
                  <>
                    Story Environment buffs your operators rather than the stage, so the map,
                    waves and enemies are{' '}
                    <Link prefetch={false} href={`/stages/${encodeURIComponent(borrowedGeometryFrom)}`}>
                      {stage.variant.of_stage_code || borrowedGeometryFrom}
                    </Link>
                    &apos;s, as they are in game. The starting DP is that stage&apos;s too --
                    this form raises it, by an amount the game states nowhere.
                  </>
                ) : (
                  <>
                    The game ships no map data for this form, so the layout shown is{' '}
                    <Link prefetch={false} href={`/stages/${encodeURIComponent(borrowedGeometryFrom)}`}>
                      {stage.variant.of_stage_code || borrowedGeometryFrom}
                    </Link>
                    &apos;s. The tiles are the same; the waves and enemy levels are that
                    stage&apos;s rather than this form&apos;s.
                  </>
                )}
              </p>
            )}
          </section>
        )}

        {/* The briefing is the game's stage screen, and the roster is not on it.
            Hidden only when there is a map to go back to: on the 231 stages with
            no schematic the briefing is the whole page, and hiding the roster
            there would put it nowhere. */}
        {enemyGroups.length > 0 && !(showingBriefing && hasSchematic) && (
          <section className="op-section">
            <div className="stage-section-head">
              <h2>Enemies</h2>
              <span className="hint">
                {enemyTotals.certain} in this stage
                {enemyTotals.conditional ? `, ${enemyTotals.conditional} more that may appear` : ''}
              </span>
            </div>
            {enemySections.map((section) => (
              <div key={section.key} className="stage-enemy-section">
                {section.title && (
                  <h3 className={`stage-enemy-section-title${section.key === 'may' ? ' may' : ''}`}>
                    {section.title}
                  </h3>
                )}
                {section.groups.map((group) => (
                <div key={`${section.key}-${group.key}`} className="stage-enemy-rank-group">
                  {/* The rank demotes to a label where a section heading is above it:
                      .stage-drop-group-title is an unstyled h3, so at the browser's
                      own 18.72px bold it out-weighed the division it sits under. On a
                      stage with no conditional spawns there is no heading above it and
                      it stays the heading it has always been. */}
                  <h3 className={section.title ? 'stage-enemy-rank-title' : 'stage-drop-group-title'}>
                    {group.title}
                  </h3>
                  <div className="stage-enemy-cards">
                    {group.list.map(({ entry: e, certain, conditional }) => {
                      const detail = enemyDetails[e.slug] ?? (e.name ? detailByName[e.name] : undefined);
                      // Unranked enemies have no slug -- 21 of them share one
                      // group on the worst page -- so identity has to include
                      // the name, or they collide as one card.
                      const id = e.slug || `${e.name || 'unnamed'}-${e.index ?? ''}`;
                      const open = openEnemies.has(id);
                      return (
                        <div key={`${section.key}-${group.key}-${id}`} className={`stage-enemy-card${open ? ' open' : ''}`}>
                          <button
                            type="button"
                            className="stage-enemy-head-btn"
                            aria-expanded={open}
                            onClick={() =>
                              setOpenEnemies((prev) => {
                                const next = new Set(prev);
                                if (next.has(id)) next.delete(id);
                                else next.add(id);
                                return next;
                              })
                            }
                          >
                            {detail?.icon ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <ContentImg className="stage-enemy-icon" src={detail.icon} alt="" loading="lazy" />
                            ) : (
                              <span className="stage-enemy-icon stage-enemy-icon-blank" aria-hidden="true" />
                            )}
                            <span className="stage-enemy-card-name">
                              {e.name || e.slug || 'Unnamed enemy'}
                              <span className="stage-enemy-card-sub">
                                {e.index ? `#${e.index}` : ''}
                                {certain ? ` · x${certain}` : ''}
                                {/* Under May appear the heading has already said so,
                                    so the count is just a count. In Always it is an
                                    addition to a certainty and stays marked: this
                                    enemy turns up, and sometimes three more of it. */}
                                {conditional ? (certain
                                  ? ` · +${conditional} may appear`
                                  : ` · x${conditional}`) : ''}
                                {detail?.movement ? ` · ${detail.movement}` : ''}
                              </span>
                            </span>
                            {detail?.stats && (
                              <span className="stage-enemy-card-stats">
                                <span>HP {detail.stats.hp ?? '--'}</span>
                                <span>ATK {detail.stats.atk ?? '--'}</span>
                                <span>DEF {detail.stats.def ?? '--'}</span>
                                <span>RES {detail.stats.res != null ? `${Math.round(detail.stats.res)}%` : '--'}</span>
                              </span>
                            )}
                            <span className="stage-enemy-chevron" aria-hidden="true">{open ? '−' : '+'}</span>
                          </button>

                          {open && detail && (
                            <div className="stage-enemy-detail">
                              <div className="stage-enemy-detail-stats">
                                {[
                                  ['Damage', detail.damageType.join(', ') || '--'],
                                  ['Attacks', detail.attackPosition || '--'],
                                  ['Attack interval', detail.stats?.attackInterval != null ? `${detail.stats.attackInterval}s` : '--'],
                                  ['Movement speed', detail.moveSpeed != null ? `${detail.moveSpeed} tiles/s` : '--'],
                                  // The two elemental figures gamedata keeps
                                  // separate: resistance to elemental damage, and
                                  // resistance to elemental BUILD-UP. Absent means
                                  // none -- an enemy the data says nothing about
                                  // takes elemental damage in full -- so they read
                                  // 0% rather than "--", which looked like the
                                  // figure was missing. 1,376 of the level entries
                                  // leave them out where 394 state a zero.
                                  ['Elemental RES', `${Math.round(detail.stats?.elementalRes ?? 0)}%`],
                                  ['Effect Res', `${Math.round(detail.stats?.elementalDamageRes ?? 0)}%`],
                                  ['Race', detail.race || '--'],
                                ].map(([label, value]) => (
                                  <span key={label} className="stage-enemy-kv">
                                    <span className="stage-enemy-kv-label">{label}</span>
                                    <span className="stage-enemy-kv-value">{value}</span>
                                  </span>
                                ))}
                              </div>
                              {(detail.levelCount > 1 || detail.statsOverridden) && (
                                <p className="hint">
                                  {detail.levelCount > 1 &&
                                    (detail.levelAssumed
                                      ? `This stage does not say which of the ${detail.levelCount} level variants it fields; the strongest is shown. `
                                      : `Level ${(detail.level ?? 0) + 1} of ${detail.levelCount}, which is the one this stage fields. `)}
                                  {detail.statsOverridden &&
                                    'This stage re-stats this enemy, and the figures shown are the ones it fields.'}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                ))}
              </div>
            ))}
            {enemyTotals.named < enemyTotals.declared && (
              <p className="hint stage-provenance">
                The stage&apos;s own data names {enemyTotals.named} of the {enemyTotals.declared} enemies
                it counts; the rest are not listed in it.
              </p>
            )}
            {stage.enemies?.conditional?.total ? (
              <p className="hint stage-provenance">
                What may appear sits behind a hidden group, a weighted pick or a branch in the
                stage&apos;s own data -- which is what makes two runs of it differ.
              </p>
            ) : null}
          </section>
        )}
    </div>
  );
}

/**
 * The Terminal's stage view: the rail once, and whichever stage the URL names.
 *
 * This was 3,786 pre-rendered pages, one per stage, each embedding the whole
 * rail beside the single stage it was about -- the same shape the enemy
 * handbook had, and about 300 MB of near-duplicate HTML per build. It is one
 * page with the selection in the URL now (?s=<slug>), and each stage's data
 * arrives as a static file written by scripts/build-stage-details.ts.
 */
export default function StagesBrowsePage({ stages, typeCounts, now, firstSlug }: Props) {
  const contentUrl = useContentUrl();
  const router = useRouter();
  const slug = typeof router.query.s === 'string' && router.query.s ? router.query.s : firstSlug;
  const [detail, setDetail] = useState<StageDetailData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    fetch(contentUrl(`/stage-detail/${encodeURIComponent(slug)}.json`))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: StageDetailData) => { if (live) setDetail(d); })
      .catch(() => { if (live) { setDetail(null); setFailed(true); } });
    return () => { live = false; };
  }, [slug, contentUrl]);

  /* Named for the stage on screen. Every one of these 3,786 URLs used to serve
     the same empty title -- the only <title> a crawler found was an SVG label
     inside the map. */
  const title = detail
    ? `${detail.stage.code || detail.stage.name || detail.stage.slug} -- Stage -- Arkpedia`
    : 'Stages -- Arkpedia';

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta
          name="description"
          content={detail
            ? `${[detail.stage.code, detail.stage.name].filter(Boolean).join(' ')}: map, enemies, drops and wave order.`
            : 'Every Arknights stage, with its map, enemies and drops.'}
        />
      </Head>
      {/* Two lines, wide-aligned with the panes below. The full site header ran
          184px tall on a page whose left column wants every pixel of viewport it
          can get. */}
      {detail ? (
        <div className="stages-head">
          {detail.stage.content?.id && (
            <Link prefetch={false} href={`/stages/content/${detail.stage.content.id}`} className="stage-back">
              &lsaquo; {detail.stage.content.name}
            </Link>
          )}
          <div className="eyebrow">
            {/* Braced, so the separator cannot be read as a comment -- by the linter
                or by anyone. It is the crumb divider the eyebrow uses throughout. */}
            <Link prefetch={false} href="/stages">Stages</Link>{' // '}
            {/* The chapter or event is a page of its own now -- its stages as
                cards -- so the crumb that names it goes there. A stage whose
                content the dataset does not name keeps the plain text. */}
            {detail.stage.content?.id ? (
              <Link prefetch={false} href={`/stages/content/${detail.stage.content.id}`}>{detail.stage.content.name}</Link>
            ) : (
              detail.stage.zone?.name || TYPE_LABELS[detail.stage.stage_type] || detail.stage.stage_type
            )}
          </div>
          {/* 166 mode levels have no code and 306 no name, and one stage
              (level_rogue4_b-9) has neither -- it rendered an empty heading. Fall
              back the way the list rows do, so a page always says what it is. */}
          <h1>
            {detail.stage.code || detail.stage.name || detail.stage.slug}
            {detail.stage.code && detail.stage.name && (
              <span className="stage-title-name">{detail.stage.name}</span>
            )}
          </h1>
        </div>
      ) : (
        <div className="stages-head">
          <div className="eyebrow">
            <Link prefetch={false} href="/stages">Stages</Link>
          </div>
          <h1>Stages</h1>
        </div>
      )}

      <main>
        {/* Same two panes as before: the rail keeps its place on the left and the
            stage fills the column beside it. The rail is rendered once now
            instead of once per stage. */}
        <div className="stage-shell">
          <StageList stages={stages} typeCounts={typeCounts} now={now} selectedSlug={slug} />
          {detail ? (
            /* Keyed on the slug so the panel's own state -- playback, open
               cards, the variant toggle -- starts fresh for each stage. */
            <StageDetailPanel key={detail.stage.slug} {...detail} now={now} />
          ) : (
            <div className="stage-detail-col">
              <p className="hint">{failed ? 'That stage could not be loaded.' : 'Loading...'}</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/stages/browse", async () => {
  const slugs = getStageSlugs();
  const first = slugs[0] ?? '';
  return {
    props: {
      // The rail's first paint. StageList fetches /stages-index.json on mount
      // for the rest, exactly as it did when this was 3,786 pages.
      stages: getStageSiblings(first),
      typeCounts: getStageTypeCounts(),
      now: Math.floor(Date.now() / 1000),
      firstSlug: first,
    },
  };
});
