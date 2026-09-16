#!/usr/bin/env node
/**
 * Writes one small JSON file per enemy into public/enemy-detail/.
 *
 * WHY THIS EXISTS. The enemy handbook used to be 1,585 pre-rendered pages, one
 * per enemy, each of which embedded the entire browser grid alongside the one
 * record it was actually about. Two of those pages measured 99.7% identical at
 * 71 KB apiece -- roughly 112 MB of near-duplicate HTML per build, of which
 * about 1 KB per page was the enemy. It is one screen with a selection, so it
 * is one page now, and the selection rides in the URL as ?e=<slug>.
 *
 * That leaves the detail data needing somewhere to live. It cannot all ship
 * with the page: the bundles in data/enemies/ total 3.9 MB. So each record is
 * emitted here as its own static file, fetched on selection and cached for a
 * year by the /:path*.json rule in next.config.js. Writing 1,585 small JSON
 * files costs a fraction of rendering 1,585 React pages.
 *
 * This reproduces exactly what the old getStaticProps assembled, minus the two
 * grid props (siblings, contents) which the page now carries once for every
 * enemy rather than once per enemy. Kept in plain Node so it can run as a
 * prebuild step without adding a TypeScript runner to the toolchain; the
 * shaping it mirrors lives in lib/enemies/enemies.ts.
 *
 * Run:  node scripts/build/build-enemy-details.mjs
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const ENEMIES_DIR = path.join(root, 'data', 'enemies');
const OUT_DIR = path.join(root, 'public', 'enemy-detail');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf-8'));

/**
 * Skips the whole job when the output is already newer than every input.
 *
 * This runs from `predev` as well as `prebuild`, and regenerating thousands of
 * files on every `npm run dev` turned a one-second start into a long one. The
 * inputs are data files that change only when the refresh pipeline runs, so
 * comparing timestamps is enough. Pass --force to rebuild regardless.
 */
function upToDate(outDir, inputGlobs) {
  if (process.argv.includes('--force')) return false;
  if (!fs.existsSync(outDir)) return false;
  const outFiles = fs.readdirSync(outDir);
  if (!outFiles.length) return false;
  const newest = (files) => files.reduce((t, f) => Math.max(t, fs.statSync(f).mtimeMs), 0);
  const outNewest = newest(outFiles.slice(0, 50).map((f) => path.join(outDir, f)));
  const inFiles = inputGlobs.flatMap((dir) =>
    fs.existsSync(dir)
      ? (fs.statSync(dir).isDirectory()
        ? fs.readdirSync(dir).map((f) => path.join(dir, f))
        : [dir])
      : []);
  if (!inFiles.length) return false;
  return newest(inFiles) < outNewest;
}

if (upToDate(OUT_DIR, [ENEMIES_DIR, path.join(root, 'data', 'enemy_appearances.json'), path.join(root, 'data', 'enemy-stage-appearances.json')])) {
  console.log('enemy details are up to date; skipping (use --force to rebuild)');
  process.exit(0);
}


/** The same order lib/enemies/enemies.ts sorts contents by. */
const KIND_ORDER = ['chapter', 'event', 'annihilation', 'is', 'sss', 'ra', 'cc', 'supply'];

const bundles = fs
  .readdirSync(ENEMIES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => readJson(path.join(ENEMIES_DIR, f)));

const appearances = readJson(path.join(root, 'data', 'enemy_appearances.json'));
const stageFile = readJson(path.join(root, 'data', 'enemy-stage-appearances.json'));

/** content id -> position, by kind then release date, undated last. */
const contentOrder = new Map(
  bundles
    .map((b) => b.content)
    .sort((a, b) => {
      const ka = KIND_ORDER.indexOf(a.kind);
      const kb = KIND_ORDER.indexOf(b.kind);
      if (ka !== kb) return ka - kb;
      if (!a.released) return 1;
      if (!b.released) return -1;
      return String(a.released).localeCompare(String(b.released));
    })
    .map((c, i) => [c.id, i]),
);

/** Every enemy id -> its name and slug, for resolving ids named in parameters. */
const namesById = {};
for (const bundle of bundles) {
  for (const e of bundle.enemies) namesById[e.id] = { name: e.name, slug: e.slug };
}

/** The stage-derived half of the appearance list, decoded from its ref tables. */
function stageAppearancesFor(slug) {
  return (stageFile.enemies[slug] || []).map(([contentRef, ...stageRefs]) => {
    const [kind, id, label, name] = stageFile.contents[contentRef];
    return {
      kind,
      id,
      label,
      name,
      stages: stageRefs.map((ref) => {
        const [code, stageSlug, stageName, variant] = stageFile.stages[ref];
        const stage = { code, slug: stageSlug || code.toLowerCase() };
        if (stageName) stage.name = stageName;
        if (variant) stage.variant = variant;
        return stage;
      }),
    };
  });
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

let written = 0;
let bytes = 0;
for (const bundle of bundles) {
  for (const enemy of bundle.enemies) {
    const slug = enemy.slug;

    // The two sources are MERGED rather than one replacing the other: a content
    // can field an enemy with no stage naming it (a mode mechanic putting it on
    // the field directly, or a mode the stage dataset excludes). Replacing
    // outright dropped a content for 762 enemies and every content for 205.
    const fromStages = new Map(stageAppearancesFor(slug).map((c) => [c.id, c]));
    const merged = appearances
      .filter((c) => c.enemies.includes(slug))
      .map(({ kind, id, label, name }) => {
        const known = fromStages.get(id);
        return { kind, id, label: known?.label ?? label, name: known?.name || name, stages: known?.stages || [] };
      })
      .sort((a, b) => (contentOrder.get(a.id) ?? Infinity) - (contentOrder.get(b.id) ?? Infinity));

    // Only the handful of ids this record's own parameters mention -- the whole
    // 1,585-entry map would dwarf the record.
    const referenced = {};
    for (const level of enemy.levels) {
      for (const m of [...(level.skills || []), ...(level.talents || [])]) {
        for (const v of Object.values(m.parameters || {})) {
          if (typeof v === 'string' && namesById[v]) referenced[v] = namesById[v];
        }
      }
    }

    const body = JSON.stringify({ enemy, introducedBy: bundle.content, appearances: merged, referenced });
    fs.writeFileSync(path.join(OUT_DIR, `${slug}.json`), body);
    written += 1;
    bytes += body.length;
  }
}

console.log(`${written} enemy detail files, ${(bytes / 1048576).toFixed(1)} MB total, ${Math.round(bytes / written)} bytes average`);
