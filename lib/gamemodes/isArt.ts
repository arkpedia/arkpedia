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

/** A theme's home-screen key art (one picture, or the game's two halves side by side), an optional figure drawn over it, and its title logo where the game ships one as its own file. */
export interface IsKeyArt { art: string[]; figure?: string; logo?: string }
const KV = (topic: string, file: string) => `${IS_ART_ROOT}/topics/${topic}_update/entrykeyvisuals/${file}.webp`;
const KEY_ART: Record<string, { art: string[]; figure?: string; logo?: string }> = {
  rogue_1: { art: ['rogue_kv_1_2/rg1_mode_kv_bg1', 'rogue_kv_1_2/rg1_mode_kv_bg2'] },
  rogue_2: { art: ['rogue_kv_default/rg2_home_bg1', 'rogue_kv_default/rg2_home_bg2'], figure: 'rogue_kv_default/rg2_home_role' },
  rogue_3: { art: ['rogue_kv_default/rl3_home_kv_1_1', 'rogue_kv_default/rl3_home_kv_1_2'] },
  rogue_4: { art: ['rogue_kv_default/bg'] },
  rogue_5: { art: ['rogue_kv_default/bg'], logo: 'rogue_kv_default/title_main_solid' },
  rogue_6: { art: ['rogue_kv_default/bg'], logo: 'rogue_kv_default/main_tiltle' },
};
/** Key art for a theme, keeping only files the published catalogue lists; undefined when the picture itself is missing. */
export function isKeyArt(art: IsArt | undefined, topic: string): IsKeyArt | undefined {
  const entry = KEY_ART[topic];
  if (!art || !entry) return;
  const has = (file?: string) => (file && art.assets[KV(topic, file)] ? KV(topic, file) : undefined);
  const pictures = entry.art.map(has);
  if (pictures.some(path => !path)) return;
  return { art: pictures as string[], ...(has(entry.figure) ? { figure: has(entry.figure) } : {}), ...(has(entry.logo) ? { logo: has(entry.logo) } : {}) };
}
