import { getSkinArtworkSources } from '@/lib/assets/skinArtwork';
import type { TierItem } from '@/lib/tier-list/catalogue';

/** A full illustration (promotion or outfit art) is cropped to a square from its top edge,
 *  where the figure's head and shoulders are; an icon is already square. */
export const cropsFromTop = (item: Pick<TierItem, 'kind'>) => item.kind === 'e0' || item.kind === 'e2' || item.kind === 'skins';

/** The picture a tile draws: an illustration's 320px rendition (the full file is a megabyte
 *  or more, and a pool holds hundreds), an icon as it is. */
export function tileImage(item: Pick<TierItem, 'kind' | 'image'>): string {
  return cropsFromTop(item) ? getSkinArtworkSources(item.image)?.webp[320] ?? item.image : item.image;
}
