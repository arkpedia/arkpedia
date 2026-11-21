/**
 * A Yostar account (Global, Japan or Korea), as the game server sends it (lib/account-import's readAccount), read
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
  /** Global beginner programme identity, resolved by registration date; absent in old releases.
   *  missionIds: the programme's missions (absent from a map built before them). */
  beginnerPrograms?: { id: string; startTs: number; endTs?: number; missionIds?: string[] }[];
  /** favor_table: minimum favorPoint for each displayed trust percentage, 0–200. */
  trustThresholds?: number[];
  /** global: the EN client has the operator, so the account page counts it. rarity: for its
   *  icon on the profile card. Absent from a map built before either was added. */
  chars: Record<string, { name: string; rarity?: number; modules: Record<string, number>; global?: true; formOf?: string; nation?: string }>;
  /** The profile card's names, by the game's ids (absent before they were added). */
  nameCards?: Record<string, string>;
  /** Each card style's subtitle, and the nations whose emblems the card shows (absent before
   *  they were added). */
  nameCardThemes?: Record<string, string>;
  nameCardVariants?: Record<string, number>;
  nameCardPlain?: string[];
  /** Each theme's colours, from its bundle in the client (scripts/imports/import-namecard-styles.py). */
  nameCardStyles?: Record<string, { theme: string; themeText: string; panel: string; panelText: string; panelIcon: string }>;
  medals?: Record<string, string>;
  nations?: string[];
  /** A support unit shown full length: each module's type mark (by its equipment id), and each
   *  skill's icon where it is not the skill's own id. Absent from a map built before them; the
   *  account page fills them from the deployment's copy then. */
  moduleTypes?: Record<string, string>;
  skillIcons?: Record<string, string>;
  /** Each Global headhunting pool's banner name, by the game's pool id (lib/gacha/bannerPools.ts):
   *  the pull history's banners. Absent from a map built before it. */
  pools?: Record<string, string>;
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
  potentialRank?: number;
  charId?: string;
  evolvePhase?: number;
  level?: number;
  mainSkillLvl?: number;
  favorPoint?: number;
  currentEquip?: string | null;
  skills?: GameSkill[];
  equip?: Record<string, GameEquip>;
  /** Amiya's forms: per form, its own skills and modules; promotion and level are shared. */
  tmpl?: Record<string, { skills?: GameSkill[]; equip?: Record<string, GameEquip>; currentEquip?: string | null }>;
  /** The form Amiya is in now, the one whose skills the training room trains. */
  currentTmpl?: string;
}

/** The room's trainee, as the game sends it: `state` is 0 with no trainee, 1 in progress, 2
 *  finished but not yet collected, 3 idle (the Krooster import reads it the same way). */
interface GameTrainee { charInstId?: number; targetSkill?: number; state?: number }

/** The skill the training room is raising, counted in the roster as already raised. */
export interface TrainingCounted {
  operator: string;
  /** 0-based, the planner's skill index. */
  skill: number;
  /** The mastery the roster now holds for it: the one in training, 1 to 3. */
  mastery: 1 | 2 | 3;
}

export interface GameAccountImport {
  roster: Roster;
  depot: Depot;
  /** The training room's skill counted as done, or absent when it was not training one. */
  training?: TrainingCounted;
  /** Character ids the map has no operator for, as the game names them. */
  unknown: string[];
}

const whole = (value: unknown, low: number, high: number, fallback: number) => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.min(high, Math.max(low, number)) : fallback;
};

function owned(char: GameChar, form: { skills?: GameSkill[]; equip?: Record<string, GameEquip>; currentEquip?: string | null }, modules: Record<string, number>, thresholds?: number[]): Owned {
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
  const trust = typeof char.favorPoint === 'number' && Number.isFinite(char.favorPoint) && char.favorPoint >= 0
    && thresholds?.length === 201 && thresholds.every((point, index) => Number.isFinite(point) && point >= 0 && (!index || point > thresholds[index - 1]))
    ? Math.max(0, thresholds.findLastIndex(point => point <= char.favorPoint!)) : undefined;
  const equipped = form.currentEquip;
  const equippedModule = typeof equipped === 'string' && equipped in modules && modules[equipped] in stages ? modules[equipped]
    : equipped === null || typeof equipped === 'string' && equipped.startsWith('uniequip_001_') ? null : undefined;
  return {
    elite: whole(char.evolvePhase, 0, 2, 0),
    ...(typeof char.potentialRank === 'number' ? { potential: whole(char.potentialRank, 0, 5, 0) + 1 } : {}),
    ...(trust !== undefined ? { trust } : {}),
    ...(equippedModule !== undefined ? { equippedModule } : {}),
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
      roster[entry.name] = owned(char, form ?? {}, entry.modules, map.trustThresholds);
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
  const training = countTraining(user, map, roster);
  return { roster, depot, ...(training ? { training } : {}), unknown: [...new Set(unknown)].sort() };
}

/**
 * The skill in the Training Room, counted as its next mastery, in `roster` (changed in place).
 *
 * An account says Surtr is at Mastery 2 on her second skill while she is training it to 3, and
 * the plan that reads the roster would price a mastery she is days from owning. So the mastery
 * in training is counted as done: the one more than the skill's own level, at most 3. Only a
 * trainee the room is working on (in progress, or finished and not collected) counts; an idle
 * room, an empty one and a skill already at 3 change nothing. Amiya trains the skills of the
 * form she is in. The roster already holds the operator the game lists; one it does not
 * (unknown to the map) has nothing to raise.
 */
function countTraining(user: Record<string, any>, map: GameAccountMap, roster: Roster): TrainingCounted | undefined {
  const rooms = user.building?.rooms?.TRAINING;
  if (!rooms || typeof rooms !== 'object') return undefined;
  for (const room of Object.values(rooms as Record<string, { trainee?: GameTrainee }>)) {
    const trainee = room?.trainee;
    if (!trainee || typeof trainee.charInstId !== 'number' || trainee.charInstId < 0) continue;
    if (typeof trainee.targetSkill !== 'number' || trainee.targetSkill < 0 || trainee.targetSkill > 2) continue;
    if (trainee.state !== 1 && trainee.state !== 2) continue;
    const char = user.troop?.chars?.[trainee.charInstId] as GameChar | undefined;
    if (!char) continue;
    const id = char.currentTmpl && char.tmpl?.[char.currentTmpl] ? char.currentTmpl : char.charId ?? '';
    const entry = map.chars[id];
    const owned = entry && isSafeKey(entry.name) ? roster[entry.name] : undefined;
    if (!entry || !owned) continue;
    const form = char.currentTmpl && char.tmpl?.[char.currentTmpl] ? char.tmpl[char.currentTmpl] : char;
    const skill = trainee.targetSkill;
    const reached = whole(form.skills?.[skill]?.specializeLevel, 0, 3, 0);
    if (reached >= 3) continue;
    owned.masteries = { ...owned.masteries, [skill]: (reached + 1) as 1 | 2 | 3 };
    return { operator: entry.name, skill, mastery: (reached + 1) as 1 | 2 | 3 };
  }
  return undefined;
}
