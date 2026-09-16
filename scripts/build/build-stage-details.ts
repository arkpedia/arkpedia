/**
 * Writes one JSON file per stage into public/stage-detail/.
 *
 * WHY THIS EXISTS. The Terminal's stage view used to be 3,786 pre-rendered
 * pages, one per stage, each of which embedded the entire stage list beside the
 * one stage it was about -- the same shape the enemy handbook had, and the same
 * waste: about 300 MB of near-duplicate HTML per build. It is one page with the
 * selection in the URL now (/stages/browse?s=<slug>), and each stage's own data
 * arrives as a static file, cached for a year by the .json rule in
 * next.config.js.
 *
 * WHY THIS IS TYPESCRIPT, unlike its sibling build-enemy-details.mjs. An enemy
 * record is thin data shaping that could be safely restated in plain JS. A
 * stage is not: it needs getStageGeometryFor, getStageEnemyDetails,
 * getStageDevices, getStageEmergency and, above all, buildPlaybackPaths --
 * actual pathfinding over the map grid. Restating that in a second language is
 * how two implementations quietly stop agreeing. So this imports the real
 * functions the page used to call and runs them, via tsx.
 *
 * Run:  npx tsx scripts/build/build-stage-details.ts
 */
import fs from 'fs';
import path from 'path';
import {
  getStageSlugs,
  getStageBySlug,
  getStageSiblings,
  getStageGeometryFor,
  getStageEnemyDetails,
  getStagePreviewFile,
  getStageEmergency,
  getStageDevices,
} from '@/lib/stages/stages';
import { getDropIcons } from '@/lib/stages/dropIcon';
import { buildPlaybackPaths } from '@/lib/stages/stagePlayback';
import { VARIANT_ORDER } from '@/lib/stages/stageTypes';
import enemyIndex from '@/public/enemies-index.json';

/**
 * Enemy name -> the handbook's own record, for the ones a stage names but does
 * not describe.
 *
 * A stage's enemy list carries some rows with a null slug -- "unranked" ones
 * the stage data never links to a handbook entry -- and getStageEnemyDetails is
 * keyed by slug, so those rows resolve to nothing and the page draws them as a
 * featureless black disc. Their art exists and the handbook knows them by name
 * ('End Point' is end_point, with an icon); the two just never met. Matching on
 * the name closes that gap for about 195 spawns across the set.
 */
type IndexedEnemy = { slug: string; name: string; icon: string | null; rank?: string };
const INDEX = enemyIndex as IndexedEnemy[];
const byName = new Map(INDEX.map((e) => [e.name, e]));

/**
 * Second pass, ignoring the game's literal single quotes.
 *
 * Several enemies are named WITH quotes in the handbook and WITHOUT them in the
 * stage tables -- the stage says `Sui-Xiang` where the handbook says
 * `'Sui-Xiang'`, and `Samivilinn, the Resolution of the Very North` where the
 * handbook writes `'Samivilinn,' the Resolution of the Very North`, quoting only
 * the first word. Exact matching misses those, and they drew a "?" while their
 * art sat on disk the whole time.
 *
 * Only where it is unambiguous. Three names -- Sui, Fortbreaker, Hateful Avenger
 * -- exist in BOTH spellings as genuinely different creatures with different
 * art, so a quote-blind match could hand a stage the wrong portrait. Those keys
 * are left out entirely; both their spellings are in the handbook, so the exact
 * pass above already resolves them.
 */
const unquote = (s: string) => s.replace(/['\u2019]/g, '');
const byUnquoted = new Map<string, IndexedEnemy>();
{
  const grouped = new Map<string, IndexedEnemy[]>();
  for (const e of INDEX) {
    const k = unquote(e.name);
    const g = grouped.get(k);
    if (g) g.push(e);
    else grouped.set(k, [e]);
  }
  for (const [k, g] of grouped) {
    if (new Set(g.map((e) => e.icon)).size === 1) byUnquoted.set(k, g[0]);
  }
}

const OUT_DIR = path.join(process.cwd(), 'public', 'stage-detail');

/**
 * Skips the whole job when the output is already newer than every input.
 *
 * This runs from `predev` as well as `prebuild`, and regenerating thousands of
 * files on every `npm run dev` turned a one-second start into a long one. The
 * inputs are data files that change only when the refresh pipeline runs, so
 * comparing timestamps is enough. Pass --force to rebuild regardless.
 */
function upToDate(outDir: string, inputGlobs: string[]): boolean {
  if (process.argv.includes('--force')) return false;
  if (!fs.existsSync(outDir)) return false;
  const outFiles = fs.readdirSync(outDir);
  if (!outFiles.length) return false;
  const newest = (files: string[]) => files.reduce((t: number, f: string) => Math.max(t, fs.statSync(f).mtimeMs), 0);
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

if (upToDate(OUT_DIR, [path.join(process.cwd(), 'data', 'stages')])) {
  console.log('stage details are up to date; skipping (use --force to rebuild)');
  process.exit(0);
}


/** The stage's own variant rows, ordered the way the toggle shows them. */
function familyOf(slug: string) {
  const siblings = getStageSiblings(slug);
  const self = siblings.find((s) => s.slug === slug);
  const baseSlug = self?.variantOf || slug;
  return siblings
    .filter((s) => s.slug === baseSlug || s.variantOf === baseSlug)
    .slice()
    .sort((a, b) => {
      const rank = (r: typeof a) => (r.variantOf ? VARIANT_ORDER.indexOf(r.variant?.kind || '') + 1 : 0);
      return rank(a) - rank(b);
    });
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

let written = 0;
let bytes = 0;
let skipped = 0;

for (const slug of getStageSlugs()) {
  const stage = getStageBySlug(slug);
  if (!stage) {
    skipped += 1;
    continue;
  }
  const { geometry, borrowedFrom, geometryKey } = getStageGeometryFor(stage);
  /* Anything the stage names but its own detail map does not describe. */
  const details = getStageEnemyDetails(stage, geometry);
  const described = new Set(Object.values(details).map((d) => d.name));
  const referenced = new Set<string>();
  for (const group of Object.values((stage.enemies ?? {}) as Record<string, unknown>)) {
    if (Array.isArray(group)) for (const row of group) if (row?.name) referenced.add(row.name);
  }
  for (const w of geometry?.waves ?? []) for (const sp of w.spawns ?? []) if (sp.enemy) referenced.add(sp.enemy);
  for (const name of referenced) {
    if (described.has(name)) continue;
    const known = byName.get(name) ?? byUnquoted.get(unquote(name));
    if (!known) continue;
    // Only what the card and the marker actually read: a name to match on and
    // art to draw. The stats stay absent, because the stage does not carry them.
    //
    // The name stored is the STAGE's spelling, not the handbook's. Nothing
    // displays this field -- the card and the marker both label themselves from
    // the stage's own row -- and it is the key the page's by-name lookup uses
    // for rows whose slug is null. Writing the handbook's spelling would file
    // `'Sui-Xiang'` under a name the stage never says, so the lookup that
    // matching just fixed would miss it again a step later. For the exact-match
    // case the two are the same string anyway.
    //
    // One stage can spell the same creature two ways: iw-ex-8 has 'Sui-Xiang'
    // in its wave spawns and Sui-Xiang in its enemy list. Both need to be
    // findable, so the second spelling gets its own key instead of overwriting
    // the first -- otherwise whichever lookup used the losing spelling went
    // back to drawing a "?". Nothing looks these up by key except the by-slug
    // path, which only ever asks for real slugs.
    const key = (details as Record<string, unknown>)[known.slug] ? `${known.slug}#${name}` : known.slug;
    (details as Record<string, unknown>)[key] = {
      slug: known.slug, name, icon: known.icon, rank: known.rank ?? null,
    };
  }

  const body = JSON.stringify({
    stage,
    geometry,
    borrowedGeometryFrom: borrowedFrom,
    enemyDetails: details,
    dropIcons: getDropIcons(stage.drops || []),
    previewFile: getStagePreviewFile(stage),
    emergency: getStageEmergency(stage),
    devices: getStageDevices(geometryKey),
    playbackPaths: buildPlaybackPaths(geometry),
    // Just this stage's own forms -- Normal, Challenge Mode, Adverse
    // Environment, Story, 6-star -- which the panel offers as a toggle. Shipping
    // the whole content group instead cost 62 MB across the set, because every
    // stage in a group carried a copy of the same group.
    family: familyOf(slug),
  });
  fs.writeFileSync(path.join(OUT_DIR, `${slug}.json`), body);
  written += 1;
  bytes += body.length;
}

console.log(
  `${written} stage detail files, ${(bytes / 1048576).toFixed(1)} MB total, ` +
    `${Math.round(bytes / Math.max(written, 1) / 1024)} KB average` +
    (skipped ? `, ${skipped} skipped (no record)` : ''),
);
