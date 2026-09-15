import fs from 'fs';
import path from 'path';
import appearancesData from '@/data/enemy_appearances.json';
import stageAppearancesData from '@/data/enemy-stage-appearances.json';
import {
  Enemy,
  EnemyAppearance,
  EnemyBundle,
  EnemyContent,
  ContentKind,
  EnemyStage,
  EnemyStageAppearance,
  EnemySummary,
  KIND_ORDER,
} from './enemyTypes';

const ENEMIES_DIR = path.join(process.cwd(), 'data', 'enemies');

// The enemy detail page statically generates 1,585 routes, each of which
// needs to find one record among the bundles. Re-reading and re-parsing
// all 167 files (4.3MB) per route would be ~264,000 file reads for one
// build, so the parse happens once per process and every lookup below
// works off that.
//
// Production only, deliberately. The dev server keeps one process alive
// across requests and editing a .json under data/ does not restart it, so
// caching there would serve a stale bundle until the server was killed by
// hand -- exactly the case where someone is regenerating enemy data and
// wants to see it.
const CACHE = process.env.NODE_ENV === 'production';
let bundleCache: EnemyBundle[] | null = null;
let bySlugCache: Map<string, { enemy: Enemy; introducedBy: EnemyContent }> | null = null;

/**
 * Reads every per-content bundle in data/enemies/. One file per chapter,
 * event, annihilation, IS season, SSS map, RA season, CC season and
 * supply stage -- 167 in all, named after the content itself the same
 * way data/events-data/ is ("Burning Run.json", "A Flurry to the
 * Flame.json"). Drop a new bundle in and it shows up on the next build.
 *
 * Server-side only (fs) -- call from getStaticProps, never a component.
 */
export function getEnemyBundles(): EnemyBundle[] {
  if (CACHE && bundleCache) return bundleCache;
  let files: string[] = [];
  try {
    files = fs.readdirSync(ENEMIES_DIR);
  } catch {
    return [];
  }
  const bundles = files
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(ENEMIES_DIR, f), 'utf-8')) as EnemyBundle);
  if (CACHE) bundleCache = bundles;
  return bundles;
}

/**
 * Every enemy record, flattened out of the bundles. Safe to treat as a
 * set: the bundles partition by introduction, so a slug appears in
 * exactly one of them and this never yields a duplicate.
 */
export function getAllEnemies(): Enemy[] {
  return getEnemyBundles().flatMap((b) => b.enemies);
}

export function getEnemyBySlug(slug: string): { enemy: Enemy; introducedBy: EnemyContent } | undefined {
  if (!CACHE || !bySlugCache) {
    const index = new Map<string, { enemy: Enemy; introducedBy: EnemyContent }>();
    for (const bundle of getEnemyBundles()) {
      for (const enemy of bundle.enemies) {
        index.set(enemy.slug, { enemy, introducedBy: bundle.content });
      }
    }
    if (!CACHE) return index.get(slug);
    bySlugCache = index;
  }
  return bySlugCache.get(slug);
}


/** The content catalogue, ordered by kind then release date (undated last). */
export function getEnemyContents(): EnemyContent[] {
  return getEnemyBundles()
    .map((b) => b.content)
    .sort((a, b) => {
      const ka = KIND_ORDER.indexOf(a.kind);
      const kb = KIND_ORDER.indexOf(b.kind);
      if (ka !== kb) return ka - kb;
      if (a.release_date && b.release_date) {
        if (a.release_date !== b.release_date) return a.release_date < b.release_date ? -1 : 1;
      } else if (a.release_date !== b.release_date) {
        return a.release_date ? -1 : 1; // undated sorts last within its kind
      }
      // Whole runs of content share one release date -- EP 00 through EP 04
      // all shipped at Global launch, and the IS seasons and Trials for
      // Navigator entries cluster the same way. Falling straight to the
      // name there listed "EP 04 Burning Run" ahead of "EP 00 Evil Time
      // Part 1", so the label breaks the tie first, compared numerically
      // so EP 10 lands after EP 9 rather than after EP 1.
      if (a.label && b.label && a.label !== b.label) {
        return a.label.localeCompare(b.label, 'en', { numeric: true });
      }
      return a.name.localeCompare(b.name);
    });
}

/**
 * enemy slug -> the contents that field it, each with the stages inside it.
 * From data/enemy-stage-appearances.json, built by
 * scripts/build-enemy-stage-appearances.mjs out of the stage dataset.
 *
 * The file is normalised -- contents and stages are listed once and referred to by
 * index, because the flat shape repeated 129 contents 4,943 times and 2,299 stages
 * 13,112 times, at 1.4MB against 229KB. Rehydrated here, server-side, and sliced to
 * one enemy in getStaticProps, so nothing but that enemy's own rows ships.
 */
interface AppearanceFile {
  /** [kind, id, label, name] */
  contents: [ContentKind, string, string | null, string][];
  /** [code, slug?, name?, variant?] -- slug omitted where it is the lowercased
   *  code, name omitted where it repeats the code. */
  stages: [string, (string | null)?, (string | null)?, string?][];
  /** enemy slug -> [[content index, ...stage indexes]] */
  enemies: Record<string, number[][]>;
}


/** content id -> the enemy slugs it fields, from data/enemy_appearances.json. */
export function getAppearances(): EnemyAppearance[] {
  return appearancesData as EnemyAppearance[];
}

/**
 * Inverts the appearance index: enemy slug -> the content ids it can be
 * fought in. The index is stored content-first because that is how it is
 * derived (from stage rosters) and because storing it enemy-first meant
 * fielding one more enemy in one more stage rewrote that enemy's record.
 * The page wants it the other way round, so it gets flipped here once.
 */
export function getAppearancesBySlug(): Record<string, string[]> {
  const bySlug: Record<string, string[]> = {};
  for (const content of getAppearances()) {
    for (const slug of content.enemies) {
      (bySlug[slug] ||= []).push(content.id);
    }
  }
  return bySlug;
}

/**
 * Trims each record down to what the browse page actually renders and
 * sorts by. The full bundles come to 4.3MB, nearly all of it per-level
 * skill/talent parameter blocks and flavour text that only the detail
 * page reads -- shipping that whole payload into the list page's HTML
 * would be several megabytes of JSON the page never touches.
 */
export function getEnemySummaries(): EnemySummary[] {
  // Inverted once for the whole run rather than per enemy: the filter needs every
  // content that fields a row, not just the one that introduced it.
  const appearsIn = getAppearancesBySlug();
  return getEnemyBundles()
    .flatMap((bundle) =>
      bundle.enemies.map((e): EnemySummary => {
        // Level 0 is always present and is always the default combat row.
        const base = e.levels[0]?.stats;
        return {
          slug: e.slug,
          name: e.name,
          index: e.index,
          rank: e.rank,
          sort: e.sort,
          hidden: e.hidden,
          icon: e.icon,
          race: e.race,
          movement: e.movement,
          attack_position: e.attack_position,
          damage_type: e.damage_type,
          introduced_by: bundle.content.id,
          appears_in: appearsIn[e.slug] || [],
          hp: base?.hp ?? null,
          atk: base?.atk ?? null,
          def: base?.def ?? null,
          res: base?.res ?? null,
          weight: base?.weight ?? null,
        };
      })
    )
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}
