import { parseAccount, type AccountRecord, type AccountProfile } from './accountStore';
import { parseRosterExport, type Roster } from '@/lib/planner/roster';
import { MAX_IMPORT_BYTES, isSafeKey } from '@/lib/planner/untrusted';
import { parseMedalCollection } from './medals';

export const FRIEND_STORAGE_KEY = 'arkpediaFriend';
export const FRIEND_KIND = 'arkpedia-friend';
export interface FriendFile { kind: typeof FRIEND_KIND; version: 1; exportedAt: string; account: AccountRecord; roster: Roster }
const text = (value: unknown, limit = 500): string | null => typeof value === 'string' && value.length <= limit ? value : null;
const id = (value: unknown) => typeof value === 'string' && /^[\w@#+-]{1,100}$/.test(value) ? value : null;
const date = (value: unknown) => typeof value === 'string' && value.length < 40 && Number.isFinite(Date.parse(value)) ? value : null;
const integer = (value: unknown, max: number, fallback = 0) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max ? value : fallback;

/** Explicit fields only: the share never carries a wallet, pull history, depot or login. */
function publicProfile(profile: AccountProfile | undefined): AccountProfile | undefined {
  if (!profile) return undefined;
  const medalCollection = parseMedalCollection(profile.medalCollection);
  return {
    level: profile.level === null ? null : integer(profile.level, 120), registeredAt: date(profile.registeredAt),
    secretary: text(profile.secretary, 200), bio: text(profile.bio), uid: text(profile.uid, 40),
    avatar: id(profile.avatar), avatarType: profile.avatarType, nameCard: id(profile.nameCard),
    nameCardVariant: integer(profile.nameCardVariant, 19), secretarySkin: id(profile.secretarySkin),
    ...(profile.hired === undefined ? {} : { hired: integer(profile.hired, 5000) }),
    ...(profile.panels ? { panels: profile.panels } : {}), ...(profile.modules ? { modules: profile.modules } : {}),
    supports: (profile.supports ?? []).slice(0, 3).map(unit => ({
      name: text(unit.name, 200) ?? 'Unknown operator', rarity: integer(unit.rarity, 6) || null,
      level: integer(unit.level, 90, 1), elite: integer(unit.elite, 2), potential: integer(unit.potential, 6, 1),
      skill: integer(unit.skill, 3) || null, allMastered: unit.allMastered === true,
      module: id(unit.module), skillId: id(unit.skillId), skin: id(unit.skin),
    })),
    medals: (profile.medals ?? []).filter(medal => id(medal.id)).slice(0, 64).map(medal => ({
      id: medal.id, x: typeof medal.x === 'number' && Number.isFinite(medal.x) && Math.abs(medal.x) <= 1000 ? medal.x : null,
      y: typeof medal.y === 'number' && Number.isFinite(medal.y) && Math.abs(medal.y) <= 1000 ? medal.y : null,
    })),
    ...(medalCollection !== undefined ? { medalCollection } : {}),
  };
}

function publicAccount(account: AccountRecord): AccountRecord {
  const profile = publicProfile(account.profile);
  return {
    version: 1, server: account.server, importedAt: account.importedAt, doctor: text(account.doctor, 200),
    operators: [...new Set(account.operators)].filter(name => name.length <= 200 && isSafeKey(name)),
    skins: [...new Set(account.skins)].filter(skin => id(skin)),
    cleared: account.cleared.filter(stage => id(stage)),
    ...(account.annihilation ? { annihilation: account.annihilation.filter(stage => id(stage)) } : {}),
    ...(account.outfits ? { outfits: Object.fromEntries(Object.entries(account.outfits).filter(([name, skin]) => name.length <= 200 && isSafeKey(name) && id(skin))) } : {}),
    ...(profile ? { profile } : {}),
  };
}

/** Only owned operators are shared, never an unowned operator from a planner goal. */
export function makeFriendFile(account: AccountRecord, roster: Roster, now = new Date()): FriendFile {
  const shared = publicAccount(account);
  const owned = new Set(shared.operators);
  const builds = parseRosterExport(JSON.stringify(roster));
  if (!builds) throw new Error('The operator build data could not be read.');
  return { kind: FRIEND_KIND, version: 1, exportedAt: now.toISOString(), account: shared,
    roster: Object.fromEntries(Object.entries(builds).filter(([name]) => owned.has(name))) };
}

export function parseFriendFile(raw: string): FriendFile {
  if (raw.length > MAX_IMPORT_BYTES) throw new Error('Choose a friend file smaller than 4 MB.');
  let value: Partial<FriendFile>;
  try { value = JSON.parse(raw); } catch { throw new Error('That file is not valid JSON.'); }
  if (!value || value.kind !== FRIEND_KIND || value.version !== 1) throw new Error('Choose an account exported from the Friends page.');
  const account = parseAccount(JSON.stringify(value.account));
  const roster = parseRosterExport(JSON.stringify(value.roster));
  if (!account || !date(account.importedAt) || !date(value.exportedAt) || !roster) throw new Error('That friend file is incomplete or damaged.');
  return makeFriendFile(account, roster, new Date(value.exportedAt!));
}

/** Older account records share the planner's builds only if that server was imported last. */
export function shareableRoster(account: AccountRecord, others: readonly AccountRecord[], planner: Roster): Roster {
  if (account.operatorBuilds) return account.operatorBuilds;
  return others.some(other => other.importedAt > account.importedAt) ? {} : planner;
}

export function friendFilename(account: AccountRecord): string {
  const name = (account.doctor ?? 'doctor').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80);
  return `arkpedia-friend-${name}-${account.server}.json`;
}
