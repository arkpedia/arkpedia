import { GeometryTile } from './stageTypes';

/** Route geometry, ported from the prototype's engine.js.
 *
 * A route in gamedata is a list of checkpoints, not a path: the enemy walks
 * between them itself. Drawing straight lines between checkpoints puts routes
 * through walls and across map corners, so the walked path has to be
 * reconstructed the same way the game does it -- A* between consecutive
 * checkpoints, respecting the diagonal rule.
 *
 * Only the geometry is ported here. The prototype's engine.js also carries
 * operator stats, skills, ranges and a tick loop; those belong to the stage
 * simulator, which is a separate branch. */

type Point = [number, number];

/** The walkable grid the pathfinder needs, decoupled from the source schema:
 * `at(col, row)` returns the tile or null off-grid. */
export interface WalkGrid {
  rows: number;
  cols: number;
  at: (c: number, r: number) => GeometryTile | null;
}

export function walkGridFrom(tiles: GeometryTile[][]): WalkGrid {
  const rows = tiles.length;
  const cols = rows ? tiles[0].length : 0;
  return {
    rows,
    cols,
    at: (c, r) => (r >= 0 && r < rows && c >= 0 && c < cols ? tiles[r][c] : null),
  };
}

function walkableAt(m: WalkGrid, c: number, r: number): boolean {
  return !!m.at(c, r)?.walkable;
}

/** A* between two tiles. `cutCorners` relaxes the diagonal rule as a fallback --
 * a few routes in the data only connect if diagonal corner-cutting is allowed. */
function findPath(m: WalkGrid, a: Point, b: Point, diag: boolean, cutCorners: boolean): Point[] | null {
  if (a[0] === b[0] && a[1] === b[1]) return [a];
  if (!walkableAt(m, a[0], a[1]) || !walkableAt(m, b[0], b[1])) return null;
  const key = (c: number, r: number) => r * m.cols + c;
  const h = (c: number, r: number) => {
    const dx = Math.abs(c - b[0]);
    const dy = Math.abs(r - b[1]);
    return diag ? Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy) : dx + dy;
  };
  const g = new Map<number, number>();
  const from = new Map<number, Point>();
  const open: [number, number, number][] = [[h(a[0], a[1]), a[0], a[1]]];
  g.set(key(a[0], a[1]), 0);
  const steps = diag
    ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
    : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // The grid is at most a few hundred tiles, so this only ever trips on
  // malformed data -- but it runs at build time for 379 stages, so it is bounded.
  let guard = 0;
  while (open.length) {
    if (++guard > 20000) return null;
    open.sort((p, q) => p[0] - q[0]);
    const [, c, r] = open.shift()!;
    if (c === b[0] && r === b[1]) {
      const out: Point[] = [];
      let k = key(c, r);
      let cc = c;
      let rr = r;
      for (;;) {
        out.unshift([cc, rr]);
        const p = from.get(k);
        if (!p) break;
        [cc, rr] = p;
        k = key(cc, rr);
      }
      return out;
    }
    const gc = g.get(key(c, r))!;
    for (const [dc, dr] of steps) {
      const nc = c + dc;
      const nr = r + dr;
      if (!walkableAt(m, nc, nr)) continue;
      if (dc && dr && !cutCorners) {
        if (!walkableAt(m, c + dc, r) || !walkableAt(m, c, r + dr)) continue;
      }
      const cost = gc + (dc && dr ? Math.SQRT2 : 1);
      const nk = key(nc, nr);
      if (g.has(nk) && g.get(nk)! <= cost) continue;
      g.set(nk, cost);
      from.set(nk, [c, r]);
      open.push([cost + h(nc, nr), nc, nr]);
    }
  }
  return null;
}

/** Pathfind one leg of a route. The playback work (routes walked at real
 * movement speed) builds on this; the map currently draws checkpoint-to-
 * checkpoint straight lines, which is not the walked path. */
export function pathBetween(grid: WalkGrid, a: Point, b: Point, diag = true): Point[] | null {
  return findPath(grid, a, b, diag, false) || findPath(grid, a, b, diag, true);
}
