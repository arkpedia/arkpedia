#!/usr/bin/env node
/**
 * The in-game map renders of stages that have none published, from the CN mirror's map/.
 *
 * The stage build (scripts/stage-pipeline/build.mjs) gives a stage a `preview` only when
 * arkpedia-image-assets already publishes stages-images/<stem>.webp for its layout, and until
 * this step nothing ever added one: every render there came from the initial import, so a new
 * event's stages -- all of People, A People, live since 09-16 -- showed the event's poster in
 * place of their maps while the CN mirror (yuanyan3060/ArknightsGameResource, map/, at the
 * commit this run pinned) had every one of them.
 *
 * For each layout (preview.mjs: one render per layout, named after its canonical stage):
 *
 *   published   every record of the layout still without a preview gets it -- the stage
 *               build does the same, but this also runs again after the staged-art stage
 *               has published new renders, so they reach the records the same day;
 *   in map/     the render is staged in .cache/stage-renders/<stem>.png, with its mirror path,
 *               commit and blob (scripts/lib/staged-art.mjs), and reported under
 *               'stage-renders' until a run publishes it, which the staged-art stage does;
 *   neither     nothing to do here. A stage of a running event with a map and no preview is
 *               held by the completeness stage, whatever the reason.
 *
 * map/ keys renders by stage id (tr_01.png, act51side_01.png), and a few by the level's own
 * name (crisis_v2_01-02.png) or that name with _1 (act24side_09_1.png); tried in that order,
 * canonical stage first. A preview once set is never changed or removed here.
 *
 * NOTHING HERE PUBLISHES, and nothing is written under public/ (check:assets refuses it).
 *
 * Run after the stage build:  node scripts/imports/import-stage-renders.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { excel } from '../stage-pipeline/lib/gamedata.mjs';
import { groupStagesByLevel, assignStageSlugs } from '../stage-pipeline/lib/preview.mjs';
import { assetFileNames } from '../lib/public-assets.mjs';
import { beginStage } from '../lib/quarantine.mjs';
import { beginStaging } from '../lib/staged-art.mjs';
import { pinnedRef } from '../content/pin-upstream.mjs';

export const STAGE = 'stage-renders';
const MIRROR = 'yuanyan3060/ArknightsGameResource';

/** The map/ file names that may hold a layout's render, best first. */
export function renderCandidates(canonical, members, stages) {
  const names = [canonical, ...members.filter(id => id !== canonical && !id.includes('#'))];
  const level = String(stages[canonical]?.levelId ?? '').replace(/\\/g, '/').split('/').pop().toLowerCase().replace(/^level_/, '');
  if (level) names.push(level, `${level}_1`);
  return [...new Set(names)].map(name => `${name}.png`);
}

/**
 * What to do for each layout: {adopt: Map(slug -> preview), stage: [{stem, file, slugs}]}.
 * `records` are the stage records ({slug, id, preview}); `published` the stems
 * stages-images/ holds; `mapFiles` the names map/ holds (null: no CN art this run).
 */
export function planRenders({ stages, records, published, mapFiles }) {
  const groups = groupStagesByLevel(stages);
  const stems = assignStageSlugs([...groups.keys()], stages);
  const canonicalOf = new Map();
  for (const [canonical, members] of groups) for (const member of members) canonicalOf.set(member, canonical);
  const waiting = new Map(); // canonical -> records without a preview
  for (const record of records) {
    const canonical = canonicalOf.get(record.id);
    if (!canonical || record.preview) continue;
    if (!waiting.has(canonical)) waiting.set(canonical, []);
    waiting.get(canonical).push(record);
  }
  const adopt = new Map(), stage = [];
  for (const [canonical, list] of waiting) {
    const stem = stems.get(canonical);
    if (published.has(stem)) {
      for (const record of list) adopt.set(record.slug, `images/stages/${stem}.png`);
      continue;
    }
    if (!mapFiles) continue;
    const file = renderCandidates(canonical, groups.get(canonical), stages).find(name => mapFiles.has(name));
    if (file) stage.push({ stem, file, records: list });
  }
  stage.sort((a, b) => (a.stem < b.stem ? -1 : a.stem > b.stem ? 1 : 0));
  return { adopt, stage };
}

export function importStageRenders({ root = process.cwd(), stages = excel('stage_table').stages, cn = process.env.ARKPEDIA_CN || '.cache/upstream/cn-resource', log = console.log } = {}) {
  const stagesDir = path.join(root, 'data', 'stages');
  const files = new Map();
  const records = [];
  for (const name of fs.readdirSync(stagesDir).filter(file => file.endsWith('.json')).sort()) {
    const text = fs.readFileSync(path.join(stagesDir, name), 'utf8');
    const record = JSON.parse(text);
    files.set(record.slug, { name, record });
    records.push(record);
  }
  const published = new Set(assetFileNames('stages-images', root).filter(file => file.endsWith('.webp')).map(file => file.slice(0, -'.webp'.length)));
  const mapDir = path.resolve(root, cn, 'map');
  const mapFiles = fs.existsSync(mapDir) ? new Set(fs.readdirSync(mapDir)) : null;
  const { adopt, stage } = planRenders({ stages, records, published, mapFiles });

  for (const [slug, preview] of adopt) {
    const { name, record } = files.get(slug);
    record.preview = preview;
    // The build writes records compact; parse and stringify round-trip them byte for byte.
    fs.writeFileSync(path.join(stagesDir, name), JSON.stringify(record));
  }

  const commit = pinnedRef(MIRROR);
  const pinned = /^[0-9a-f]{40}$/.test(commit);
  const staging = beginStaging('stage-renders', root);
  // Without the CN art this run nothing could be staged, and nothing said about the renders
  // still waiting has changed: their entries stay as the last run left them.
  const alerts = mapFiles ? beginStage(root, STAGE) : null;
  for (const { stem, file, records: waiting } of stage) {
    const source = `https://raw.githubusercontent.com/${MIRROR}/${commit}/map/${file}`;
    staging.stage(`stages-images/${stem}.webp`, fs.readFileSync(path.join(mapDir, file)), {
      source, mirror: pinned ? { repository: MIRROR, path: `map/${file}`, commit } : undefined,
    });
    const codes = [...new Set(waiting.map(record => record.code || record.slug))].sort();
    const content = waiting[0].content?.name;
    alerts?.add({ key: `stage-render:${stem}`, action: 'published-partial', sourceRef: source,
      reason: `${codes.join(', ')}${content ? ` (${content})` : ''}: the in-game render map/${file} is staged as .cache/stage-renders/${stem}.png, `
        + `but no run has published it to arkpedia-image-assets as stages-images/${stem}.webp yet; `
        + `${waiting.length === 1 ? 'the stage is' : 'these stages are'} published without a map preview until one does.` });
  }
  staging.commit();
  alerts?.commit();
  log(`${adopt.size} stage record(s) given their published render; ${stage.length} render(s) staged in .cache/stage-renders/ for arkpedia-image-assets`
    + (mapFiles ? '' : ' (no CN art this run: nothing could be staged)'));
  for (const { stem, file } of stage.slice(0, 20)) log(`  + stages-images/${stem}.webp <- map/${file}`);
  return { adopted: [...adopt.keys()], staged: stage.map(entry => entry.stem) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) importStageRenders();
