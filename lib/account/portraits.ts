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
