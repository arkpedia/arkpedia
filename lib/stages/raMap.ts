import fs from 'fs';
import path from 'path';
import type { RaNodeData } from '@/components/stages/RaMap';

/**
 * The Reclamation Algorithm map, for the one content page that draws it.
 *
 * Read from disk at build time rather than imported, so the 30kB of node data lands in
 * that one page's props instead of in the bundle every content page shares. Written by
 * scripts/imports/import-ra-nodes.mjs -- the surveyed nodes, credited on the page.
 *
 * data/ra-map.json, the game's own zone polygons, is no longer drawn: the art already
 * prints the region names and the borders over it were clutter. It stays in the repo
 * because it is what proved the node positions were in the game's coordinate space --
 * see the header of scripts/import-ra-nodes.mjs.
 */

/**
 * The season a node file without a `contentId` belongs to: the only one the importer
 * has ever surveyed (it reads sandbox_perm_table's SANDBOX_V2.sandbox_1). Files written
 * before the field existed are that season's, exactly.
 */
export const RA_SURVEYED_SEASON = 'sandbox_1';

/**
 * The surveyed map of one Reclamation Algorithm season, or null when that season has
 * none. It used to ignore which season was asked for and return the one file there is,
 * so a second season would have drawn the first season's map.
 */
export function raMapData(contentId: string): RaNodeData | null {
  const at = path.join(process.cwd(), 'data', 'ra-nodes.json');
  // Missing is a data problem, not a page problem: the stage list still renders.
  if (!fs.existsSync(at)) return null;
  const data = JSON.parse(fs.readFileSync(at, 'utf8')) as RaNodeData & { contentId?: string };
  return (data.contentId ?? RA_SURVEYED_SEASON) === contentId ? data : null;
}
