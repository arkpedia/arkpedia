/**
 * A Global account, as the game server sends it (lib/account-import's readAccount), read
 * into the planner's two stores: the roster (what each operator is at) and the depot.
 *
 * The game is the authority on what you own, so an import REPLACES both: every operator
 * the account has, at the state the game holds, and every material the depot tracks, at
 * the game's count (none held is 0, not "unchanged"). The goals are left alone, since
 * they are the reader's plan and the game knows nothing of them.
 *
 * Unlike a planner file, it is not all or nothing. An operator released this week may have
 * no record yet; it is skipped and named, and the other four hundred still arrive.
 *
 * The ids are mapped by data/game-account-map.json (scripts/build/build-game-account-map.ts)
 * and data/import-aliases.json's byItemId (the Krooster import's), both release tables.
 */
import type { Depot } from './depot';
import type { ImportAliases } from './foreignImport';
import type { Owned, Roster } from './roster';
import { isSafeKey, MAX_COUNT } from './untrusted';

export interface GameAccountMap {
  version: 1;
  /** global: the EN client has the operator, so the account page counts it. rarity: for its
   *  icon on the profile card. Absent from a map built before either was added. */
  chars: Record<string, { name: string; rarity?: number; modules: Record<string, number>; global?: true }>;
  /** The profile card's names, by the game's ids (absent before they were added). */
  nameCards?: Record<string, string>;
  medals?: Record<string, string>;
}

/** The table's shape, checked where it is loaded, as the other planner tables are. */
export function checkGameAccountMap(value: unknown): GameAccountMap {
  const map = value as GameAccountMap;
  const chars = map && typeof map === 'object' ? map.chars : null;
  if (!chars || typeof chars !== 'object' || !Object.keys(chars).length
    || Object.values(chars).some((char) => typeof char?.name !== 'string' || !char.modules || typeof char.modules !== 'object')) {
    throw new Error('gameAccount: data/game-account-map.json is not a map of character ids. Re-run: npx tsx scripts/build/build-game-account-map.ts');
  }
  return map;
}

interface GameSkill { specializeLevel?: number }
interface GameEquip { locked?: number; level?: number }
interface GameChar {
  charId?: string;
  evolvePhase?: number;
  level?: number;
  mainSkillLvl?: number;
  skills?: GameSkill[];
  equip?: Record<string, GameEquip>;
  /** Amiya's forms: per form, its own skills and modules; promotion and level are shared. */
  tmpl?: Record<string, { skills?: GameSkill[]; equip?: Record<string, GameEquip> }>;
}

export interface GameAccountImport {
  roster: Roster;
  depot: Depot;
  /** Character ids the map has no operator for, as the game names them. */
  unknown: string[];
}

const whole = (value: unknown, low: number, high: number, fallback: number) => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.min(high, Math.max(low, number)) : fallback;
};

function owned(char: GameChar, form: { skills?: GameSkill[]; equip?: Record<string, GameEquip> }, modules: Record<string, number>): Owned {
  const masteries: Owned['masteries'] = {};
  (Array.isArray(form.skills) ? form.skills : []).forEach((skill, index) => {
    const level = whole(skill?.specializeLevel, 0, 3, 0);
    if (level > 0) masteries[index] = level as 1 | 2 | 3;
  });
  const stages: Record<number, number> = {};
  for (const [equipId, equip] of Object.entries(form.equip ?? {})) {
    // The Original module (uniequip_001) is not in the map, and a locked one is not unlocked.
    if (!(equipId in modules) || equip?.locked) continue;
    stages[modules[equipId]] = whole(equip.level, 1, 3, 1) - 1;
  }
  return {
    elite: whole(char.evolvePhase, 0, 2, 0),
    level: whole(char.level, 1, 90, 1),
    skillLevel: whole(char.mainSkillLvl, 1, 7, 1),
    masteries,
    ...(Object.keys(stages).length ? { modules: stages } : {}),
  };
}

export function readGameAccount(user: Record<string, any>, map: GameAccountMap, aliases: ImportAliases, depotNames: string[]): GameAccountImport {
  const roster: Roster = {};
  const unknown: string[] = [];
  for (const char of Object.values((user.troop?.chars ?? {}) as Record<string, GameChar>)) {
    const forms = char?.tmpl && typeof char.tmpl === 'object' ? Object.entries(char.tmpl) : [[char?.charId ?? '', char] as const];
    for (const [id, form] of forms) {
      const entry = map.chars[id];
      if (!entry || !isSafeKey(entry.name)) { unknown.push(String(id)); continue; }
      roster[entry.name] = owned(char, form ?? {}, entry.modules);
    }
  }

  // Every material the depot tracks, at the game's count. LMD is not an item in the
  // account but its gold; the alias map names it under the client's item id 4001.
  const held: Record<string, number> = { ...(user.inventory ?? {}), 4001: user.status?.gold ?? 0 };
  const depot: Depot = Object.fromEntries(depotNames.map((name) => [name, 0]));
  for (const [itemId, count] of Object.entries(held)) {
    const name = aliases.byItemId[itemId];
    if (name && name in depot) depot[name] = whole(count, 0, MAX_COUNT, 0);
  }
  return { roster, depot, unknown: [...new Set(unknown)].sort() };
}
