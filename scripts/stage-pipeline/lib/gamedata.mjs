// Reads the EN gamedata tables the stage build needs, out of the upstream cache
// scripts/lib/upstream.sh maintains. Everything is a plain JSON read; the only
// reason this is a module is that the tables are big and several steps want the
// same one, so they are held after the first read.
//
// Level files are the one input with a second source. The EN mirror drops a level
// file once Global has no way to play the stage (300 of them in 2026-09: Trials for
// Navigator #1-#4, Children of Ursus, Vigilo and nine more whole events), while the
// CN mirror still carries it. The CN tables of a run all come from the one mirror and
// commit scripts/content/cn-tables.mjs settled on, composed under
// .cache/upstream/cn-resource/gamedata, so that is where the fallback reads. EN wins
// wherever both have the file. Only a stage the EN tables already name ever reads a
// CN level: levelIds() (levelfiles.mjs) lists the EN folder alone, because a level
// only CN has is a stage Global has not got, and CN stages never arrive by design.
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

/** The CN level files: the tables upstream-cn settled on (ARKPEDIA_CN points elsewhere). */
export const cnLevelsDir = path.join(process.env.ARKPEDIA_CN || path.join(REPO, '.cache/upstream/cn-resource'), 'gamedata', 'levels');

// Level ids are cited in a dozen tables with inconsistent case and separators.
// Two normalisations exist upstream and they are NOT interchangeable: this is
// the strict one (appears_in.level_key), used for every cross-table join.
export function levelKey(id) {
  return (id || '').trim().replace(/\\/g, '/').toLowerCase();
}

let cnIndex = null;
/**
 * level key -> absolute path of every CN level file, walked once and keyed in lower case:
 * the mirrors do not agree on case (the audit probed act4d0 at one casing and found
 * nothing), so the lookup is case-insensitive rather than a guessed spelling. Empty,
 * with one warning, when the CN tables are not on disk: the build then proceeds on EN
 * alone, as it did before the fallback existed.
 */
function cnLevels() {
  if (cnIndex) return cnIndex;
  cnIndex = new Map();
  if (!fs.existsSync(cnLevelsDir)) {
    console.warn(`warning: no CN level files under ${cnLevelsDir}; a stage Global no longer carries a level file for gets no map`);
    return cnIndex;
  }
  const walk = (abs, rel) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const next = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(abs, entry.name), next);
      else if (entry.name.endsWith('.json')) cnIndex.set(levelKey(next.slice(0, -5)), path.join(abs, entry.name));
    }
  };
  walk(cnLevelsDir, '');
  return cnIndex;
}

/** Only for a test that points ARKPEDIA_CN at another tree inside one process. */
export function forgetCnLevels() { cnIndex = null; }

/**
 * Where a stage's level file is: {file, source: 'en' | 'cn'}, EN first, or null when
 * neither mirror has it.
 */
export function levelFile(levelId) {
  const key = levelKey(levelId);
  if (!key) return null;
  const en = path.join(levelsDir, `${key}.json`);
  if (fs.existsSync(en)) return { file: en, source: 'en' };
  const cn = cnLevels().get(key);
  return cn ? { file: cn, source: 'cn' } : null;
}

let handbook = null;
/**
 * The EN handbook name of the enemy a stage-local one is a variant of: the longest
 * handbook id that `id` extends at an underscore (enemy_1303_mhshep_2_c is a
 * enemy_1303_mhshep_2, a Hornbeast), or null.
 */
export function baseEnemyName(id) {
  handbook ??= excel('enemy_handbook_table').enemyData || {};
  const parts = String(id || '').split('_');
  for (let end = parts.length; end >= 3; end--) {
    const name = handbook[parts.slice(0, end).join('_')]?.name;
    if (typeof name === 'string' && name.trim()) return name;
  }
  return null;
}

/**
 * A level file's content as the Global site may show it. A CN level names its
 * stage-local enemies in Chinese (enemyDbRefs[].overwrittenData.name), and both the
 * enemy tallies and the map's enemy list fall back to that inline name when the EN
 * handbook has none. For a CN file that name is replaced by the EN handbook name of
 * the enemy it is a variant of (baseEnemyName), or dropped, so such an enemy is named
 * in English or not at all, never in Chinese. Everything else the build reads from a
 * level is keys, numbers and grids, which the two servers share.
 */
export function forGlobal(level, source) {
  if (source !== 'cn' || !level || typeof level !== 'object') return level;
  const refs = Array.isArray(level.enemyDbRefs) ? level.enemyDbRefs : [];
  for (const ref of refs) {
    const data = ref && typeof ref === 'object' ? ref.overwrittenData : null;
    if (!data || typeof data !== 'object' || !('name' in data)) continue;
    const english = baseEnemyName(ref.id);
    if (english) data.name = { m_defined: true, m_value: english };
    else delete data.name;
  }
  return level;
}

/** {level, source} for a stage's level file, or null if neither mirror has it or it is not JSON. */
export function readLevelFile(levelId) {
  const found = levelFile(levelId);
  if (!found) return null;
  let level;
  try { level = JSON.parse(fs.readFileSync(found.file, 'utf8')); } catch { return null; }
  return { level: forGlobal(level, found.source), source: found.source };
}

export function readLevel(levelId) {
  return readLevelFile(levelId)?.level ?? null;
}
