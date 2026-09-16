#!/usr/bin/env node
/**
 * Writes data/ra-map.json: the shape of Reclamation Algorithm's overworld.
 *
 * RA is the one mode whose operations are PLACES on a map rather than a sequence, and
 * a list of 106 cards all reading RA-NO says nothing about where any of them is. The
 * game's own map geometry is in the gamedata, so this takes it:
 *
 *   sandbox_perm_table
 *     .detail.SANDBOX_V2.sandbox_1
 *       .gameConst.mainMapId          "sandbox_1_main_0" -- the overworld, as against
 *                                     the 58 hunt and rift maps beside it
 *       .mapData[mainMapId].zones     one polygon per region: real vertices, a centre,
 *                                     and whether the game draws its border
 *       .mapData[mainMapId].mapConfig the camera bounds, which are the map's own
 *                                     coordinate space: -2700..2700 on both axes
 *       .zoneData                     the regions' names, and the two-line form the
 *                                     game prints on the map itself
 *
 * WHAT IS NOT IN HERE, and why the map needs hand-traced node positions on top:
 *
 *   Every one of the main map's 127 nodes carries exactly ONE field, minDistance --
 *   no x, no y. The node ids appear nowhere else in the dump except five entries in
 *   buildingNodeScoreData. Checked against the CN table as well as the EN one: both
 *   agree, so this is not an EN-dump omission.
 *
 *   And no stage carries a place. All 106 RA stages hold stageId, levelId, code
 *   (RA-NO for every single one), name, description, actionCost and
 *   actionCostEnemyRush. There is no zoneId and no nodeId, so even a perfect node
 *   layout could not be joined to the stages by data alone.
 *
 * So the zones come from here and the nodes come from data/ra-nodes.json, which is
 * traced by hand against a screenshot of the live map -- see scripts/ra-tracer.
 *
 * Run:  node scripts/build/build-ra-map.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const EN = process.env.ARKPEDIA_EN || path.join(ROOT, '.cache/upstream/en-gamedata/en/gamedata');

const file = path.join(EN, 'excel', 'sandbox_perm_table.json');
if (!fs.existsSync(file)) {
  throw new Error(`missing ${file}\n  run scripts/sync/refresh-stage-data.sh, which syncs the upstream cache first`);
}
const table = JSON.parse(fs.readFileSync(file, 'utf8'));

const season = ((table.detail || {}).SANDBOX_V2 || {}).sandbox_1;
if (!season) throw new Error('sandbox_perm_table has no detail.SANDBOX_V2.sandbox_1');

const mainId = (season.gameConst || {}).mainMapId;
const main = (season.mapData || {})[mainId];
if (!main) throw new Error(`sandbox_perm_table has no mapData for ${mainId}`);

const named = season.zoneData || {};
const round = (n) => Math.round(n * 10) / 10;   // a tenth of a map unit is 0.005% of it

const zones = Object.entries(main.zones || {})
  // Sorted by id so the file is stable and z_1_0 (Headquarters) leads.
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  .map(([id, zone]) => {
    const meta = named[id] || {};
    return {
      id,
      name: meta.zoneName || id,
      // The game prints the name on the map only for the five outer regions;
      // Headquarters is drawn with its building instead of a label.
      labelled: !!meta.displayName,
      // Its own line breaks, which is how the game sets these on two lines.
      label: meta.appellation || meta.zoneName || id,
      center: { x: round(zone.center.x), y: round(zone.center.y) },
      border: !!zone.hasBorder,
      vertices: (zone.vertices || []).map((v) => ({ x: round(v.x), y: round(v.y) })),
    };
  });

const config = main.mapConfig || {};
const out = {
  // The map's own coordinate space. Y is UP here, as in the game; a renderer has to
  // flip it, since SVG and every screen coordinate system have Y down.
  camera: {
    min: { x: config.cameraBoundMin?.x ?? -2700, y: config.cameraBoundMin?.y ?? -2700 },
    max: { x: config.cameraBoundMax?.x ?? 2700, y: config.cameraBoundMax?.y ?? 2700 },
  },
  zones,
  // Recorded rather than used: proof of what the geometry does and does not cover, so
  // the next person does not go looking for coordinates that are not there.
  nodeCount: Object.keys(main.nodes || {}).length,
  centerNodeId: main.centerNodeId ?? null,
};

fs.writeFileSync(path.join(ROOT, 'data', 'ra-map.json'), JSON.stringify(out));

const span = out.camera.max.x - out.camera.min.x;
console.log(`${zones.length} zones over a ${span}x${out.camera.max.y - out.camera.min.y} map`);
for (const z of zones) {
  console.log(`  ${z.id.padEnd(8)} ${z.name.padEnd(24)} ${String(z.vertices.length).padStart(2)} vertices`
    + `${z.labelled ? '' : '  (unlabelled in game)'}`);
}
console.log(`  ${out.nodeCount} nodes on this map carry no position in the gamedata -- see data/ra-nodes.json`);
