/**
 * An outfit's portrait: the game's own crop of an operator in that outfit, which its profile
 * card shows support units in. arkpedia-image-assets publishes them to profile-portraits/
 * under the skin id's own spelling (scripts/sync_profile_art.py, portrait_name): "@" and "#"
 * are "_", and Amiya's "1+" is "1p". Change one and the other with it; both repositories'
 * tests pin the same three examples.
 *
 * In lower case, as every profile-art file is: the client's asset paths are lower case
 * ("..._ambiencesynesthesia#7") where its ids are not ("...@ambienceSynesthesia#7"), and the
 * asset host's paths are case-sensitive.
 */
export function portraitPath(skinId: string): string {
  return `/profile-portraits/${skinId.replace(/[@#]/g, '_').replace(/\+/g, 'p').toLowerCase()}.webp`;
}

/** Any other profile art named by a game id (an avatar, a medal, a business card's
 *  "<id>-bg"), in lower case for the same reason. */
export function profileArtPath(folder: 'profile-avatars' | 'profile-medals' | 'profile-namecards' | 'profile-modules' | 'profile-skills', name: string): string {
  return `/${folder}/${name.toLowerCase()}.webp`;
}

const RARITY_WORDS: Record<number, string> = { 6: 'six', 5: 'five', 4: 'four', 3: 'three', 2: 'two', 1: 'one' };

/**
 * The assistant's illustration in the outfit it wears (status.secretarySkinId), from the skin
 * art the site already has: an outfit ("char_2014_nian@spring#1") by the catalogue's own
 * image for it (`outfitArt`, skin id to path), the default art ("char_2014_nian#1",
 * "...#2" once promoted) by the operator's name as the art folders file it. Null when the
 * id names neither.
 */
export function assistantArtPath(skinId: string, chars: Record<string, { name: string; rarity?: number }>, outfitArt: ReadonlyMap<string, string>): string | null {
  if (skinId.includes('@')) return outfitArt.get(skinId) ?? null;
  const [charId, form = ''] = skinId.split('#');
  const char = chars[charId];
  if (!char?.rarity || !RARITY_WORDS[char.rarity]) return null;
  return `/${RARITY_WORDS[char.rarity]}-star-skins/${char.name.replace(/[\\/*?:"<>|]/g, '').trim()} - ${form.startsWith('2') ? 'Elite 2' : 'Base'}.webp`;
}

/** A module's type mark (arkpedia-image-assets' profile-modules), by its equipment id. */
export function moduleMarkPath(equipId: string, moduleTypes: Record<string, string> | undefined): string | null {
  const type = moduleTypes?.[equipId];
  return type ? profileArtPath('profile-modules', type) : null;
}

/** A skill's icon (profile-skills): its own id, or the shared icon it uses, a bracketed index
 *  written as a suffix ("skcom_enchant[1]" -> "skcom_enchant_1"), as the sync publishes it. */
export function skillIconPath(skillId: string, skillIcons: Record<string, string> | undefined): string {
  return profileArtPath('profile-skills', (skillIcons?.[skillId] ?? skillId).replace(/\[(\d+)\]/g, '_$1'));
}

/** The square icon of the assistant in the outfit it wears. The rarity icons folder files every
 *  icon as "<operator> - <outfit>": an outfit ("char_1019_siege2@epoque#50") by its name in the
 *  catalogue (`outfitNames`, skin id to name: "Vina Victoria - Glorious Path"), the default art
 *  as "Base" or, once promoted ("#2"), "Elite 2". Not from the outfit's illustration path: most of
 *  those are filed by the brand ("/skin-images/EPOQUE - Glorious Path.webp"). Null when the id
 *  names neither. */
export function assistantIconPath(skinId: string, chars: Record<string, { name: string; rarity?: number }>, outfitNames: ReadonlyMap<string, string>): string | null {
  const outfitAt = skinId.indexOf('@');
  const charId = (outfitAt >= 0 ? skinId.slice(0, outfitAt) : skinId).split('#')[0];
  const form = outfitAt >= 0 ? '' : skinId.split('#')[1] ?? '';
  const char = chars[charId];
  if (!char?.rarity || !RARITY_WORDS[char.rarity]) return null;
  const outfit = skinId.includes('@') ? outfitNames.get(skinId) : form.startsWith('2') ? 'Elite 2' : 'Base';
  if (!outfit) return null;
  const file = (name: string) => name.replace(/[\\/*?:"<>|]/g, '').trim();
  return `/${RARITY_WORDS[char.rarity]}-star-icons/${file(char.name)} - ${file(outfit)}.webp`;
}

/** The game's "Assistant Operator" avatar (display_meta_table's ASSISTANT type): no picture of
 *  its own, it shows whoever is the assistant, in the outfit they wear. */
export const ASSISTANT_AVATAR = 'avatar_ass_01';

/** The card's avatar: the account's own (profile-avatars), or for the Assistant Operator one the
 *  assistant's icon; null when there is nothing to draw. */
export function avatarPath(profile: { avatar?: string | null; secretarySkin?: string | null }, chars: Record<string, { name: string; rarity?: number }>, outfitNames: ReadonlyMap<string, string>): string | null {
  if (!profile.avatar) return null;
  if (profile.avatar !== ASSISTANT_AVATAR) return profileArtPath('profile-avatars', profile.avatar);
  return profile.secretarySkin ? assistantIconPath(profile.secretarySkin, chars, outfitNames) : null;
}
