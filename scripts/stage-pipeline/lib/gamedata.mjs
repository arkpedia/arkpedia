// Reads the EN gamedata tables the stage build needs, out of the upstream cache
// scripts/lib/upstream.sh maintains. Everything is a plain JSON read; the only
// reason this is a module is that the tables are big and several steps want the
// same one, so they are held after the first read.
import fs from 'node:fs';
import path from 'node:path';

// The upstream cache belongs to the REPO, not to wherever output is being
// written: ARKPEDIA_ROOT redirects the output for a verification run, and the
// inputs must not follow it. Resolved from this file so cwd does not matter.
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const EN = process.env.ARKPEDIA_EN || path.join(REPO, '.cache/upstream/en-gamedata/en/gamedata');

const cache = new Map();

export function excel(name) {
  if (!cache.has(name)) {
    const file = path.join(EN, 'excel', `${name}.json`);
    if (!fs.existsSync(file)) {
      throw new Error(`missing ${file}\n  run scripts/sync/refresh-stage-data.sh, which syncs the upstream cache first`);
    }
    cache.set(name, JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  return cache.get(name);
}

export const levelsDir = path.join(EN, 'levels');

// Level ids are cited in a dozen tables with inconsistent case and separators.
// Two normalisations exist upstream and they are NOT interchangeable: this is
// the strict one (appears_in.level_key), used for every cross-table join.
export function levelKey(id) {
  return (id || '').trim().replace(/\\/g, '/').toLowerCase();
}

export function readLevel(levelId) {
  const file = path.join(levelsDir, `${levelKey(levelId)}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
