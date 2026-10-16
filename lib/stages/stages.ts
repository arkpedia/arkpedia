import fs from 'fs';
import path from 'path';
// Lives under public/ so the browser can fetch the same file the build reads:
// the rail needs all 4,130 rows to search across, and embedding them in every
// stage page made each page a 2MB download (see getStageSiblings).
import indexData from '@/public/stages-index.json';
import contentData from '@/data/stages-content.json';
import isNodeData from '@/data/is-nodes.json';
import storyGroupData from '@/data/story-groups.json';
import ccStageData from '@/data/cc-stages.json';
import contentWindowData from '@/data/content-windows.json';
import { filterType, Stage, StageContent, StageDevice, StageGeometry, StageGroup, StageSummary, StageEnemyDetail } from './stageTypes';
import { compareStageSummaries } from './stageSort';
import { buildStageGroups, NavData } from './stageNav';
import { getEnemyBySlug } from '@/lib/enemies/enemies';

const STAGES_DIR = path.join(process.cwd(), 'data', 'stages');
const GEOMETRY_DIR = path.join(process.cwd(), 'data', 'stage-geometry');
let sortedSummaries: StageSummary[] | undefined;

export function getStageSummaries(): StageSummary[] {
  // The imported index is fixed for this build. Sort it once, rather than once
  // per generated stage, and keep callers free to reorder their own arrays.
  sortedSummaries ??= (indexData as StageSummary[]).slice().sort(compareStageSummaries);
  return sortedSummaries.slice();
}

/**
 * The stages sharing a chapter or event with this one -- what the rail shows
 * beside an open stage, and all a stage page needs to ship.
 *
 * The whole index is 1.98MB. Handing it to all 4,130 pages made each one a
 * 2.06MB download to render 12KB of stage, and would have put ~17GB of it in
 * the static export. Groups run 1-179 rows (median 18), and the rail fetches
 * the rest from /stages-index.json once, cached, when it needs to search wider.
 */
export function getStageSiblings(slug: string): StageSummary[] {
  const all = getStageSummaries();
  const self = all.find((s) => s.slug === slug);
  if (!self) return [];
  if (!self.contentId) return all.filter((s) => s.stageType === self.stageType);
  return all.filter((s) => s.contentId === self.contentId);
}

/** Stages per type, so the type filter can show its counts before the full
 *  index has arrived. */
export function getStageTypeCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of indexData as StageSummary[]) {
    if (s.variantOf) continue; // as in getStageGroups: rows, not forms
    const type = filterType(s.stageType);
    counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
}

export function getStageContents(): Record<string, StageContent> {
  return contentData as Record<string, StageContent>;
}

/**
 * One stage's full record. Deliberately one file per stage: the set is 18MB and
 * a detail page needs about 4KB of it, and getStaticProps serialises whatever it
 * returns into the page payload.
 *
 * Server-side only (fs) -- call from getStaticProps, never a component.
 */
export function getStageBySlug(slug: string): Stage | null {
  const stage = readStageRecord(slug);
  return stage ? completeForm(stage) : null;
}

/** The record as written, with only the fills that come from the stage's own kind. */
function readStageRecord(slug: string): Stage | null {
  try {
    const stage = JSON.parse(fs.readFileSync(path.join(STAGES_DIR, `${slug}.json`), 'utf-8')) as Stage;
    // The 140 replacer levels are unnamed in the source and read as a bare
    // "ISW-NO"; they are alternate layouts for a node whose base level is named,
    // and that is the name the game shows. The index carries the same fill (see
    // scripts/build/enrich-stage-index.mjs), so the list and the page agree.
    if (!String(stage.name || '').trim()) {
      const borrowed = isNode(slug)?.name;
      if (borrowed) return { ...stage, name: borrowed };
    }
    // A CCB stage has no stage record behind it, so it arrives with neither a code
    // nor a name; scripts/imports/import_cc_stages.py builds the code from its level path
    // and takes the name from medal text where the game gives one.
    const cc = ccStage(slug);
    if (cc && (!String(stage.code || '').trim() || !String(stage.name || '').trim())) {
      return {
        ...stage,
        code: String(stage.code || '').trim() || cc.code,
        name: String(stage.name || '').trim() || cc.name || '',
      };
    }
    return stage;
  } catch {
    return null;
  }
}

/**
 * A form's record, completed from the stage it is a form of.
 *
 * 227 forms carry neither `enemies` nor `battle` -- the game ships neither under the
 * form's own id -- and for both kinds those are the base stage's:
 *
 *   124 Challenge Mode forms SHARE the base's level file, so the waves, the spawns
 *       and the roster are not merely alike, they are the same file. None of these
 *       gains anything today -- every one of them belongs to an event the game has
 *       removed (Ancient Forge and the rest), and their base stages carry no battle
 *       or roster either -- but the borrow is right for them, so it is not special-
 *       cased away.
 *
 *   103 Story Environment forms name a level file of their own, and not one of those
 *       exists in either dump. What it holds matters less than it looks: Story
 *       Environment buffs the PLAYER's side rather than changing the stage --
 *       operators get double HP, ATK and DEF and half the redeployment time -- so the
 *       map, the waves and the enemies are the normal stage's.
 *
 * So all 103 Story pages -- every stage of EP 09 through EP 14 in Story Environment --
 * showed an empty roster and an empty HUD over a borrowed map, and now show the fight
 * the form actually fields.
 *
 * What a form states for ITSELF is never overwritten. Sanity, EXP, LMD, drops and the
 * briefing text really do differ, and a Story run costing no sanity is a fact about
 * the form, not a gap in it.
 *
 * The one borrowed figure that is not exact is the starting DP: a Story form's own
 * briefing says the game raises it, and by how much is nowhere in the data. The
 * normal stage's figure is the floor and is what the page shows, with the map note
 * saying the real one is higher -- a blank there was worse, since the stage does start
 * you with DP.
 */
function completeForm(stage: Stage): Stage {
  if (!stage.variant || (stage.enemies && stage.battle)) return stage;
  const baseSlug = variantBaseOf(stage.slug);
  if (!baseSlug || baseSlug === stage.slug) return stage;
  // The record as written, so a base is never itself completed -- one hop only.
  const base = readStageRecord(baseSlug);
  if (!base) return stage;
  return {
    ...stage,
    battle: stage.battle || base.battle,
    enemies: stage.enemies || base.enemies,
  };
}

/**
 * The map, routes and waves for a stage. Kept out of the stage record because
 * one geometry serves every variant that shares the map -- 4,130 stages resolve
 * to 2,804 geometries, and inlining would have duplicated the 87MB of it.
 */
export function getStageGeometry(key: string | null): StageGeometry | null {
  if (!key) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(GEOMETRY_DIR, `${key}.json`), 'utf-8')) as StageGeometry;
  } catch {
    return null;
  }
}

/**
 * A form's map, falling back to the map of the stage it is a form of.
 *
 * 227 forms have no geometry of their own, and they split into two cases:
 *
 *   124 Challenge Mode stages SHARE their parent's level file and simply have no
 *       geometry keyed under their own slug. Borrowing is not an approximation for
 *       these -- it is the same level file, so it is the same map, the same waves and
 *       the same spawns.
 *
 *   103 Story Environment stages name their OWN level file, and not one of them
 *       exists in either dump: every `Obt/Main/level_easy_*` is absent, where 85
 *       `tough_*` files are present, which is why Adverse Environment has all of its
 *       geometry and Story has none. Borrowing is not an approximation here either:
 *       Story Environment buffs the PLAYER's side and leaves the stage alone, so the
 *       tiles, the waves and the spawns are the normal stage's by design -- see
 *       completeForm, which borrows the roster for the same reason.
 *
 * The caller is still told which stage it came from, because the form's own screen is
 * not identical -- a Story run costs no sanity and raises the starting DP -- and a
 * page that borrows a map should say whose.
 */
export function getStageGeometryFor(stage: Stage): {
  geometry: StageGeometry | null;
  /** The slug it borrowed from, or null when the stage has its own. */
  borrowedFrom: string | null;
  /** The key the geometry came from, borrowed or not -- what data/stage-devices.json
   *  is keyed by, so a borrowed map brings its devices with it. */
  geometryKey: string | null;
} {
  const own = getStageGeometry(stage.geometryKey);
  if (own) return { geometry: own, borrowedFrom: null, geometryKey: stage.geometryKey };

  const empty = { geometry: null, borrowedFrom: null, geometryKey: null };
  const baseSlug = variantBaseOf(stage.slug);
  if (!baseSlug || baseSlug === stage.slug) return empty;
  const base = getStageBySlug(baseSlug);
  const borrowed = base ? getStageGeometry(base.geometryKey) : null;
  return borrowed
    ? { geometry: borrowed, borrowedFrom: baseSlug, geometryKey: base?.geometryKey ?? null }
    : empty;
}

/**
 * Every stage that gets a page.
 *
 * Read from the index rather than from the directory, so the set of pages is the
 * set of rows the list offers -- data/stages/ still holds the 332 stages of the
 * limited-time game modes (Stronghold Protocol's autochess board, the Icebreaker
 * Games, the April Fools' events and the rest), which the index drops because
 * they close and never come back. Listing the directory would build pages nothing
 * links to.
 */
export function getStageSlugs(): string[] {
  return (indexData as StageSummary[]).map((s) => s.slug);
}

/**
 * The chapter/event filter's headings, in the order and wording the game uses.
 *
 * The building is in lib/stages/stageNav.ts, which has no filesystem in it, because
 * the rail builds the same list in the browser out of /stages-index.json rather than
 * being handed it in every stage page's props -- see buildStageGroups. This is the
 * server's way in: the same function over the same three tables.
 */
export function getStageGroups(): StageGroup[] {
  return buildStageGroups(getStageSummaries(), {
    contents: contentData as Record<string, StageContent>,
    windows: contentWindowData as Record<string, number[]>,
    storyGroups: storyGroupData as NavData['storyGroups'],
  });
}

let deviceCache: Record<string, StageDevice[]> | null = null;

/**
 * The units a stage starts with on the field, by geometry key.
 *
 * Read from disk rather than imported, so 1.5MB of it does not go into the page
 * bundle -- the same reason getStageGeometry reads its files. Keyed by geometry
 * because a level file is one map and every stage sharing that map shares its
 * predefines.
 *
 * Server-side only -- call from getStaticProps.
 */
export function getStageDevices(key: string | null): StageDevice[] {
  if (!key) return [];
  if (!deviceCache) {
    try {
      deviceCache = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'stage-devices.json'), 'utf-8'));
    } catch {
      deviceCache = {};
    }
  }
  return deviceCache?.[key] || [];
}


/** The full enemy records for a stage's roster, keyed by slug.
 *
 * The stage bundles carry only slug/name/index/count per enemy, which is enough
 * for a list but not for icons, stats or flavour text. Those live in the enemy
 * dataset that the enemies work adapted into this repo, and the two agree on
 * slugs -- so the stage page resolves against it rather than the stage data
 * carrying a second, thinner copy of every enemy.
 *
 * Server-side only -- call from getStaticProps.
 */
export function getStageEnemyDetails(
  stage: Stage,
  geometry: StageGeometry | null
): Record<string, StageEnemyDetail> {
  const out: Record<string, StageEnemyDetail> = {};
  // Which level of each enemy THIS stage fields. An enemy record lists its levels
  // and the stage's geometry names the one in play: 2,679 of the 22,931
  // enemy-in-stage entries field a level below the last, and taking the last
  // overstated them -- 1-7's Originium Slug alpha is HP 1050, not the HP 2850 of
  // its second level.
  const levelOf = new Map<string, number>();
  // ...and what this stage CHANGES about it. A level is not the whole story: 1,038
  // entries across 459 stages carry an overwrittenData attribute in the level file,
  // and reading only the level understated them by as much as 30x -- ISW-SP fields
  // a Dual Swordsman with 65,000 HP where the enemy table says 2,000.
  const overrideOf = new Map<string, Record<string, number | null>>();
  for (const config of geometry?.enemyConfigurations || []) {
    if (!config.slug) continue;
    if (typeof config.database_level === 'number') levelOf.set(config.slug, config.database_level);
    if (config.overrides) overrideOf.set(config.slug, config.overrides);
  }
  const groups = [stage.enemies?.by_rank, stage.enemies?.conditional?.by_rank];
  for (const group of groups) {
    for (const list of Object.values(group || {})) {
      for (const entry of list || []) {
        if (out[entry.slug]) continue;
        const found = getEnemyBySlug(entry.slug);
        if (!found) continue;
        const enemy = found.enemy;
        const levels = enemy.levels || [];
        const stated = levelOf.get(entry.slug);
        // The stage's own level when it states one, the last otherwise -- 443
        // entries state none, and an enemy the dataset does not carry cannot be
        // levelled at all.
        const index =
          stated != null && stated >= 0 && stated < levels.length ? stated : levels.length - 1;
        const stats = levels.length ? levels[index].stats : null;
        const over = overrideOf.get(entry.slug);
        // The stage's own figure wins where it states one; 0 is a real value, so
        // this tests for null rather than truthiness.
        const stat = (key: string) => over?.[key] ?? (stats as Record<string, number | null> | null)?.[key] ?? null;
        out[entry.slug] = {
          slug: entry.slug,
          name: enemy.name,
          icon: enemy.icon || null,
          rank: enemy.rank || null,
          race: enemy.race || null,
          movement: enemy.movement || null,
          attackPosition: enemy.attack_position || null,
          damageType: enemy.damage_type || [],
          flavourText: enemy.flavour_text || null,
          abilities: (enemy.abilities || []).map((a) => a.text),
          levelCount: levels.length,
          /** Which level of the enemy this stage fields, 0-based. */
          level: levels.length ? index : null,
          /** True when the stage did not state a level and the strongest was taken. */
          levelAssumed: stated == null || stated < 0 || stated >= levels.length,
          statsOverridden: Boolean(over && Object.keys(over).length),
          moveSpeed: stat('move_speed'),
          stats: stats || over
            ? {
                hp: stat('hp'),
                atk: stat('atk'),
                def: stat('def'),
                res: stat('res'),
                elementalRes: stat('elemental_res'),
                elementalDamageRes: stat('elemental_damage_res'),
                attackInterval: stat('attack_interval'),
              }
            : null,
        };
      }
    }
  }
  return out;
}

/**
 * The file in public/stages-images/ for a stage, or null when the game has no
 * render of it.
 *
 * Two sources, because Integrated Strategies stages are named differently: a
 * render is named after the stage's gamedata id, and an IS stage has no stage id
 * -- its id is a level path. The renders for those are named after the ROGUELIKE
 * stage id, which only roguelike_topic_table.json ties to the level path, so
 * scripts/import_is_previews.py resolves the two and writes the result to
 * data/is-previews.json. 384 of the 525 IS stages have one; the rest are
 * levelreplacers/ variants the table does not name.
 */
export function getStagePreviewFile(stage: Stage): string | null {
  if (stage.preview) {
    const base = stage.preview.split('/').pop() || '';
    return base.replace(/\.[a-z]+$/i, '.webp');
  }
  const own = isNode(stage.slug)?.render || ccStage(stage.slug)?.render;
  if (own) return own;
  // A form of a stage borrows its base's render, which is what the game does with
  // them too -- an Adverse Environment or Story run of a chapter stage is the same
  // map. That is 170 pages that had no In-game view at all: every
  // story_environment (103) and adverse_environment (67) form. The 69 Challenge
  // Mode forms still have none, because their base stages have none either.
  const baseSlug = variantBaseOf(stage.slug);
  if (!baseSlug) return null;
  const base = getStageBySlug(baseSlug);
  return base && base.slug !== stage.slug ? getStagePreviewFile(base) : null;
}

let variantBases: Map<string, string> | null = null;

/** The slug this one is a variant of, from the index. */
function variantBaseOf(slug: string): string | null {
  if (!variantBases) {
    variantBases = new Map();
    for (const row of indexData as StageSummary[]) {
      if (row.variantOf) variantBases.set(row.slug, row.variantOf);
    }
  }
  return variantBases.get(slug) || null;
}

interface CcStage {
  code: string;
  name?: string;
  render?: string;
}

const ccStage = (slug: string): CcStage | undefined => (ccStageData as Record<string, CcStage>)[slug];

interface IsNode {
  render: string;
  emergency?: { render: string; condition: string };
  name?: string;
}

const isNode = (slug: string): IsNode | undefined => (isNodeData as Record<string, IsNode>)[slug];

/**
 * The Emergency Ops form of an Integrated Strategies node, or null.
 *
 * 322 of the 525 IS stages have one: the same level with its enemies buffed and
 * often further Elite enemies added. It is a form of the node rather than a level
 * of its own, so there is no second stage record to link to -- what differs is the
 * render and the condition, which is what the page toggles between.
 */
export function getStageEmergency(stage: Stage): { render: string; condition: string } | null {
  return isNode(stage.slug)?.emergency || null;
}
