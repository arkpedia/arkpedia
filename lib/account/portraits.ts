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
export function profileArtPath(folder: 'profile-avatars' | 'profile-medals' | 'profile-namecards', name: string): string {
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
