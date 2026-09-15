import { StageGeometry } from './stageTypes';
import { walkGridFrom, pathBetween } from './stageRoutes';

/** The spawn schedule and walked paths for a stage.
 *
 * Split in two on purpose. The PATHS are built server-side, because a leg between
 * checkpoints is an A* over the walkable grid and the page should get geometry it
 * can interpolate along, not a pathfinding job on mount. The SCHEDULE -- who spawns
 * where and when -- is arithmetic over the waves, so the browser builds that from
 * data it already has rather than the wire carrying a second copy of it.
 *
 * See buildPlaybackPaths and buildSchedule. */

export interface PlaybackPath {
  /** Polyline in [col, row] tile coordinates, already pathfound for walkers. */
  points: [number, number][];
  /** Cumulative tile distance at each point, so a position at time t is a
   * lookup plus one lerp rather than a walk of the whole line. */
  distances: number[];
  length: number;
  /** Indices into `points` the enemy arrives at by tunnel rather than on foot: the
   *  step into each covers no ground and takes no time, and the drawn line breaks
   *  there. */
  breaks: number[];
  flying: boolean;
  /** Where along the path the enemy stops, and for how long. */
  holds: PlaybackHold[];
  /** The route's own checkpoints in [col, row], first and last included -- the
   *  corners it turns at, which the drawn line only implies. */
  nodes: [number, number][];
}

export interface PlaybackHold {
  /** Distance along the path at which the enemy stands still. */
  at: number;
  /** Seconds held. HOLD_INDEFINITE or more means it never moves on. */
  seconds: number;
  /** True when the hold is the time spent inside a tunnel: the enemy is off the
   *  map for it, not standing at the entrance. 5,428 of the 6,001 tunnels state
   *  their transit this way -- most often 3s or 5s -- and the other 571 cross in
   *  no time at all. */
  tunnel: boolean;
  /** The tile it waits on, in [col, row], so the map can mark it without
   *  interpolating the distance back into a position. */
  point: [number, number];
}

/** Above this, a wait is the game's way of saying "until something else
 *  happens", and the enemy is played as parked rather than stretching the
 *  scrubber to match.
 *
 *  999 is where the data itself draws the line: of the 44,307 timed waits, 502
 *  fall in 300-600s and only 8 in 600-999, then 513 sit at exactly 999, 66
 *  between 1000 and 9999, and 1,520 at 9999 or 99999. Without this, 15-8's
 *  stationary enemy gave the stage a 16-minute timeline for a three-minute
 *  fight. */
const HOLD_INDEFINITE = 999;

export interface PlaybackSpawn {
  /** Seconds from the start of the battle. */
  at: number;
  enemy: string;
  enemyId: string | null;
  routeIndex: number;
  /** Tiles per second. */
  speed: number;
}

export interface StagePlayback {
  /** Total battle length in seconds. */
  duration: number;
  paths: Record<number, PlaybackPath>;
  spawns: PlaybackSpawn[];
}

/**
 * Tiles per second at move_speed 1.0.
 *
 * gamedata's moveSpeed is a MULTIPLIER, not a rate: the values run 0.3 to 5.0,
 * cluster on 0.7/0.8/1.0, and nothing in the excel data states what they multiply.
 * 0.65 tiles/s is the figure the community's map tools use for a standard enemy,
 * and it is the one number in this model not read out of the game's own files --
 * relative pacing between enemies is exact whatever it is, but the clock on the
 * scrubber scales with it. Treating moveSpeed as the rate itself, which is what
 * this did before, ran every stage about half again too fast.
 */
const TILES_PER_SECOND = 0.65;

/** The multiplier assumed when an enemy states none. */
const DEFAULT_MOVE_SPEED = 1;

/** A stop carries the index of the checkpoint it came from, because the waits
 *  are stated against the RAW checkpoint list and this one is filtered. `cp` is
 *  -1 for the route's start (which is what a wait "after checkpoint -1" holds
 *  at: 7,122 of them, an enemy standing on its spawn tile before setting off). */
function checkpointPositions(
  route: StageGeometry['routes'][number]
): { row: number; col: number; cp: number; teleport: boolean }[] {
  const out: { row: number; col: number; cp: number; teleport: boolean }[] = [];
  if (route.start) out.push({ ...route.start, cp: -1, teleport: false });
  (route.checkpoints || []).forEach((cp, index) => {
    // Only movement checkpoints carry a real position. WAIT/DISAPPEAR nodes
    // reuse whatever position was last set, so treating them as waypoints sends
    // routes zig-zagging back across the map.
    const type = String((cp as { type?: string }).type || '').toLowerCase();
    if (type && !type.includes('move') && !type.includes('appear')) return;
    const pos = (cp as { position?: { row: number; col: number } }).position || (cp as { row?: number; col?: number });
    if (typeof pos?.row === 'number' && typeof pos?.col === 'number') {
      // appear_at_pos is a tunnel: the enemy leaves the map at the checkpoint
      // before it and comes back at this tile. 6,001 of them, over 806 maps with
      // teleport tiles, and pathfinding between the two drew a route through
      // whatever stood in between.
      out.push({ row: pos.row, col: pos.col, cp: index, teleport: type.includes('appear') });
    }
  });
  if (route.end) out.push({ ...route.end, cp: (route.checkpoints || []).length, teleport: false });
  return out;
}

function buildPath(geometry: StageGeometry, routeIndex: number): PlaybackPath | null {
  const route = geometry.routes[routeIndex];
  if (!route || route.placeholder) return null;
  const stops = checkpointPositions(route);
  if (stops.length < 1) return null;

  const flying = route.motion === 'fly';
  const grid = walkGridFrom(
    geometry.tileGrid.map((row) => row.map((i) => geometry.tileLegend[i]))
  );

  const points: [number, number][] = [[stops[0].col, stops[0].row]];
  // Which point each stop landed on, so a wait stated against a checkpoint can
  // be placed at a distance along the finished line.
  const stopPoints: number[] = [0];
  const breaks: number[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a: [number, number] = [stops[i].col, stops[i].row];
    const b: [number, number] = [stops[i + 1].col, stops[i + 1].row];
    // Flyers ignore terrain, so their legs are straight. Ground enemies get the
    // leg pathfound, which is what keeps them off tiles they cannot walk --
    // drawing straight lines here is what put them through walls and across
    // ranged-only ground.
    if (stops[i + 1].teleport) {
      // No leg at all: it steps out of the tunnel here.
      points.push(b);
      breaks.push(points.length - 1);
      stopPoints.push(points.length - 1);
      continue;
    }
    const leg = flying ? [a, b] : pathBetween(grid, a, b) || [a, b];
    for (let j = 1; j < leg.length; j++) points.push(leg[j]);
    stopPoints.push(points.length - 1);
  }

  const distances = [0];
  const isBreak = new Set(breaks);
  for (let i = 1; i < points.length; i++) {
    if (isBreak.has(i)) {
      // A tunnel costs no distance, so positionAt crosses it in an instant: the
      // enemy is at one end and then at the other.
      distances.push(distances[i - 1]);
      continue;
    }
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    distances.push(distances[i - 1] + Math.hypot(bx - ax, by - ay));
  }

  // The waits: 29,766 of the 45,194 routes have at least one, so an enemy that
  // holds is the common case, not an edge case. Reading them is the difference
  // between a stage's real timing and every enemy walking the whole way without
  // pausing -- and on a hold-in-place route, between standing guard and marching
  // across the map.
  const byDistance = new Map<number, { seconds: number; point: [number, number]; tunnel: boolean }>();
  for (const raw of route.waits || []) {
    const wait = raw as { type?: string; after_checkpoint?: number; seconds?: number };
    // The other three kinds (wait_current_fragment_time, wait_current_wave_time,
    // wait_bossrush_wave -- 3,161 of 47,468) hold until a clock this model does
    // not carry, so they are left out rather than guessed at.
    if (wait.type !== 'wait_for_seconds') continue;
    const seconds = wait.seconds || 0;
    if (seconds <= 0) continue;
    const after = typeof wait.after_checkpoint === 'number' ? wait.after_checkpoint : -1;
    // Stops are the checkpoints that carry a position; a wait stated against one
    // that does not belongs to the last stop at or before it.
    let si = 0;
    for (let i = 0; i < stops.length; i++) if (stops[i].cp <= after) si = i;
    const pointIndex = stopPoints[si] ?? 0;
    const at = distances[pointIndex] ?? 0;
    const prev = byDistance.get(at);
    const total =
      (prev?.seconds || 0) >= HOLD_INDEFINITE || seconds >= HOLD_INDEFINITE
        ? HOLD_INDEFINITE
        : (prev?.seconds || 0) + seconds;
    // A wait on the checkpoint before a tunnel IS the time in the tunnel.
    const tunnel = !!prev?.tunnel || !!stops[si + 1]?.teleport;
    byDistance.set(at, { seconds: total, point: points[pointIndex], tunnel });
  }
  const holds = [...byDistance.entries()]
    .map(([at, hold]) => ({ at, seconds: hold.seconds, point: hold.point, tunnel: hold.tunnel }))
    .sort((a, b) => a.at - b.at);

  // The checkpoints themselves, which the polyline only implies: a route that
  // turns three times reads as three corners, and the corner is where a wait
  // happens.
  const nodes = stopPoints.map((i) => points[i]).filter(Boolean);

  return { points, distances, length: distances[distances.length - 1], breaks, flying, holds, nodes };
}

/** How long this path takes at that speed, holds included. A path with an
 *  indefinite hold never finishes, so it counts only up to that hold. */
function travelTime(path: PlaybackPath, speed: number): number {
  const v = Math.max(0.1, speed);
  let time = 0;
  let travelled = 0;
  for (const hold of path.holds || []) {
    if (hold.at < travelled) continue;
    time += (hold.at - travelled) / v;
    travelled = hold.at;
    if (hold.seconds >= HOLD_INDEFINITE) return time;
    time += hold.seconds;
  }
  return time + (path.length - travelled) / v;
}

/**
 * One path per route the waves actually spawn on. THE EXPENSIVE HALF.
 *
 * Kept server-side, for the reason at the top of this file: a leg between
 * checkpoints is an A* over the walkable grid, and a stage can have a hundred
 * routes. Only routes a spawn names are built -- 45,194 routes exist across the
 * dataset and most maps use a handful, so building the rest would cost time to
 * produce weight nobody reads.
 */
export function buildPlaybackPaths(geometry: StageGeometry | null): Record<number, PlaybackPath> {
  const paths: Record<number, PlaybackPath> = {};
  if (!geometry) return paths;
  for (const wave of geometry.waves || []) {
    for (const spawn of wave.spawns || []) {
      const routeIndex = typeof spawn.route === 'number' ? spawn.route : -1;
      if (routeIndex < 0 || routeIndex in paths) continue;
      const path = buildPath(geometry, routeIndex);
      if (path) paths[routeIndex] = path;
    }
  }
  return paths;
}

/**
 * Absolute spawn times over paths already built. THE CHEAP HALF.
 *
 * Arithmetic over the waves, no pathfinding, so the BROWSER does this rather than
 * the wire carrying it: the schedule is 403 spawns of {at, enemy, enemyId,
 * routeIndex, speed} on the heaviest stage, 44 kB of the page's 231, and every
 * field of it is a function of `geometry.waves` and the enemy speeds -- both of
 * which the page already has. Sending it as well as the things it is derived from
 * was the same information twice.
 *
 * Waves run in sequence: a wave's pre_delay is measured from the END of the
 * previous wave, so the cursor advances by each wave's own duration and
 * post_delay. Spawn times are seconds from the start of their own wave, which
 * the pipeline states outright. Getting this wrong collapses a two-minute stage
 * into thirty seconds.
 */
export function buildSchedule(
  geometry: StageGeometry | null,
  speedByEnemy: Record<string, number>,
  paths: Record<number, PlaybackPath>
): StagePlayback | null {
  if (!geometry) return null;
  const spawns: PlaybackSpawn[] = [];
  let cursor = 0;

  for (const wave of geometry.waves || []) {
    const waveStart = cursor + (wave.pre_delay || 0);
    for (const spawn of wave.spawns || []) {
      const routeIndex = typeof spawn.route === 'number' ? spawn.route : -1;
      // A spawn whose route has no path is skipped, exactly as it was when the
      // paths were built in this loop: a placeholder route draws nothing and
      // there is nowhere to walk it.
      if (routeIndex < 0 || !paths[routeIndex]) continue;
      const count = Math.max(1, spawn.count || 1);
      const interval = spawn.interval || 0;
      const speed = (speedByEnemy[spawn.enemy] || DEFAULT_MOVE_SPEED) * TILES_PER_SECOND;
      for (let n = 0; n < count; n++) {
        spawns.push({
          at: waveStart + (spawn.time || 0) + n * interval,
          enemy: spawn.enemy,
          enemyId: (spawn as { enemy_id?: string }).enemy_id || null,
          routeIndex,
          speed,
        });
      }
    }
    cursor = waveStart + (wave.duration || 0) + (wave.post_delay || 0);
  }

  spawns.sort((a, b) => a.at - b.at);
  // The battle is not over when the last enemy spawns -- it is over when the
  // slowest one would finish walking.
  const lastArrival = spawns.reduce((max, s) => {
    const path = paths[s.routeIndex];
    return Math.max(max, s.at + (path ? travelTime(path, s.speed) : 0));
  }, 0);
  return { duration: Math.max(cursor, lastArrival), paths, spawns };
}

/** The point a given distance along the line. */
function pointAtDistance(path: PlaybackPath, travelled: number): [number, number] {
  const { points, distances } = path;
  if (points.length === 1) return points[0];
  let i = 1;
  while (i < distances.length - 1 && distances[i] < travelled) i++;
  const segStart = distances[i - 1];
  const segLength = distances[i] - segStart || 1;
  const ratio = Math.min(1, Math.max(0, (travelled - segStart) / segLength));
  const [ax, ay] = points[i - 1];
  const [bx, by] = points[i];
  return [ax + (bx - ax) * ratio, ay + (by - ay) * ratio];
}

export interface UnitState {
  /** Null before it spawns, after it arrives, and while it is inside a tunnel. */
  pos: [number, number] | null;
  /** Seconds left of the wait it is standing out, or null when it is walking.
   *  An indefinite hold counts down to nothing, so it reports null too -- the
   *  enemy is parked, not waiting for a moment that comes. */
  waitRemaining: number | null;
}

/** Where a spawn is at time t and whether it is standing still.
 *
 * Walks the holds rather than dividing distance by speed, because an enemy that
 * stands still for 12 seconds after its first checkpoint is 12 seconds behind
 * where the plain division puts it -- and one holding indefinitely never leaves
 * the tile at all. */
export function stateAt(path: PlaybackPath, spawn: PlaybackSpawn, t: number): UnitState {
  const nowhere: UnitState = { pos: null, waitRemaining: null };
  if (t < spawn.at) return nowhere;
  const speed = Math.max(0.1, spawn.speed);
  let remaining = t - spawn.at;
  let travelled = 0;
  for (const hold of path.holds || []) {
    if (hold.at < travelled) continue;
    const legTime = (hold.at - travelled) / speed;
    if (remaining < legTime) {
      return { pos: pointAtDistance(path, travelled + remaining * speed), waitRemaining: null };
    }
    remaining -= legTime;
    travelled = hold.at;
    if (hold.seconds >= HOLD_INDEFINITE) {
      return { pos: hold.tunnel ? null : pointAtDistance(path, travelled), waitRemaining: null };
    }
    if (remaining < hold.seconds) {
      // Inside the tunnel: off the map until it comes out the other end, which is
      // what the game shows and what makes a tunnel read as one. Nothing is
      // standing there to carry a countdown.
      if (hold.tunnel) return nowhere;
      return { pos: pointAtDistance(path, travelled), waitRemaining: hold.seconds - remaining };
    }
    remaining -= hold.seconds;
  }
  const rest = travelled + remaining * speed;
  if (rest > path.length) return nowhere;
  return { pos: pointAtDistance(path, rest), waitRemaining: null };
}
