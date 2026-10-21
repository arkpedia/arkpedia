import dynamic from 'next/dynamic';
import Link from 'next/link';
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

/** A welfare operator still to claim, as the Reward Tracker's overview lists it: a picture
 *  card (the icon edged in its rarity, as the site's operator tiles are; the name; where it
 *  comes from, on a quieter line) that opens the operator's preview, and its event's page as
 *  a small link of its own beside it (a link inside the button would be invalid). */
export function WelfareCard({ item, icon, source, until, href, onPreview }: {
  item: FreeReward['rewards'][number]; icon: string | undefined; source: string; until: string | undefined; href: string | undefined; onPreview: (item: OperatorPreviewItem) => void;
}) {
  const preview = freeOperatorPreview(item, icon);
  return <li className="free-op-welfare-card lift">
    <button type="button" className="btn-bare free-op-welfare-open" aria-haspopup="dialog" aria-label={`${item.name}: operator preview`} onClick={() => onPreview(preview)}>
      {icon ? <Image src={icon} width={52} height={52} alt="" className={`tier-${preview.rarity}`} /> : <span className={`free-op-welfare-blank tier-${preview.rarity}`} />}
      <span className="free-op-welfare-name">{item.name}</span>
      <span className="free-op-welfare-source">{source}{until && <> · <span className="free-op-welfare-until">until {until}</span></>}</span>
    </button>
    {href && <Link prefetch={false} href={href} className="free-op-welfare-link">Event page</Link>}
  </li>;
}
