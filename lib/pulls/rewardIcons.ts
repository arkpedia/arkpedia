import revisions from '@/data/assets/revisions.json';
import type { ContentRelease } from '@/lib/content/types';
import itemIcons from '@/data/item-icons.json';
import skins from '@/data/skins.json';
import { publicFileExists, publicFiles } from '@/lib/assets/publicAssets';
import { rewardIconPath } from '@/lib/events/rewardIcons';
import { findSkinIconPath } from '@/lib/skins/skinIconLookup';
import type { FreeReward } from './freeRewards';

/** Server projection: only published art paths follow the free rewards into the page. */
export function freeRewardIcons(rewards: FreeReward[]): Record<string, string> {
  const icons: Record<string, string> = {};
  const files = itemIcons as Record<string, string>;
  const outfits = new Map(skins.map(skin => [skin.skinId, skin.name]));
  for (const reward of rewards) for (const item of reward.rewards) {
    if (icons[item.id]) continue;
    const name = outfits.get(item.id) ?? item.name;
    let icon = publicFileExists(`/material-icons/${item.id}.webp`) ? `/material-icons/${item.id}.webp` : rewardIconPath({ id: item.id, name: item.id.startsWith('furniM_') ? item.id : name, type: outfits.has(item.id) ? 'skin' : 'item' }, findSkinIconPath, publicFileExists);
    if (!icon && files[item.id] && publicFileExists(`/item-icons/${files[item.id]}`)) icon = `/item-icons/${files[item.id]}`;
    if (!icon && item.id.startsWith('char_')) {
      for (const word of ['one', 'two', 'three', 'four', 'five', 'six']) {
        const folder = `${word}-star-icons`;
        const file = publicFiles(folder).find(file => file === `${name} - Base.webp`);
        if (file) { icon = `/${folder}/${file}`; break; }
      }
    }
    if (icon) icons[item.id] = icon;
  }
  return icons;
}

/** An older page release has no icon projection. Its new bundled icons must use
 * the bundled asset pin, where they were published, until a content release catches up. */
export function rewardTrackerArt(rewards: FreeReward[], icons: Record<string, string> | undefined, release?: ContentRelease) {
  if (icons) return { rewardIcons: icons, ...(release ? { __contentRelease: release } : {}) };
  return { rewardIcons: freeRewardIcons(rewards), ...(release ? { __contentRelease: { ...release, assets: { ...release.assets, 'arkpedia-image-assets': revisions['arkpedia-image-assets'] } } } : {}) };
}
