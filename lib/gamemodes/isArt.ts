/** Native icon identities, scoped to the theme and preferring Global artwork. */
export interface IsArt { assets: Record<string, { sourceRegion: string }> }
const indexes = new WeakMap<IsArt, Map<string, string[]>>();
export const IS_ART_ROOT = 'content-art/integrated-strategies';
export function isIcon(art: IsArt | undefined, topic: string, id: unknown): string | undefined {
  if (!art || typeof id !== 'string' || !id) return;
  let index = indexes.get(art);
  if (!index) {
    index = new Map();
    for (const path of Object.keys(art.assets)) {
      const key = path.split('/').at(-1)!.replace(/\.webp$/, '').toLowerCase();
      index.set(key, [...(index.get(key) ?? []), path]);
    }
    indexes.set(art, index);
  }
  return (index.get(id.toLowerCase()) ?? []).filter(path => {
    const scope = path.match(/\/topics\/(rogue_\d+)(?:_update)?\//)?.[1];
    return !scope || scope === topic;
  }).sort((a, b) => Number(art.assets[b].sourceRegion === 'en') - Number(art.assets[a].sourceRegion === 'en') || a.localeCompare(b))[0];
}
export function isNodeIcon(art: IsArt | undefined, name: string): string | undefined {
  const path = `${IS_ART_ROOT}/choicepic/${name}.webp`;
  return art?.assets[path] ? path : undefined;
}
