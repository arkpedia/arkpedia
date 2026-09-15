#!/usr/bin/env node
/**
 * Writes data/excluded-contents.json: the limited-time special game modes whose
 * stages never become playable again, so the list does not offer them.
 *
 * The distinction is not "was it limited-time" -- every event is. It is whether
 * the content comes back: a side story reruns and then joins the permanent
 * Records section, while a one-off game mode (Stronghold Protocol's autochess
 * board, the Icebreaker Games' multiplayer, an April Fools' joke) closes and is
 * gone. Those are also not tower-defense stages, so a map, a route diagram and an
 * enemy roster say little about them.
 *
 * activity_table.json's own `type` per activity is what selects them, rather than
 * a list of names to keep up to date.
 *
 * Deliberately NOT excluded, though they are limited-time modes too: BOSS_RUSH
 * (Trials for Navigator, 78 stages) and VEC_BREAK/VEC_BREAK_V2 (Vector
 * Breakthrough, 80) run ordinary stages on ordinary maps, so the page has
 * something real to show for them.
 *
 * Re-run after regenerating the dataset:  node scripts/build-mode-exclusions.mjs
 */
import fs from 'fs';
import path from 'path';

const EN = `${process.env.ARKPEDIA_EN || '.cache/upstream/en-gamedata/en'}/gamedata/excel`;

/** Content kinds dropped whole. `guide` is the two "???" tutorial stages, which
 *  have no code, no name and nothing to read. */
const MODE_KINDS = new Set(['guide']);

/** Activity types that are a game mode rather than a story episode. */
const MODE_TYPES = new Set([
  'AUTOCHESS_SEASON',    // Stronghold Protocol
  'AUTOCHESS_VERIFY1',   // Stronghold Protocol (first run)
  'MULTIPLAY',           // Defense Protocols
  'MULTIPLAY_V3',        // Icebreaker Games
  'MULTIPLAY_VERIFY2',   // Rhodes Island Icebreaker Games
  'APRIL_FOOL',          // the April Fools' events
  'ENEMY_DUEL',          // Duel Channel
  'ARCADE',              // Poly Vision Museum
  'HALFIDLE_VERIFY1',    // Rebuilding Mandate
  'INTERLOCK',           // Hymnoi Wisdom
]);

const root = process.cwd();
const acts = JSON.parse(fs.readFileSync(path.join(EN, 'activity_table.json'), 'utf-8')).basicInfo;
const contents = JSON.parse(fs.readFileSync(path.join(root, 'data', 'stages-content.json'), 'utf-8'));
// Counted off data/stages/ rather than the index, because the index is where the
// exclusions are applied -- counting there would report 0 on every re-run.
const stagesDir = path.join(root, 'data', 'stages');
const stageCount = new Map();
for (const file of fs.readdirSync(stagesDir)) {
  if (!file.endsWith('.json')) continue;
  const rec = JSON.parse(fs.readFileSync(path.join(stagesDir, file), 'utf-8'));
  const id = rec.content?.id;
  if (id) stageCount.set(id, (stageCount.get(id) || 0) + 1);
}

const excluded = {};
for (const [contentId, content] of Object.entries(contents)) {
  if (MODE_KINDS.has(content.kind)) {
    excluded[contentId] = { name: content.name, type: content.kind, stages: stageCount.get(contentId) || 0 };
    continue;
  }
  if (content.kind !== 'event') continue;
  // A content id is an activity id, sometimes with a zone suffix.
  const activity =
    acts[contentId] || Object.entries(acts).find(([id]) => contentId.startsWith(`${id}_`) || contentId.startsWith(id))?.[1];
  const type = activity?.type;
  if (!type || !MODE_TYPES.has(type)) continue;
  excluded[contentId] = { name: content.name, type, stages: stageCount.get(contentId) || 0 };
}

fs.writeFileSync(path.join(root, 'data', 'excluded-contents.json'), JSON.stringify(excluded, null, 0));
const total = Object.values(excluded).reduce((n, e) => n + e.stages, 0);
console.log(`${Object.keys(excluded).length} contents excluded, ${total} stages:`);
for (const [id, e] of Object.entries(excluded).sort((a, b) => b[1].stages - a[1].stages)) {
  console.log(`  ${String(e.stages).padStart(4)}  ${e.type.padEnd(18)} ${e.name} (${id})`);
}
