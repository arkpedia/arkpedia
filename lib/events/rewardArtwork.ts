import type { Skin } from '@/lib/skins/skinTypes';
const key = (value: string) => value.normalize('NFKC').replace(/[\s/–-]+/g, '').toLowerCase();
/** Reward lists use both "Operator / Outfit" and plain outfit names. */
export function rewardSkin(name: string, skins: readonly Skin[], icon?: string | null): Skin | undefined {
  const names = new Set([name, decodeURIComponent(icon?.split('/').pop() ?? '').replace(/\.webp$/, '')].filter(Boolean).map(key));
  return skins.find(skin => [skin.name, `${skin.model ?? ''} / ${skin.name}`].some(alias => names.has(key(alias))));
}
