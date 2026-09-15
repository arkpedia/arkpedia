import fs from 'fs';
import path from 'path';
import type { RaNodeData } from '@/components/RaMap';

/**
 * The Reclamation Algorithm map, for the one content page that draws it.
 *
 * Read from disk at build time rather than imported, so the 30kB of node data lands in
 * that one page's props instead of in the bundle every content page shares. Written by
 * scripts/import-ra-nodes.mjs -- the surveyed nodes, credited on the page.
 *
 * data/ra-map.json, the game's own zone polygons, is no longer drawn: the art already
 * prints the region names and the borders over it were clutter. It stays in the repo
 * because it is what proved the node positions were in the game's coordinate space --
 * see the header of scripts/import-ra-nodes.mjs.
 */
export function raMapData(): RaNodeData | null {
  const at = path.join(process.cwd(), 'data', 'ra-nodes.json');
  // Missing is a data problem, not a page problem: the stage list still renders.
  if (!fs.existsSync(at)) return null;
  return JSON.parse(fs.readFileSync(at, 'utf8'));
}
