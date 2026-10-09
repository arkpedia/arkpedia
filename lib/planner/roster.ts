/**
 * Which operators you have, and how far along each one is.
 *
 * The depot's twin. The planner already knew this per PLAN entry -- every builder
 * state carried a startingElite/startingLevel/startingSkillLevel/startingMasteryLevels
 * quartet -- but it lived inside the plan, which is the wrong place for it twice over:
 * it was re-entered from scratch every time an operator was added, and it vanished the
 * moment they were removed. What you own does not stop being true because you finished
 * planning them.
 *
 * So the roster is the store and the plan reads from it. "From E0 L1 SR1" on a build is
 * a view of this, and correcting it there corrects it here.
 */

import { maxSkillRankForElite } from '@/lib/planner/plannerLogic';
import { isSafeKey } from './untrusted';

/** More skills or modules than any operator has. The game tops out at three of
 *  each; the bound is loose so a fourth module some day is not silently dropped,
 *  and tight enough that an index of a billion is refused as the nonsense it is. */
const MAX_SLOT = 7;

export const ROSTER_STORAGE_KEY = 'plannerRoster';
/** Same reason as the depot's: the native `storage` event does not fire in the tab
 *  that wrote, so a same-tab listener needs one of its own. */
export const ROSTER_EVENT = 'plannerRosterChanged';

/** What you have. Deliberately the same four fields the build panel's "from" holds. */
export interface Owned {
  /** Game imports keep the potential for shared collection views; older rosters omit it. */
  potential?: number;
  elite: number;
  level: number;
  skillLevel: number;
  /** skill index -> mastery, 0 or absent meaning none. */
  masteries: Record<number, 0 | 1 | 2 | 3>;
  /** module index -> the stage index you already have, 0-based. Absent means the
   *  module is not unlocked at all, which is why -1 and not 0 is "nothing": index 0 is
   *  a stage you have paid for. */
  modules?: Record<number, number>;
}

export type Roster = Record<string, Owned>;

/** An operator you have but have not touched. */
export const UNBUILT: Owned = { elite: 0, level: 1, skillLevel: 1, masteries: {} };

function clean(value: unknown): Owned | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const elite = Math.floor(Number(v.elite));
  const level = Math.floor(Number(v.level));
  const skillLevel = Math.floor(Number(v.skillLevel));
  /* Anything not a sane number is dropped rather than coerced. A NaN here propagates
     into every "still needed" subtraction and blanks a whole column. */
  if (!Number.isFinite(elite) || elite < 0 || elite > 2) return null;
  if (!Number.isFinite(level) || level < 1 || level > 90) return null;
  if (!Number.isFinite(skillLevel) || skillLevel < 1 || skillLevel > 7) return null;
  const masteries: Owned['masteries'] = {};
  if (v.masteries && typeof v.masteries === 'object') {
    for (const [k, m] of Object.entries(v.masteries as Record<string, unknown>)) {
      const idx = Math.floor(Number(k));
      const lvl = Math.floor(Number(m));
      if (Number.isFinite(idx) && idx >= 0 && idx <= MAX_SLOT && lvl >= 1 && lvl <= 3) masteries[idx] = lvl as 1 | 2 | 3;
    }
  }
  const modules: Record<number, number> = {};
  if (v.modules && typeof v.modules === 'object') {
    for (const [k, st] of Object.entries(v.modules as Record<string, unknown>)) {
      const idx = Math.floor(Number(k));
      const stage = Math.floor(Number(st));
      /* Three stages is every module the game has; anything else is not a stage. */
      if (Number.isFinite(idx) && idx >= 0 && idx <= MAX_SLOT && stage >= 0 && stage <= 2) modules[idx] = stage;
    }
  }
  /**
   * And then the rules the game itself enforces, which this store predates.
   *
   * The old editor recorded whatever you pressed: rank 1-7 at any promotion,
   * masteries on rank 7 alone. So a roster written before the locks can hold an
   * operator at E0 with rank 7 and three masteries, and that state cannot exist
   * in the game -- which means every plan starting from it starts from a lie.
   *
   * Only the rarity-free half is applied here, because this function has no
   * operator list to look a rarity up in: ranks 5-7 need E1 and a mastery needs
   * E2, both of which are true of every operator. The rarity-dependent half --
   * a module opens at Lv40, 50 or 60 depending on rarity -- is clamped where the
   * rarity is known, on the way into the editor.
   */
  const rank = Math.min(skillLevel, maxSkillRankForElite(elite));
  const reachableMasteries = elite === 2 && rank === 7 ? masteries : {};
  const reachableModules = elite === 2 ? modules : {};
  return {
    elite,
    level,
    skillLevel: rank,
    ...(typeof v.potential === 'number' && Number.isInteger(v.potential) && v.potential >= 1 && v.potential <= 6 ? { potential: v.potential } : {}),
    masteries: reachableMasteries,
    ...(Object.keys(reachableModules).length ? { modules: reachableModules } : {}),
  };
}

export function readRoster(): Roster {
  try {
    const raw = window.localStorage?.getItem(ROSTER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Roster = {};
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!isSafeKey(name)) continue;
      const owned = clean(value);
      if (owned) out[name] = owned;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeRoster(roster: Roster): void {
  try {
    window.localStorage?.setItem(ROSTER_STORAGE_KEY, JSON.stringify(roster));
    window.dispatchEvent(new Event(ROSTER_EVENT));
  } catch {
    /* Private mode. Not persisted this session, which is no worse than before. */
  }
}

/** Whether the roster has ever been written. Distinguishes "empty" from "new", which
 *  is what the one-time migration below turns on. */
export function rosterExists(): boolean {
  try {
    return window.localStorage?.getItem(ROSTER_STORAGE_KEY) != null;
  } catch {
    return false;
  }
}

/**
 * Carries the old per-plan starting values forward, once.
 *
 * Anyone who has used the planner before has this information typed in already, spread
 * across their builder states. Losing it on the upgrade would mean re-entering every
 * operator they had told it about. Runs only when the roster key has never existed --
 * not merely when it is empty -- so a reader who deliberately clears their roster does
 * not get it repopulated from the plan on the next load.
 */
export function migrateFromBuilderStates(
  builderStates: Record<string, {
    startingElite: number;
    startingLevel: number;
    startingSkillLevel: number;
    startingMasteryLevels: Record<number, 0 | 1 | 2 | 3>;
  }>,
): Roster | null {
  if (rosterExists()) return null;
  const out: Roster = {};
  for (const [name, b] of Object.entries(builderStates)) {
    /* No modules to carry: the old per-plan shape had no starting-module field at all,
       which is exactly the gap this change closes. Everyone starts with none recorded,
       which is what the planner already assumed. */
    const owned = clean({
      elite: b.startingElite,
      level: b.startingLevel,
      skillLevel: b.startingSkillLevel,
      masteries: b.startingMasteryLevels,
    });
    /* Only what was actually stated. A plan entry left at the E0 L1 SR1 default says
       nothing about ownership -- it is the absence of an answer, not an answer. */
    if (owned && (owned.elite > 0 || owned.level > 1 || owned.skillLevel > 1 || Object.keys(owned.masteries).length)) {
      out[name] = owned;
    }
  }
  writeRoster(out);
  return out;
}

export function parseRosterExport(text: string): Roster | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const out: Roster = {};
  for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
    /* `out['__proto__'] = owned` would re-parent `out`, and every later lookup of
       a name it does not hold would read through into that entry's fields. Not
       an operator; dropped. */
    if (!isSafeKey(name)) continue;
    const owned = clean(value);
    /* All or nothing, like the depot's. An import that kept the rows it could read
       would leave the reader believing the whole file had landed. */
    if (!owned) return null;
    out[name] = owned;
  }
  return out;
}

export function formatRosterExport(roster: Roster): string {
  const sorted = Object.keys(roster).sort();
  return JSON.stringify(Object.fromEntries(sorted.map((k) => [k, roster[k]])), null, 2);
}

/** "E2 L60 SL7 S1M3 Mod1S2" -- the same shape the build panel's from-to line uses.
 *  Modules read Mod<n>S<stage> so they cannot be mistaken for a mastery, which is the
 *  other thing here written as a letter and a number. */
export function ownedLabel(owned: Owned): string {
  const masteries = Object.entries(owned.masteries)
    .map(([i, m]) => [Number(i), m] as const)
    .filter(([, m]) => m > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([i, m]) => `S${i + 1}M${m}`);
  const modules = Object.entries(owned.modules ?? {})
    .map(([i, st]) => [Number(i), Number(st)] as const)
    .filter(([, st]) => st >= 0)
    .sort((a, b) => a[0] - b[0])
    .map(([i, st]) => `Mod${i + 1}S${st + 1}`);
  return [`E${owned.elite}`, `L${owned.level}`, `SL${owned.skillLevel}`, ...masteries, ...modules].join(' ');
}
