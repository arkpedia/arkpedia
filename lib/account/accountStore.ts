import { rewardClaimsFromGame, parseRewardClaims, type RewardClaims } from './rewardClaims';
import { permanentClaimsFromGame, parsePermanentClaims, type PermanentClaims } from './permanentClaims';
/**
 * What the reader's Arknights account holds, as the last game import read it: the one
 * record every page that cares about ownership reads (issue #94). The import is the
 * account's truth, so a new one replaces it whole.
 *
 *   operators  the operators owned, by the name the site uses (Amiya's forms each by theirs)
 *   skins      the outfits owned, by the game's skin id, which every skin record carries
 *   cleared    the stages cleared, by the game's stage id
 *   annihilation  the Annihilation maps whose every kill-count reward is claimed
 *              (campaignsV2), by the game's map id; absent on a record from before it
 *   outfits    the outfit each operator wears, by the site's name, as the game's skin id (its
 *              default art too: "char_1013_chen2#2"); absent on a record from before it
 *   wallet     what the account holds to pull with, as the Pull Planner's resources take it;
 *              absent on a record from before it
 *   profile    what the account page shows: level, when it was registered, the assistant, the
 *              signature (absent on a record written before it had them)
 *   pulls      when an import last read the headhunting history and whether it failed
 *              (lib/account/pulls.ts PullReadStatus); absent until an import has tried. The
 *              rows themselves are the pull archive's (lib/account/pullArchive), one history
 *              per game account that each import adds to, since Yostar keeps only 90 days
 *
 * The planner's import writes it (Export / import > From the game), where the id map it
 * needs is a release table; it lives only in this browser's localStorage. Nothing
 * hand-entered goes in here: the planner's own roster may hold operators the reader does not
 * have yet, for planning, and those are not owned.
 *
 * One record per server (Global, Japan, Korea), for a reader with accounts on several: the shown
 * one is the record every page reads (ACCOUNT_STORAGE_KEY), and the latest import of each other
 * server waits under OTHER_ACCOUNTS_KEY, its pull history with it, until the Account page shows
 * it (showAccount). Each record is in one place only, so nothing has two copies to drift apart.
 * A record an older build wrote still carries its pull rows: the archive store moves them into
 * the archive once (pullArchiveStore migrateLegacyPullRows), and this parser keeps the status.
 */
import { useSyncExternalStore } from 'react';
import type { GameAccountMap } from '@/lib/planner/gameAccount';
import { isServerId, type ServerId } from '@/lib/account-import/yostar';
import { parsePullStatus, type PullReadStatus } from './pulls';
import { baseSnapshotFromGame, parseBaseSnapshot, type AccountBaseSnapshot } from './baseSnapshot';
import { parseRosterExport, type Roster } from '@/lib/planner/roster';
import { medalsFromGame, parseMedalCollection, type OwnedMedal } from './medals';

export const ACCOUNT_STORAGE_KEY = 'arkpediaAccount';
/** The other servers' records, { [server]: record }: none but the shown one's server is ever
 *  missing from both places once imported. */
export const OTHER_ACCOUNTS_KEY = 'arkpediaOtherAccounts';
/** Same-tab writes: the native `storage` event fires only in the other tabs. */
export const ACCOUNT_EVENT = 'arkpediaAccountChanged';

export interface AccountRecord {
  version: 1;
  /** The server it was imported from (lib/account-import/yostar SERVERS). */
  server: ServerId;
  /** When the import read it, ISO. */
  importedAt: string;
  /** The Doctor's name and number, to say whose it is. */
  doctor: string | null;
  operators: string[];
  /** The roster by the game's character ids (troop.chars, Amiya's forms too), whatever the
   *  site has a record of. Absent on a record from before it. */
  operatorIds?: string[];
  skins: string[];
  cleared: string[];
  /** Three-star clears that actually award the first-clear Originite. Older snapshots omit it. */
  rewardCleared?: string[];
  rewardClaims?: RewardClaims;
  /** Which Integrated Strategies / Stationary Security Service rewards the save says are claimed
   *  (lib/account/permanentClaims.ts), for the planner's Farming method. Absent on an older record. */
  permanentClaims?: PermanentClaims;
  annihilation?: string[];
  outfits?: Record<string, string>;
  wallet?: AccountWallet;
  profile?: AccountProfile;
  pulls?: PullReadStatus;
  base?: AccountBaseSnapshot;
  /** Selected in-game home background, from background.selected; absent on older imports. */
  homeBackground?: string;
  /** Per-server build snapshot, kept with the account rather than another server's planner. */
  operatorBuilds?: Roster;
}

/** From the game's status: Orundum (diamondShard); Originite Prime (payDiamond plus
 *  freeDiamond where the server splits it, otherwise the larger of the two platforms'
 *  androidDiamond and iosDiamond); Headhunting Permits (gachaTicket, plus ten for each
 *  tenGachaTicket); Distinction Certificates, the yellow ones (hggShard); and when the
 *  Monthly Card runs out (monthlySubscriptionEndTime, ISO), null without one. */
export interface AccountWallet {
  orundum: number;
  originitePrime: number;
  permits: number;
  yellowCerts: number;
  monthlyCardUntil: string | null;
}

export interface AccountProfile {
  /** Count-only friend availability from the most recent manual game import. */
  friendSlots?: { used: number; limit: number };
  level: number | null;
  /** status.registerTs, ISO. */
  registeredAt: string | null;
  /** The assistant (status.secretary), by the site's name. */
  secretary: string | null;
  /** The profile's signature line (status.resume). */
  bio: string | null;
  /** What the game's profile card shows, by the game's ids where the art is named by them
   *  (arkpedia-image-assets' profile-* folders). Absent on a record from before them. */
  uid?: string | null;
  /** status.avatar's id: a profile-avatars icon ("avatar_special_41"), or for the "Assistant
   *  Operator" avatar the assistant's skin id ("char_1019_siege2@epoque#50"). */
  avatar?: string | null;
  /** status.avatar's type, which says which of the two the id is: ASSISTANT, ICON, DEFAULT or
   *  NONE (the game's PlayerAvatarType), null when the game sent none (a new account sends
   *  "avatar": {} or nothing). Absent on a record from before it (lib/account/portraits.ts
   *  avatarSources tells those apart by the id). */
  avatarType?: AvatarType | null;
  nameCard?: string | null;
  /** Operators hired, as the card counts them (Amiya once). */
  hired?: number;
  supports?: SupportUnit[];
  /** The card style's variant the player picked (nameCardStyle.skin.tmpl), for a style with
   *  several; the assistant's outfit (status.secretarySkinId), which a style without a theme
   *  shows; the card's removable panels in the player's order (componentOrder: module_sign,
   *  module_assist, module_medal, module_equip, module_mainline), and the Module panel's
   *  counts. Absent on a record from before them. */
  nameCardVariant?: number;
  secretarySkin?: string | null;
  panels?: string[];
  modules?: { collected: number; stage3: number; operators: number };
  /** The medal board: each medal at its board position, or without one on a template board. */
  medals?: { id: string; x: number | null; y: number | null }[];
  /** All obtained medals and their completion dates; absent on older board-only imports. */
  medalCollection?: OwnedMedal[];
}

export interface SupportUnit {
  name: string;
  rarity: number | null;
  level: number;
  elite: number;
  potential: number;
  /** 1-based, the skill it lends with. */
  skill: number | null;
  /** Mastery of the selected support skill, not the all-skills badge. */
  skillMastery?: number | null;
  /** Actual imported ranks, excluding unfinished training. Older snapshots omit these. */
  skillLevel?: number | null;
  skillMasteries?: (number | null)[];
  moduleLevel?: number | null;
  /** Every one of its skills at Mastery 3: the game's badge on a support unit is for that,
   *  not for the skill it lends. Absent on a record from before it. */
  allMastered?: boolean;
  /** Shown full length, the card also draws the module it wears (its equipment id, null for
   *  none) and the skill it lends (the game's skill id). Absent on a record from before them. */
  module?: string | null;
  skillId?: string | null;
  /** The outfit it wears, as the game's skin id (its portrait: lib/account/portraits.ts).
   *  Absent on a record from before it. */
  skin?: string | null;
}

/** The game's PlayerAvatarType: what status.avatar's id names. */
export type AvatarType = 'ASSISTANT' | 'ICON' | 'DEFAULT' | 'NONE';
const AVATAR_TYPES = new Set<unknown>(['ASSISTANT', 'ICON', 'DEFAULT', 'NONE']);
const avatarType = (value: unknown) => (AVATAR_TYPES.has(value) ? value as AvatarType : null);

const SKIN_ID = /^[\w@#+-]{1,100}$/;
const gameId = (value: unknown) => (typeof value === 'string' && /^[\w-]{1,100}$/.test(value) ? value : null);
const skinId = (value: unknown) => (typeof value === 'string' && SKIN_ID.test(value) ? value : null);

/** The card's removable panels the page draws. */
export const PANELS = new Set(['module_sign', 'module_assist', 'module_medal', 'module_equip', 'module_mainline']);
const count = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 100000 ? value : 0);
const moduleCounts = (value: Record<string, unknown>) => ({ collected: count(value.collected), stage3: count(value.stage3), operators: count(value.operators) });

const amount = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10_000_000 ? value : 0);
const isoDate = (value: unknown) => (typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) ? value : null);

function walletFromStatus(status: Record<string, any>): AccountWallet {
  const split = typeof status.payDiamond === 'number' || typeof status.freeDiamond === 'number';
  const until = Number(status.monthlySubscriptionEndTime);
  return {
    orundum: amount(status.diamondShard),
    originitePrime: split ? amount(status.payDiamond) + amount(status.freeDiamond) : Math.max(amount(status.androidDiamond), amount(status.iosDiamond)),
    permits: amount(status.gachaTicket) + 10 * amount(status.tenGachaTicket),
    yellowCerts: amount(status.hggShard),
    monthlyCardUntil: Number.isFinite(until) && until > 0 ? new Date(until * 1000).toISOString() : null,
  };
}

const CHAR_ID = /^char_\w{1,100}$/;
const strings = (value: unknown, max: number) => Array.isArray(value) && value.length <= max && value.every((item) => typeof item === 'string' && item.length <= 200);

/** A stored record, or null for anything that is not one. */
export function parseAccount(raw: string | null): AccountRecord | null {
  if (!raw) return null;
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || value.version !== 1 || !isServerId(value.server) || typeof value.importedAt !== 'string') return null;
  if (!strings(value.operators, 5000) || !strings(value.skins, 20000) || !strings(value.cleared, 50000)) return null;
  const profile = value.profile && typeof value.profile === 'object' ? value.profile as Record<string, unknown> : null;
  const medalCollection = parseMedalCollection(profile?.medalCollection);
  const base = parseBaseSnapshot(value.base);
  const operatorBuilds = value.operatorBuilds ? parseRosterExport(JSON.stringify(value.operatorBuilds)) : null;
  const text = (field: unknown) => (typeof field === 'string' && field.length <= 500 ? field : null);
  return {
    version: 1, server: value.server, importedAt: value.importedAt,
    doctor: typeof value.doctor === 'string' ? value.doctor : null,
    ...(base ? { base } : {}),
    ...(gameId(value.homeBackground) ? { homeBackground: gameId(value.homeBackground)! } : {}),
    ...(parseRewardClaims(value.rewardClaims) ? { rewardClaims: parseRewardClaims(value.rewardClaims) } : {}),
    ...(parsePermanentClaims(value.permanentClaims) ? { permanentClaims: parsePermanentClaims(value.permanentClaims) } : {}),
    operators: value.operators as string[], skins: value.skins as string[], cleared: value.cleared as string[],
    ...(strings(value.operatorIds, 5000) && (value.operatorIds as string[]).every((id) => CHAR_ID.test(id)) ? { operatorIds: value.operatorIds as string[] } : {}),
    ...(strings(value.rewardCleared, 50000) ? { rewardCleared: value.rewardCleared as string[] } : {}),
    ...(operatorBuilds ? { operatorBuilds } : {}),
    ...(strings(value.annihilation, 500) ? { annihilation: value.annihilation as string[] } : {}),
    ...(value.outfits && typeof value.outfits === 'object' ? { outfits: Object.fromEntries(Object.entries(value.outfits as Record<string, unknown>)
      .slice(0, 5000).flatMap(([name, skin]) => (name.length <= 200 && skinId(skin) ? [[name, skinId(skin)!]] : []))) } : {}),
    ...(value.wallet && typeof value.wallet === 'object' ? (() => {
      const wallet = value.wallet as Record<string, unknown>;
      return { wallet: { orundum: amount(wallet.orundum), originitePrime: amount(wallet.originitePrime), permits: amount(wallet.permits), yellowCerts: amount(wallet.yellowCerts), monthlyCardUntil: isoDate(wallet.monthlyCardUntil) } };
    })() : {}),
    ...(profile ? { profile: {
      level: typeof profile.level === 'number' && Number.isFinite(profile.level) ? profile.level : null,
      registeredAt: text(profile.registeredAt), secretary: text(profile.secretary), bio: text(profile.bio),
      uid: text(profile.uid), avatar: text(profile.avatar), nameCard: text(profile.nameCard),
      ...(profile.friendSlots && typeof profile.friendSlots==='object' && Number.isInteger((profile.friendSlots as {used:number}).used) && Number.isInteger((profile.friendSlots as {limit:number}).limit) && (profile.friendSlots as {used:number}).used>=0 && (profile.friendSlots as {limit:number}).limit>=0 && (profile.friendSlots as {limit:number}).limit<=1000 && (profile.friendSlots as {used:number;limit:number}).used<=(profile.friendSlots as {used:number;limit:number}).limit ? {friendSlots:profile.friendSlots as {used:number;limit:number}} : {}),
      ...(profile.avatarType !== undefined ? { avatarType: avatarType(profile.avatarType) } : {}),
      ...(typeof profile.hired === 'number' ? { hired: profile.hired } : {}),
      supports: Array.isArray(profile.supports) ? (profile.supports as SupportUnit[]).filter((unit) => unit && typeof unit.name === 'string').slice(0, 3)
        // A record from the first build of the badge kept the lent skill's mastery instead
      // (mastery): dropped, so no badge shows until the next import says.
      .map(({ mastery: _, ...unit }: SupportUnit & { mastery?: unknown }) => ({ ...unit, skin: skinId(unit.skin), ...(unit.allMastered === undefined ? {} : { allMastered: unit.allMastered === true }),
        ...(unit.module === undefined ? {} : { module: gameId(unit.module) }), ...(unit.skillId === undefined ? {} : { skillId: gameId(unit.skillId) }),
        skillMastery:typeof unit.skillMastery==='number'&&Number.isInteger(unit.skillMastery)&&unit.skillMastery>=0&&unit.skillMastery<=3?unit.skillMastery:null,
        ...(unit.skillLevel===undefined?{}:{skillLevel:Number.isInteger(unit.skillLevel)&&unit.skillLevel!>=1&&unit.skillLevel!<=7?unit.skillLevel:null}),
        ...(unit.skillMasteries===undefined?{}:{skillMasteries:Array.isArray(unit.skillMasteries)?unit.skillMasteries.slice(0,3).map(m=>Number.isInteger(m)&&m!>=0&&m!<=3?m:null):[]}),
        moduleLevel:typeof unit.moduleLevel==='number'&&Number.isInteger(unit.moduleLevel)&&unit.moduleLevel>=1&&unit.moduleLevel<=3?unit.moduleLevel:null })) : [],
      ...(typeof profile.nameCardVariant === 'number' && Number.isInteger(profile.nameCardVariant) && profile.nameCardVariant >= 0 && profile.nameCardVariant < 20 ? { nameCardVariant: profile.nameCardVariant } : {}),
      ...(profile.secretarySkin !== undefined ? { secretarySkin: skinId(profile.secretarySkin) } : {}),
      ...(strings(profile.panels, 10) ? { panels: (profile.panels as string[]).filter((panel) => PANELS.has(panel)) } : {}),
      ...(profile.modules && typeof profile.modules === 'object' ? { modules: moduleCounts(profile.modules as Record<string, unknown>) } : {}),
      medals: Array.isArray(profile.medals) ? (profile.medals as { id: string; x: number | null; y: number | null }[]).filter((medal) => medal && typeof medal.id === 'string').slice(0, 64) : [],
      ...(medalCollection !== undefined ? { medalCollection } : {}),
    } } : {}),
    ...(() => {
      const pulls = parsePullStatus(value.pulls);
      return pulls ? { pulls } : {};
    })(),
  };
}

/**
 * The record an account (as the game server sends it) gives. Operators by the map's names,
 * those it has no record for left out (the planner's import names them); skins and stages
 * by the game's ids. A stage counts as cleared at state 2 or 3 (cleared, or with every
 * star); 0 and 1 are opened and not cleared.
 */
export function accountFromGame(user: Record<string, any>, map: GameAccountMap, server: ServerId, now = new Date()): AccountRecord {
  const operators = new Set<string>();
  const operatorIds = new Set<string>();
  const outfits: Record<string, string> = {};
  for (const char of Object.values((user.troop?.chars ?? {}) as Record<string, { charId?: string; skin?: unknown; tmpl?: Record<string, { skinId?: unknown }> }>)) {
    // Amiya's forms each wear their own outfit (tmpl), every other operator one (skin).
    const forms = char?.tmpl && typeof char.tmpl === 'object' ? Object.entries(char.tmpl).map(([id, form]) => [id, form?.skinId] as const) : [[char?.charId ?? '', char?.skin] as const];
    for (const [id, skin] of forms) {
      if (CHAR_ID.test(id)) operatorIds.add(id);
      if (!map.chars[id]) continue;
      operators.add(map.chars[id].name);
      if (skinId(skin)) outfits[map.chars[id].name] = skinId(skin)!;
    }
  }
  const stages = (user.dungeon?.stages ?? {}) as Record<string, { state?: number }>;
  // Paradox Simulations are operator handbook stages, outside dungeon.stages.
  // UNLOCKED/PLAYED/PASS are not the COMPLETE first-reward state.
  const handbookStages = Object.values(user.troop?.addon && typeof user.troop.addon === 'object' && !Array.isArray(user.troop.addon)
    ? user.troop.addon : {}).flatMap((addon: any) => addon?.stage && typeof addon.stage === 'object' && !Array.isArray(addon.stage)
      ? Object.entries(addon.stage) as [string, { state?: number }][] : []);
  const cleared = [...Object.entries(stages), ...handbookStages].filter(([, stage]) => typeof stage?.state === 'number' && stage.state >= 2).map(([id]) => id);
  const rewardCleared = [...Object.entries(stages), ...handbookStages].filter(([, stage]) => stage?.state === 3).map(([id]) => id);
  const status = user.status ?? {};
  const medalCollection = medalsFromGame(user.medal?.medals);
  const base = baseSnapshotFromGame(user, map);
  return {
    version: 1,
    rewardClaims: rewardClaimsFromGame(user, server === 'en' ? map.beginnerPrograms : undefined),
    permanentClaims: permanentClaimsFromGame(user),
    server,
    importedAt: now.toISOString(),
    ...(base ? { base } : {}),
    ...(gameId(user.background?.selected) ? { homeBackground: gameId(user.background.selected)! } : {}),
    doctor: status.nickName ? `${status.nickName}#${status.nickNumber ?? ''}` : null,
    operators: [...operators].sort(),
    operatorIds: [...operatorIds].sort(),
    skins: Object.keys(user.skin?.characterSkins ?? {}).sort(),
    cleared: [...new Set(cleared)].sort(),
    ...((user.dungeon?.stages && typeof user.dungeon.stages === 'object' && !Array.isArray(user.dungeon.stages)) || handbookStages.length
      ? { rewardCleared: [...new Set(rewardCleared)].sort() } : {}),
    annihilation: Object.entries((user.campaignsV2?.instances ?? {}) as Record<string, { rewardStatus?: unknown }>)
      .filter(([, map]) => Array.isArray(map?.rewardStatus) && map.rewardStatus.length > 0 && map.rewardStatus.every((claimed) => claimed === 1))
      .map(([id]) => id).sort(),
    outfits: Object.fromEntries(Object.entries(outfits).sort(([a], [b]) => a.localeCompare(b))),
    wallet: walletFromStatus(status),
    profile: {
      level: typeof status.level === 'number' ? status.level : null,
      registeredAt: typeof status.registerTs === 'number' && status.registerTs > 0 ? new Date(status.registerTs * 1000).toISOString() : null,
      secretary: map.chars[status.secretary]?.name ?? null,
      bio: typeof status.resume === 'string' && status.resume.trim() ? status.resume.trim().slice(0, 500) : null,
      uid: status.uid != null ? String(status.uid) : null,
      ...(Number.isInteger(user.social?.arkpediaFriendCount) && Number.isInteger(status.friendNumLimit) && user.social.arkpediaFriendCount>=0 && user.social.arkpediaFriendCount<=status.friendNumLimit && status.friendNumLimit<=1000
        ? {friendSlots:{used:user.social.arkpediaFriendCount,limit:status.friendNumLimit}} : {}),
      // The id alone does not say what it names: for the "Assistant Operator" avatar the game
      // sends the assistant's skin id, which no profile-avatars file is named by.
      avatar: skinId(status.avatar?.id),
      avatarType: avatarType(status.avatar?.type),
      nameCard: typeof user.nameCardStyle?.skin?.selected === 'string' ? user.nameCardStyle.skin.selected : null,
      ...(() => {
        const variant = Number(user.nameCardStyle?.skin?.tmpl?.[user.nameCardStyle?.skin?.selected]);
        return Number.isInteger(variant) && variant >= 0 && variant < 20 ? { nameCardVariant: variant } : {};
      })(),
      secretarySkin: skinId(status.secretarySkinId),
      panels: ((user.nameCardStyle?.componentOrder ?? []) as unknown[]).filter((panel): panel is string => typeof panel === 'string' && PANELS.has(panel)),
      modules: moduleTotals(user),
      hired: Object.keys(user.troop?.chars ?? {}).length,
      supports: supportUnits(user, map),
      medals: medalBoard(user),
      ...(medalCollection !== undefined ? { medalCollection } : {}),
    },
  };
}

/** The support units the profile shows (social.assistCharList), from the troop's own records. */
function supportUnits(user: Record<string, any>, map: GameAccountMap): SupportUnit[] {
  const chars = (user.troop?.chars ?? {}) as Record<string, Record<string, any>>;
  return ((user.social?.assistCharList ?? []) as ({ charInstId?: number; skillIndex?: number } | null)[]).flatMap((slot) => {
    const char = slot && chars[String(slot.charInstId)];
    const entry = char && (map.chars[char.currentTmpl ?? ''] ?? map.chars[char.charId ?? '']);
    if (!char || !entry) return [];
    const skin = char.currentTmpl ? char.tmpl?.[char.currentTmpl]?.skinId : char.skin;
    // Amiya's forms each keep their own skills (tmpl), every other operator one list.
    const skills = (char.currentTmpl ? char.tmpl?.[char.currentTmpl]?.skills : char.skills) as { specializeLevel?: unknown }[] | undefined;
    const allMastered = !!skills?.length && skills.every((skill) => Number(skill?.specializeLevel) === 3);
    const lent = typeof slot!.skillIndex === 'number' && slot!.skillIndex >= 0 ? (skills?.[slot!.skillIndex] as { skillId?: unknown } | undefined)?.skillId : null;
    const equip = char.currentTmpl ? char.tmpl?.[char.currentTmpl]?.currentEquip : char.currentEquip;
    const selectedSkill=typeof slot!.skillIndex==='number'?skills?.[slot!.skillIndex]:null;
    const selectedEquipment=(char.currentTmpl ? char.tmpl?.[char.currentTmpl]?.equip : char.equip)?.[equip];
    return [{
      name: entry.name, rarity: entry.rarity ?? null,
      level: Number(char.level) || 1, elite: Number(char.evolvePhase) || 0, potential: (Number(char.potentialRank) || 0) + 1,
      skill: typeof slot!.skillIndex === 'number' && slot!.skillIndex >= 0 ? slot!.skillIndex + 1 : null,
      skillMastery:typeof selectedSkill?.specializeLevel==='number'&&Number.isInteger(selectedSkill.specializeLevel)&&selectedSkill.specializeLevel>=0&&selectedSkill.specializeLevel<=3?selectedSkill.specializeLevel:null,
      skillLevel:Number.isInteger(char.mainSkillLvl)&&char.mainSkillLvl>=1&&char.mainSkillLvl<=7?char.mainSkillLvl:null,
      skillMasteries:(skills??[]).slice(0,3).map(s=>typeof s.specializeLevel==='number'&&Number.isInteger(s.specializeLevel)&&s.specializeLevel>=0&&s.specializeLevel<=3?s.specializeLevel:null),
      moduleLevel:gameId(equip)&&Object.hasOwn(entry.modules,equip)&&!selectedEquipment?.locked&&Number.isInteger(selectedEquipment?.level)&&selectedEquipment.level>=1&&selectedEquipment.level<=3?selectedEquipment.level:null,
      allMastered,
      module: gameId(equip),
      skillId: gameId(lent),
      skin: skinId(skin),
    }];
  }).slice(0, 3);
}

/** The Module panel's counts, as the game's card gives them: modules unlocked (the Original
 *  one is not a module), those at Stage 3, and operators with at least one. Amiya's forms
 *  each have their own (tmpl); she is one operator. */
function moduleTotals(user: Record<string, any>): { collected: number; stage3: number; operators: number } {
  let collected = 0, stage3 = 0, operators = 0;
  for (const char of Object.values((user.troop?.chars ?? {}) as Record<string, Record<string, any>>)) {
    const forms = char?.tmpl && typeof char.tmpl === 'object' ? Object.values(char.tmpl as Record<string, Record<string, any>>) : [char];
    let has = false;
    for (const form of forms) {
      for (const [id, equip] of Object.entries((form?.equip ?? {}) as Record<string, { locked?: number; level?: number }>)) {
        if (id.startsWith('uniequip_001') || equip?.locked) continue;
        collected += 1; has = true;
        if (Number(equip?.level) >= 3) stage3 += 1;
      }
    }
    if (has) operators += 1;
  }
  return { collected, stage3, operators };
}

/** The medal board the profile shows: the custom layout it names, with positions, or a
 *  template's list without them. */
function medalBoard(user: Record<string, any>): { id: string; x: number | null; y: number | null }[] {
  const board = user.social?.medalBoard ?? {};
  if (board.type === 'CUSTOM') {
    const layout = user.medal?.custom?.customs?.[String(board.custom)]?.layout ?? [];
    return (layout as { id?: string; pos?: number[] }[]).filter((item) => typeof item?.id === 'string')
      .map((item) => ({ id: item.id!, x: Number.isFinite(item.pos?.[0]) ? item.pos![0] : null, y: Number.isFinite(item.pos?.[1]) ? item.pos![1] : null }));
  }
  return ((board.templateMedalList ?? []) as unknown[]).filter((id): id is string => typeof id === 'string').map((id) => ({ id, x: null, y: null }));
}

/** The other servers' stored records, or none for anything that is not them: each by its own
 *  server, and a record whose server is not its key left out. */
export function parseOtherAccounts(raw: string | null): Partial<Record<ServerId, AccountRecord>> {
  if (!raw) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const records: Partial<Record<ServerId, AccountRecord>> = {};
  for (const [server, stored] of Object.entries(value as Record<string, unknown>)) {
    const record = isServerId(server) ? parseAccount(JSON.stringify(stored)) : null;
    if (record && record.server === server) records[server] = record;
  }
  return records;
}

export function writeOtherAccounts(records: Partial<Record<ServerId, AccountRecord>>): void {
  try {
    if (Object.keys(records).length) window.localStorage?.setItem(OTHER_ACCOUNTS_KEY, JSON.stringify(records));
    else window.localStorage?.removeItem(OTHER_ACCOUNTS_KEY);
    window.dispatchEvent(new Event(ACCOUNT_EVENT));
  } catch {
    /* Private mode: nothing is kept anyway. */
  }
}

/** The other servers' records now, outside React. */
export function storedOtherAccounts(): Partial<Record<ServerId, AccountRecord>> {
  return otherSnapshot();
}

/**
 * Shows another server's stored record: it becomes the one every page reads, and the one shown
 * until now waits under its own server. Nothing changes for a server with no record. The
 * planner's operators and depot are not records of this store: they stay as the last import
 * wrote them.
 */
export function showAccount(server: ServerId): void {
  const shown = storedAccount(), others = { ...storedOtherAccounts() };
  const next = others[server];
  if (!next || shown?.server === server) return;
  delete others[server];
  if (shown) others[shown.server] = shown;
  writeOtherAccounts(others);
  writeAccount(next);
}

/** Forgets the shown record; another server's, if one is stored, is shown in its place. */
export function forgetShownAccount(): void {
  const others = { ...storedOtherAccounts() };
  const [next] = Object.values(others);
  if (next) delete others[next.server];
  writeOtherAccounts(others);
  writeAccount(next ?? null);
}

export function writeAccount(record: AccountRecord | null): void {
  try {
    if (record) window.localStorage?.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(record));
    else window.localStorage?.removeItem(ACCOUNT_STORAGE_KEY);
    window.dispatchEvent(new Event(ACCOUNT_EVENT));
  } catch {
    /* Private mode: the filters stay as they were. */
  }
}

// useSyncExternalStore needs the same object back while nothing changed.
let cachedRaw: string | null | undefined;
let cached: AccountRecord | null = null;
function snapshot(): AccountRecord | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage?.getItem(ACCOUNT_STORAGE_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parseAccount(raw);
  }
  return cached;
}
let cachedOtherRaw: string | null | undefined;
let cachedOthers: Partial<Record<ServerId, AccountRecord>> = {};
function otherSnapshot(): Partial<Record<ServerId, AccountRecord>> {
  let raw: string | null = null;
  try {
    raw = window.localStorage?.getItem(OTHER_ACCOUNTS_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw !== cachedOtherRaw) {
    cachedOtherRaw = raw;
    cachedOthers = parseOtherAccounts(raw);
  }
  return cachedOthers;
}
const NO_OTHERS: Partial<Record<ServerId, AccountRecord>> = {};
function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(ACCOUNT_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(ACCOUNT_EVENT, onChange);
  };
}

/** The stored record now, outside React (an import adds to its pull history). */
export const storedAccount = (): AccountRecord | null => snapshot();

/** The imported account, or null: always null on the server and in the first paint, so the
 *  markup matches; the stored record arrives right after. */
export function useAccount(): AccountRecord | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

/** The other servers' records: none on the server and in the first paint, as useAccount. */
export function useOtherAccounts(): Partial<Record<ServerId, AccountRecord>> {
  return useSyncExternalStore(subscribe, otherSnapshot, () => NO_OTHERS);
}

/** Owned, not owned, or every one: the filter the operator and skin lists share. */
export type OwnedFilter = 'all' | 'owned' | 'missing';
export const ownedFilter = (raw: string): OwnedFilter => (raw === 'owned' || raw === 'missing' ? raw : 'all');
