import dynamic from 'next/dynamic';
import Image from '@/components/content/ContentImage';
import type { OperatorPreviewItem } from '@/components/operators/OperatorPreview';
import type { FreeReward } from '@/lib/pulls/freeRewards';

/* The site's operator quick preview, as recruitment opens it: loaded when first opened. */
export const FreeOperatorPreview = dynamic(() => import('@/components/operators/OperatorPreview').then(module => module.OperatorPreview), { ssr: false });

const STARS = ['one', 'two', 'three', 'four', 'five', 'six'];
/** What the preview needs of a free operator. Its rarity is the release's, or for one built
 *  before rarity was kept, the folder its icon is in (rewardIcons: `/five-star-icons/`). */
export function freeOperatorPreview(item: FreeReward['rewards'][number], icon: string | undefined): OperatorPreviewItem {
  const folder = icon ? STARS.indexOf(/^\/(\w+)-star-icons\//.exec(icon)?.[1] ?? '') + 1 : 0;
  return { name: item.name, icon: icon ?? '', rarity: item.rarity ?? (folder || 6) };
}

/** A free operator, its icon and name: a button that opens its preview. */
export function FreeOperatorButton({ item, icon, onPreview }: { item: FreeReward['rewards'][number]; icon?: string; onPreview: (item: OperatorPreviewItem) => void }) {
  return <button type="button" className="btn-bare free-operator" aria-haspopup="dialog" aria-label={`${item.name}: operator preview`} onClick={() => onPreview(freeOperatorPreview(item, icon))}>
    {icon && <Image src={icon} width={36} height={36} alt="" />}<span>{item.name}</span>
  </button>;
}
