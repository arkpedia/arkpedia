/**
 * An outfit's portrait: the game's own crop of an operator in that outfit, which its profile
 * card shows support units in. arkpedia-image-assets publishes them to profile-portraits/
 * under the skin id's own spelling (scripts/sync_profile_art.py, portrait_name): "@" and "#"
 * are "_", and Amiya's "1+" is "1p". Change one and the other with it; both repositories'
 * tests pin the same three examples.
 */
export function portraitPath(skinId: string): string {
  return `/profile-portraits/${skinId.replace(/[@#]/g, '_').replace(/\+/g, 'p')}.webp`;
}
