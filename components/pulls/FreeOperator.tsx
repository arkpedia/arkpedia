import dynamic from 'next/dynamic';
import Link from 'next/link';
import Image from '@/components/content/ContentImage';
import type { OperatorPreviewItem } from '@/components/operators/OperatorPreview';
import { freeRewardLabel, LOCKED_LABEL, welfareCardFacts, type FreeReward, type LockedReason } from '@/lib/pulls/freeRewards';
import { regionalDate } from '@/lib/time/regional';
import type { GameServer } from '@/lib/time/servers.mjs';

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

/** A welfare operator as a picture card (the icon edged in its rarity, as the site's operator
 *  tiles are; the name; the task; where it comes from, on a quieter line) that opens the
 *  operator's preview, and its event's page as a small link of its own beside it (a link
 *  inside the button would be invalid). Its text is the row's, by welfareCardFacts, wherever
 *  it is shown: the Reward Tracker's overview, and the Free rewards tab's Welfare operators,
 *  which passes `claim` for the row's tick (a real checkbox in the card's corner, named as
 *  the row; locked rows, the import's, checked and disabled, saying why). */
export function WelfareCard({ reward, operator, icon, server, now, onPreview, claim }: {
  reward: FreeReward; operator: FreeReward['rewards'][number]; icon: string | undefined;
  server: GameServer; now: number; onPreview: (item: OperatorPreviewItem) => void;
  claim?: { checked: boolean; lock: LockedReason | undefined; onChange: (claimed: boolean) => void };
}) {
  const preview = freeOperatorPreview(operator, icon);
  const { task, source, status } = welfareCardFacts(reward, now);
  const date = (at: number) => regionalDate(new Date(at).toISOString(), server);
  const lock = claim?.lock;
  return <li className={`free-op-welfare-card lift${claim ? ' has-claim' : ''}${claim?.checked ? ' is-claimed' : ''}`}>
    <button type="button" className="btn-bare free-op-welfare-open" aria-haspopup="dialog" aria-label={`${operator.name}: operator preview`} onClick={() => onPreview(preview)}>
      {icon ? <Image src={icon} width={52} height={52} alt="" className={`tier-${preview.rarity}`} /> : <span className={`free-op-welfare-blank tier-${preview.rarity}`} />}
      <span className="free-op-welfare-name">{operator.name}</span>
      {task && <span className="free-op-welfare-task">{task}</span>}
      <span className="free-op-welfare-source">{source}
        {status.kind === 'until' && <> · <span className="free-op-welfare-until">until {date(status.at)}</span></>}
        {status.kind === 'upcoming' && <> · <span className="free-op-welfare-until">opens {date(status.at)}</span></>}
      </span>
      {status.kind === 'closed' && <span className="free-op-welfare-note">No longer obtainable</span>}
      {lock && <span className="free-op-welfare-note">{LOCKED_LABEL[lock]}</span>}
    </button>
    {claim && <label className="check free-op-welfare-claim" title={lock ? `${LOCKED_LABEL[lock]} (from your import)` : 'Claimed'}>
      <input type="checkbox" aria-label={freeRewardLabel(reward)} checked={claim.checked} disabled={!!lock} onChange={event => claim.onChange(event.target.checked)} />
    </label>}
    {reward.href && <Link prefetch={false} href={reward.href} className="free-op-welfare-link">Event page</Link>}
  </li>;
}
