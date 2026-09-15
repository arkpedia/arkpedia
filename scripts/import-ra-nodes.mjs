#!/usr/bin/env node
/**
 * Imports the Reclamation Algorithm node map from QingXia-Ela/reclamation-algorithm-map.
 *
 *   node scripts/import-ra-nodes.mjs
 *
 * WHOSE WORK THIS IS. The node positions, the paths between them, and the per-node
 * resource tallies are that project's, not ours and not the gamedata's. The game ships
 * the map's ZONE geometry (see scripts/build-ra-map.mjs) but gives each of its 127
 * nodes a single field, minDistance, with no coordinates anywhere -- so someone had to
 * put the nodes on the map by hand, and they did. The repo carries no licence, so this
 * is used with credit and a link, which the map view prints under it; if the author
 * asks us to stop, the import is one file and one component to remove.
 *
 * WHY IT CAN BE TRUSTED. It agrees with gamedata we extracted independently:
 *
 *   Their space is the game's, scaled. Their node extent spans 174.65 x 175.36 in a
 *   200-unit box; the game's zones span 4716 x 4755 in a 5400-unit camera. The ratio is
 *   27.00 and 27.12 -- 5400/200 = 27, so their units are the game's over 27.
 *
 *   At that scale their base node lands 53 units from the centre the game gives the
 *   Headquarters zone, on a map 5400 units wide -- 1%. Flip Y instead and it is 407.
 *
 *   Three of their four `gate` nodes sit 3, 17 and 28 units from a zone border, where
 *   the median node is 208 from one. Gates are the passes between regions, so they
 *   belong on the borders, and they are on ours.
 *
 * The join to our stages is by name, through the CN dump: their node names are the
 * Chinese stage names, cn sandbox_perm_table maps those to stage ids, and the EN dump
 * carries the same ids. All 127 nodes resolve, onto 84 distinct operations -- several
 * operations have more than one node on the map, which is why our stage list has been
 * showing pairs like 'Greeting Gallery' twice. The other 22 of our 106 are not on the
 * overworld at all: the mode has 58 further maps for its hunts and rifts, and that
 * project surveys four of them separately.
 *
 * Pinned to a commit rather than to HEAD: the map is someone else's living document,
 * and a silent change to it should not silently change our page.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const REPO = 'QingXia-Ela/reclamation-algorithm-map';
const COMMIT = 'c9a536dcc738b27c591ad329198e650aeb7657aa';   // Release 1.0.2, 2025-01-10
const RAW = `https://raw.githubusercontent.com/${REPO}/${COMMIT}`;
const HOME = `https://qingxia-ela.github.io/reclamation-algorithm-map/`;

/** Their units -> the game's. See the header for how this was established. */
const SCALE = 27;

/**
 * The five maps they surveyed.
 *
 * The overworld, and the four FIXED rifts -- the 百变陌域 layouts that always come out
 * the same. Named with the game's own words for their objectives, out of
 * sandbox_perm_table's riftMainTargetData: boss_hunt is "Conflict" ("Locate and defeat
 * Lost Colossus"), defend_base "Defense" ("Protect the forward camp and survive 4
 * nights"), miner_convoy "Escort", thief_cap "Annihilation" ("Defeat 1 wave of
 * bandits"). Their own names for these files are the Chinese equivalents.
 *
 * Their 16 rift TEMPLATES are deliberately not here: 百变陌域模板 is a shape a rift can
 * be generated in, not a place, so there is nothing for a reader to go and find.
 *
 * `tail` is the offset that numbers the nodes their export leaves without an id. The
 * overworld needs 2 (see below); the rift files carry no ids at all and their adjacency
 * runs 1..N over N nodes, which is 1-based position -- checked the same way, by edge
 * length: read as positions the four maps give medians of 21, 19, 16 and 38 units
 * against random-pair medians of 22, 24, 28 and 43, and one step further out the
 * maxima blow up to 39, 51, 33 and 98.
 */
/*
 * The overworld, and only the overworld.
 *
 * The source also ships four map_dungeon_* files -- the layouts for the mode's Strange
 * Territory expeditions (陌域), one per objective family: boss_hunt/Conflict,
 * defend_base/Defense, miner_convoy/Escort, thief_cap/Annihilation, all four named by
 * riftMainTargetData. Those were imported and drawn for a while and are now dropped,
 * for the plainest possible reason: held up against a screenshot of the real thing in
 * game, they are not the same maps. Nothing in the gamedata could have caught that --
 * every node on every one of the season's 59 maps carries a single field, minDistance
 * -- so the check had to be a human who has played it, and it failed.
 *
 * The overworld is a different case: its 127 nodes, their paths and their yields all
 * match the game, which is why it stays. The operations that were only ever on a rift
 * layout are back in the list beside the rest.
 */
const MAPS = [
  // The overworld has no name in the gamedata -- the source calls it 主地图, "main map"
  // -- so this one label is ours.
  { id: 'main', file: 'map_main', name: 'The Great Desert', art: 'main.webp', tail: 2, hub: true },
];

const CN = process.env.ARKPEDIA_CN || path.join(ROOT, '.cache/upstream/cn-resource/gamedata');
const EN = process.env.ARKPEDIA_EN || path.join(ROOT, '.cache/upstream/en-gamedata/en/gamedata');

function fetchText(url) {
  return execFileSync('curl', ['-sfL', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function sandbox(dir) {
  const table = JSON.parse(fs.readFileSync(path.join(dir, 'excel', 'sandbox_perm_table.json'), 'utf8'));
  return table.detail.SANDBOX_V2.sandbox_1;
}

const cn = sandbox(CN);
const en = sandbox(EN);
/*
 * A node names its stage in Chinese and nothing else, so this is the join. Four names
 * belong to two stages each -- Headquarters, 'Greeting Gallery', 'Treasury' and
 * Crossroads all ship a beginner-mode cut beside the ordinary one (see
 * scripts/stage-pipeline/lib/rabeginner.mjs) -- and the ordinary one has to win: the
 * beginner cut is folded into it as a variant and has no page of its own to link to.
 * Built last-wins before this, which handed three of the four nodes the wrong cut.
 */
const PLAIN_LEVEL = /^level_[a-z0-9]+_\d+$/;
const idByChineseName = new Map();
for (const [id, stage] of Object.entries(cn.stageData)) {
  const ordinary = PLAIN_LEVEL.test((stage.levelId || '').split('/').pop() || '');
  const kept = idByChineseName.get(stage.name);
  if (kept !== undefined && !ordinary) continue;
  idByChineseName.set(stage.name, id);
}

// Our own slug for a gamedata stage id, from the records: the RA stages are level-only,
// so their slugs are built from the level path and cannot be guessed from the id.
const slugByStageId = new Map();
const nameBySlug = new Map();
for (const file of fs.readdirSync(path.join(ROOT, 'data', 'stages'))) {
  if (!file.endsWith('.json')) continue;
  const rec = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'stages', file), 'utf8'));
  if (rec.content?.id !== 'sandbox_1') continue;
  // A record's id is the level path; the stageData id (sandbox_1_07) is what we need,
  // and the two meet at the levelId.
  const level = (rec.id || '').toLowerCase();
  for (const [sid, stage] of Object.entries(en.stageData)) {
    if ((stage.levelId || '').toLowerCase() === level) {
      slugByStageId.set(sid, rec.slug);
      nameBySlug.set(rec.slug, rec.name);
    }
  }
}
/**
 * The map art. The overworld's is the game's own sandbox_1_main_0 -- the backgroundId
 * the gamedata gives that map -- and the four rifts share one 2048-square dungeon
 * texture, which is how their own renderer does it (their background/index.ts loads
 * background.avif for `main` and dungeon.avif for everything else).
 *
 * Both are placed centred on the origin, spanning the map's own backgroundSize in their
 * units: 200 for the overworld, and 160, 140, 120 or 80 for a rift. Checked against the
 * art on the overworld: all five region names printed on it fall inside the zone polygon
 * the gamedata gives that region.
 */
function fetchImage(url, to) {
  execFileSync('curl', ['-sfL', url, '-o', to]);
}

/** Convert one fetched picture to webp, at the quality its content deserves. */
function toWebp(from, to, lossless) {
  execFileSync('python3', ['-c', [
    'import sys',
    'from PIL import Image',
    'im = Image.open(sys.argv[1])',
    'im = im.convert("RGBA") if sys.argv[3] == "1" else im.convert("RGB")',
    'im.save(sys.argv[2], "WEBP", **({"lossless": True} if sys.argv[3] == "1" else {"quality": 78}), method=6)',
  ].join('\n'), from, to, lossless ? '1' : '0']);
}

function art(remote, name, lossless = false) {
  const to = path.join(ROOT, 'public', 'ra-map', name);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (fs.existsSync(to) && !process.env.ARKPEDIA_REFETCH_ART) return false;
  const tmp = path.join(ROOT, '.cache', `ra_art_${name}`);
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fetchImage(`${RAW}/src/assets/three/${remote}`, tmp);
  toWebp(tmp, to, lossless);
  fs.rmSync(tmp, { force: true });
  return true;
}

// 6.7MB of PNG is 447KB of webp at q78, and the dungeon texture 100KB of avif is
// smaller still. Both are photographs rather than flat art, so neither is lossless.
if (art('sandbox_1_main_0.png', 'main.webp')) console.log('art -> public/ra-map/main.webp');
if (art('dungeon.avif', 'dungeon.webp')) console.log('art -> public/ra-map/dungeon.webp');

/**
 * The node and resource glyphs, which are the game's own art too -- the icons the map
 * draws on every node, and the little tallies of what it yields.
 *
 * All of them arrive as WHITE on alpha, so they are masks rather than pictures: the map
 * paints a light glyph on a dark plate for the places you work and inverts it for the
 * places you pass through, out of one file each. Only the kinds this map actually uses
 * are fetched -- 14 of their 19 node types, and the 11 resources our nodes name.
 *
 * Weather: every node on this map reads `normal`, so the icon carries no information --
 * but the label plate has a chip for it and looks wrong without one, so the single
 * `normal` cloud comes along. The other nine are not fetched.
 */
const NODE_ICONS = ['base', 'battle', 'cave', 'collect', 'encounter', 'expedition', 'gate',
  'hunt', 'market', 'mine', 'nest', 'outpost', 'racing', 'selection'];
// gold and goodsundry are not in their node folder; they are in the app's own icon set.
const RES_ICONS = {
  beef: 'components/node/resources_icon/sandbox_1_beef.png',
  crab: 'components/node/resources_icon/sandbox_1_crab.png',
  diamond: 'components/node/resources_icon/sandbox_1_diamond.png',
  iron: 'components/node/resources_icon/sandbox_1_iron.png',
  poultry: 'components/node/resources_icon/sandbox_1_poultry.png',
  stone: 'components/node/resources_icon/sandbox_1_stone.png',
  venison: 'components/node/resources_icon/sandbox_1_venison.png',
  water: 'components/node/resources_icon/sandbox_1_water.png',
  wood: 'components/node/resources_icon/sandbox_1_wood.png',
  gold: 'components/node/resources_icon/sandbox_1_gold.png',
  goodsundry: '../icons/resource/sandbox_1_goodsundry.png',
};

function icon(from, to) {
  if (fs.existsSync(to) && !process.env.ARKPEDIA_REFETCH_ART) return false;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const tmp = path.join(ROOT, '.cache', 'ra_icon.png');
  fetchImage(`${RAW}/src/assets/three/${from}`, tmp);
  // Lossless: these are 30-60px of flat glyph, where lossy webp costs edges and saves
  // nothing worth having.
  execFileSync('python3', ['-c', [
    'import sys',
    'from PIL import Image',
    'im = Image.open(sys.argv[1]).convert("RGBA")',
    'im = im.crop(im.getbbox() or (0, 0, *im.size))',
    'im.save(sys.argv[2], "WEBP", lossless=True, method=6)',
  ].join('\n'), tmp, to]);
  fs.rmSync(tmp, { force: true });
  return true;
}

let icons = 0;
for (const type of NODE_ICONS) {
  icons += icon(`components/node/node_type/node_${type}.png`,
    path.join(ROOT, 'public', 'ra-map', 'node', `${type}.webp`)) ? 1 : 0;
}
for (const [res, from] of Object.entries(RES_ICONS)) {
  icons += icon(from, path.join(ROOT, 'public', 'ra-map', 'res', `${res}.webp`)) ? 1 : 0;
}
icons += icon('components/node/weather_icon/weather_normal.png',
  path.join(ROOT, 'public', 'ra-map', 'weather-normal.webp')) ? 1 : 0;
if (icons) console.log(`${icons} glyphs -> public/ra-map/node/ and public/ra-map/res/`);

/**
 * The id of every node, including the sixteen the export leaves without one.
 *
 * Their last 16 nodes (array positions 112-127) carry no `id` field, and the adjacency
 * references ids 114-127 that no node claims -- so 43 edge halves had nowhere to
 * attach and the map drew a third of its paths short.
 *
 * The explicit ids run AHEAD of array position by a step that grows at two points:
 * offset 0 from position 1, 1 from position 22, 2 from position 103. Continuing that
 * last offset onto the tail is the reading, and it is the reading the geometry picks
 * out of the three candidates:
 *
 *   position + 0   145 edges, max 2529 units, 18 of them over 700
 *   position + 1   145 edges, max 2441 units, 16 over 700
 *   position + 2   145 edges, max  965 units,  3 over 700   <-- and edges are 374 median
 *   position + 3   does not even cover id 114
 *
 * A map's paths join neighbours, so 2500-unit edges across a 5400-unit map are a wrong
 * answer and 965 is a long path. It also lands ids 128 and 129 on the Headquarters and
 * the market, which the adjacency never mentions -- consistent rather than convenient.
 */
const TAIL_OFFSET = 2;

/**
 * One map: its nodes in the game's coordinates, and the paths between them.
 *
 * `tail` numbers the nodes their export leaves without an id -- see MAPS for how each
 * map's offset was established. Everything else is the same for all five.
 */
function readMap(map) {
  const theirs = JSON.parse(fetchText(`${RAW}/public/maps/${map.file}.json`));
  const unresolved = [];
  const nodes = theirs.nodes.map((node, at) => {
    const stageId = idByChineseName.get(node.name) ?? null;
    const slug = stageId ? slugByStageId.get(stageId) ?? null : null;
    if (!slug) unresolved.push(node.name);
    return {
      id: node.id ?? at + 1 + map.tail,
      // In the game's own coordinates, Y up. A renderer flips Y once for everything.
      x: Math.round(node.x * SCALE * 10) / 10,
      y: Math.round(node.y * SCALE * 10) / 10,
      // What kind of place it is: collect, hunt, battle, cave, mine, nest, gate,
      // outpost, market, base, racing, encounter, expedition, selection.
      type: node.type,
      // The two fields their renderer takes the marker's SHAPE from.
      size: node.size ?? null,
      border: node.border ?? 'square',
      weather: node.weather ?? null,
      slug,
      name: slug ? nameBySlug.get(slug) ?? null : null,
      // What the node yields, which is the question this mode is played for.
      resources: (node.mainResources || []).map((r) => ({ type: r.type, count: r.count })),
    };
  });

  /**
   * The paths. Their adjacency is keyed by node id and lists each pair from both ends,
   * so this halves it -- and drops any pair whose endpoints are not both real nodes,
   * which is what the -1 placeholder their editor writes leaves behind.
   */
  const known = new Set(nodes.map((n) => n.id));
  const seen = new Set();
  const edges = [];
  let dropped = 0;
  const add = (a, b) => {
    if (!known.has(a) || !known.has(b) || a === b) { dropped += 1; return; }
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push([Math.min(a, b), Math.max(a, b)]);
  };
  for (const [from, to] of Object.entries(theirs.adjancyList || {})) {
    for (const other of to) add(Number(from), Number(other));
  }

  /**
   * The Headquarters' own three paths, which the overworld's export does not carry.
   *
   * Its id is never mentioned in the adjacency, so the hub of the whole map sat with no
   * paths at all -- while the game draws it joined to its three outposts, and there are
   * exactly three outposts in the data. They sit 380, 386 and 401 units from it against
   * a median edge of 374: one ordinary hop each. The market, 333 away, is left alone
   * because the game draws no path to that one either.
   */
  if (map.hub) {
    const hub = nodes.find((n) => n.type === 'base');
    if (hub) for (const post of nodes.filter((n) => n.type === 'outpost')) add(hub.id, post.id);
  }

  return {
    id: map.id,
    name: map.name,
    art: `/ra-map/${map.art}`,
    // The art's extent in the same units as the nodes, from the map's own
    // backgroundSize. Square, unless the picture says otherwise.
    span: (theirs.metadata?.backgroundSize ?? 200) * SCALE,
    aspect: map.id === 'main' ? 2034 / 2008 : 1,
    nodes,
    edges: edges.sort((p, q) => p[0] - q[0] || p[1] - q[1]),
    _report: { unresolved, dropped, idless: theirs.nodes.filter((n) => n.id == null).length },
  };
}

const maps = MAPS.map(readMap);

const out = {
  // Printed by the map view. Not optional, and not only in a comment: this is
  // someone else's survey of these maps.
  source: {
    name: 'Reclamation Algorithm Map',
    author: 'QingXia-Ela',
    repo: `https://github.com/${REPO}`,
    site: HOME,
    commit: COMMIT,
    what: 'node positions, the paths between them, and the per-node resource tallies',
  },
  scale: SCALE,
  maps: maps.map(({ _report, ...map }) => map),
};
fs.writeFileSync(path.join(ROOT, 'data', 'ra-nodes.json'), JSON.stringify(out));

const all = new Set(maps.flatMap((m) => m.nodes.map((n) => n.slug)).filter(Boolean));
console.log(`${maps.length} maps -> data/ra-nodes.json`);
for (const m of maps) {
  const ops = new Set(m.nodes.map((n) => n.slug).filter(Boolean)).size;
  console.log(`  ${m.name.padEnd(18)} ${String(m.nodes.length).padStart(3)} nodes, `
    + `${String(m.edges.length).padStart(3)} paths, ${ops} operations, span ${m.span}`
    + (m._report.unresolved.length ? `  unresolved: ${m._report.unresolved.join(', ')}` : ''));
}
console.log(`  ${all.size} of our RA operations appear on a map`);
console.log(`  credit: ${out.source.author} -- ${out.source.site}`);
