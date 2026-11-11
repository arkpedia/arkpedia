import { useCallback, useMemo, useState } from 'react';
import SegmentedControl from '@/components/ui/SegmentedControl';
import InfoPopover from '@/components/ui/InfoPopover';
import { welfarePriority } from '@/lib/pulls/welfarePriority';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import { freeRewardAvailable, freeRewardLabel, isOperatorReward, LOCKED_LABEL, type FreeReward, type LockedReason } from '@/lib/pulls/freeRewards';
import type { OperatorPreviewItem } from '@/components/operators/OperatorPreview';
import FreeRewardItem from './FreeRewardItem';
import { FreeOperatorButton, FreeOperatorPreview, WelfareCard } from './FreeOperator';
import { useHeightFloor } from '@/components/ui/useHeightFloor';
import { regionalDate } from '@/lib/time/regional';
import type { GameServer } from '@/lib/time/servers.mjs';

const GROUP_ORDER = ['Welfare operators', 'Beginner rewards', 'Event sign-in and gifts', 'Monthly sign-in', 'Pinboard missions', 'Main and side missions', 'Free level-up packs', 'Sign-in milestones'];

/** Free items stay items: a selector or Kernel permit cannot buy an ordinary banner pull.
 *  `locked`: rows the import settles while it lasts, and why (lib/pulls/freeRewards.ts: a
 *  welfare operator already in the roster, rosterClaimedWelfare; a beginner row the save
 *  records as received, importClaimedBeginner), shown claimed and not for unticking. */
export default function FreeRewards({ rewards, icons, done, locked, onKeys, now, server }: { rewards: FreeReward[]; icons: Record<string, string>; done: ReadonlySet<string>; locked: ReadonlyMap<string, LockedReason>; onKeys: (keys: Set<string>) => void; now: number; server: GameServer }) {
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<'all' | 'unclaimed' | 'claimed' | 'unknown'>('unclaimed');
  const [upcoming, setUpcoming] = useState(false);
  const [open, setOpen] = useState('Beginner rewards');
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<OperatorPreviewItem | null>(null);
  const closePreview = useCallback(() => setPreview(null), []);
  /* "All claimed", or a tick, under the Unclaimed filter takes rows out of the open group: the
     groups hold the reader's place (the Anti-Page Jump rule). A new search or filter is a new
     list and lets the space go. */
  const floor = useHeightFloor(`${query}|${show}|${upcoming}|${open}`);
  const groups = useMemo(() => {
    const groups = new Map<string, FreeReward[]>();
    for (const reward of rewards) {
      if (reward.endAt && now >= reward.endAt) continue;
      if (!upcoming && !freeRewardAvailable(reward, now)) continue;
      const unknown = reward.claimUnknown && !done.has(reward.id);
      if (show === 'unknown' ? !unknown : show !== 'all' && (unknown || (show === 'claimed') !== done.has(reward.id))) continue;
      if (query && !`${freeRewardLabel(reward)} ${reward.name} ${reward.event ?? ''} ${reward.rewards.map(item => item.name).join(' ')}`.toLowerCase().includes(query.toLowerCase())) continue;
      const list = groups.get(reward.group) ?? []; list.push(reward); groups.set(reward.group, list);
    }
    return groups;
  }, [rewards, done, upcoming, now, show, query]);
  function claim(ids: string[], claimed: boolean) {
    const next = new Set(done);
    ids.forEach(id => claimed ? next.add(id) : next.delete(id)); onKeys(next);
  }
  return <section className="op-section free-rewards" aria-labelledby="free-rewards-title">
    <h2 id="free-rewards-title">Free rewards</h2>
    <p className="hint">Imports check recorded mission, sign-in and free level-up pack claims. Rewards without a claim record stay manually tracked, and your manual marks are kept; beginner rewards your import settles are locked. Hover or tap items for names.</p>
    <div className="free-rewards-filters">
      <input type="search" aria-label="Search free rewards" placeholder="Search rewards or tickets" value={query} onChange={event => { setQuery(event.target.value); setLimits({}); }} />
      <SegmentedControl label="Free rewards status" value={show} onChange={value => { setShow(value); setLimits({}); }} options={[{ value: 'all', label: 'All' }, { value: 'unclaimed', label: 'Unclaimed' }, { value: 'claimed', label: 'Claimed' }, { value: 'unknown', label: 'Needs confirmation' }]} />
      <label className="check"><input type="checkbox" checked={upcoming} onChange={event => { setUpcoming(event.target.checked); setLimits({}); }} />Include upcoming rewards</label>
    </div>
    {rewards.some(reward => reward.claimUnknown && !done.has(reward.id)) && <p className="hint">New Doctor mail needs confirmation. <InfoPopover label="About New Doctor mail"><p>The one-time 3,800 Orundum supply sent when you started playing. An import can check it only while the game retains the mail. If you already received it, mark it claimed here.</p></InfoPopover> <button type="button" className="btn-bare" onClick={() => setShow('unknown')}>Review unknown claims</button></p>}
    {!groups.size && <p className="hint">No matching rewards.</p>}
    <div ref={floor.ref}>{[...groups].sort(([a], [b]) => (GROUP_ORDER.indexOf(a) < 0 ? 99 : GROUP_ORDER.indexOf(a)) - (GROUP_ORDER.indexOf(b) < 0 ? 99 : GROUP_ORDER.indexOf(b))).map(([group, list]) => {
      const limit = limits[group] ?? 30;
      const rows = list.slice(0, limit);
      /* Welfare operators as the overview shows them: one card per row, its tick in the corner. */
      const cards = group === 'Welfare operators' ? rows.flatMap(reward => { const operator = reward.rewards.find(isOperatorReward); return operator ? [{ reward, operator }] : []; }) : [];
      const plain = cards.length ? rows.filter(reward => !reward.rewards.some(isOperatorReward)) : rows;
      return <details className="pulls-disclosure" key={group} open={open === group}>
        <summary onClick={event => { event.preventDefault(); setOpen(open === group ? '' : group); }}>{group}</summary>
        {open === group && <>
          <div className="pulls-eventlist-acts"><button type="button" className="ghost btn-sm" onClick={() => claim(list.map(item => item.id), true)}>All claimed</button><button type="button" className="ghost btn-sm" onClick={() => claim(list.map(item => item.id).filter(id => !locked.has(id)), false)}>None claimed</button></div>
          {cards.length > 0 && <ul className="free-op-welfare-list" aria-label={`${group}: claimed`}>{cards.map(({ reward, operator }) =>
            <WelfareCard key={reward.id} reward={reward} operator={operator} icon={icons[operator.id]} priority={welfarePriority(operator.name)} server={server} now={now} onPreview={setPreview}
              claim={{ checked: done.has(reward.id), lock: locked.get(reward.id), onChange: claimed => claim([reward.id], claimed) }} />)}</ul>}
          {plain.length > 0 && <ul className="pulls-past-list free-reward-list" aria-label={`${group}: claimed`}>{plain.map(reward => { const lock = locked.get(reward.id); return <li className={`free-reward-row${done.has(reward.id) ? ' is-claimed' : ''}`} key={reward.id}>
            <label className="check" title={lock ? `${LOCKED_LABEL[lock]} (from your import)` : undefined}><input type="checkbox" checked={done.has(reward.id)} disabled={!!lock} onChange={event => claim([reward.id], event.target.checked)} /><span>{freeRewardLabel(reward)}{reward.claimUnknown && !done.has(reward.id) && <small> · Claim status unavailable; excluded from totals.</small>}</span></label>
            <div className="free-reward-content"><div className="free-reward-items">{reward.rewards.map(item => isOperatorReward(item) ? <FreeOperatorButton key={item.id} item={item} icon={icons[item.id]} onPreview={setPreview} /> : <FreeRewardItem key={item.id} item={item} icon={icons[item.id]} />)}{!reward.rewards.length && <small>Free pack</small>}</div>{(reward.startAt || reward.href || lock) && <div className="free-reward-meta">{reward.event && <small>From {reward.event}</small>}{reward.startAt && <small>{now < reward.startAt ? 'Upcoming' : reward.endAt ? `Until ${regionalDate(new Date(reward.endAt).toISOString(), server)}` : 'Available'}</small>}{lock && <small>{LOCKED_LABEL[lock]}</small>}{reward.href && <a href={reward.href}>Details →</a>}</div>}</div>
          </li>; })}</ul>}
          <LoadOnScroll shown={Math.min(limit, list.length)} total={list.length} onMore={() => setLimits(value => ({ ...value, [group]: limit + 30 }))} />
        </>}
      </details>;
    })}{floor.spacer}</div>
    {preview && <FreeOperatorPreview key={preview.name} item={preview} onClose={closePreview} nativeModal />}
  </section>;
}
