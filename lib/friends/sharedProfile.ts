import { parseFriendFile, type FriendFile } from '@/lib/account/friendFile';
import type { CommunityChoices, SupportPlayer } from '@/lib/community/model';

export const FRIEND_LINKS_KEY = 'arkpediaFriendLinks:v1';
export const PUBLIC_PROFILE_MAX_BYTES = 500_000;
export const isFriendLinkId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export interface SharedFriend { player: SupportPlayer; profile: FriendFile | null; collectionShared: boolean; profileUpdatedAt: string | null }
export type SharedFriendSummary = Omit<SharedFriend, 'profile'>;
export interface ProfileSharingState { owner: string; revision: number; enabled: boolean; communityRevision: number; id: string | null; server: string | null; importedAt: string | null; accountImportedAt: string | null; choices: CommunityChoices }

/** Store references, never a cached copy of another player's public collection. */
export function parseFriendLinks(raw: string | null): string[] {
  if (!raw || raw.length > 2500) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? [...new Set(value.filter(isFriendLinkId))].slice(0, 50) : [];
  } catch { return []; }
}

/** Public links have a narrower projection than deliberately shared manual files. */
export function publicFriendFile(value: unknown): FriendFile {
  const raw = JSON.stringify(value);
  if (!raw || new TextEncoder().encode(raw).length > PUBLIC_PROFILE_MAX_BYTES) throw Error('Invalid public profile size.');
  const file = parseFriendFile(raw), account = file.account, profile = account.profile;
  if (account.operators.length > 1000 || account.skins.length > 3000) throw Error('Invalid public collection size.');
  const owned = new Set(account.operators), skins = new Set(account.skins);
  return {
    kind: file.kind, version: 1, exportedAt: file.exportedAt, roster: file.roster,
    account: {
      version: 1, server: account.server, importedAt: account.importedAt, doctor: account.doctor,
      operators: account.operators, skins: account.skins, cleared: [],
      ...(account.outfits ? { outfits: Object.fromEntries(Object.entries(account.outfits).filter(([name, skin]) => owned.has(name) && skins.has(skin))) } : {}),
      ...(profile ? { profile: {
        level: profile.level, registeredAt: null, bio: null, uid: null,
        secretary: profile.secretary, avatar: profile.avatar, avatarType: profile.avatarType,
        nameCard: profile.nameCard, nameCardVariant: profile.nameCardVariant, secretarySkin: profile.secretarySkin,
        supports: profile.supports?.filter(unit => owned.has(unit.name)),
      } } : {}),
    },
  };
}
