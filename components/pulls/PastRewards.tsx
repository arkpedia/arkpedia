import { paradoxAvailability, stageRewardSanity } from '@/lib/pulls/rewardOverview';
import type { Roster } from '@/lib/planner/roster';
import Link from 'next/link';
import { RewardAmount } from './RewardAmount';
import { useLayoutEffect, useRef, useState } from 'react';
import SegmentedControl from '@/components/ui/SegmentedControl';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import type { BacklogSources } from '@/lib/pulls/pulls';
import { formatDayMonthYear, formatNumber } from '@/lib/pulls/format';

type Show = 'all' | 'unclaimed' | 'claimed';
const SHOW = [
  { value: 'all', label: 'All' },
  { value: 'unclaimed', label: 'Unclaimed' },
  { value: 'claimed', label: 'Claimed' },
] as const;

interface Item { id: string; name: string; amount: number; stages?: string[]; stageCodes?: string[]; certs?: number; operatorId?: string; unlock?: { elite: number; level: number } }

/**
 * The Past events popup's contents (pages/pulls.tsx): what is left of the back catalogue,
 * group by group, each item a tick the reader can always change. An import ticks them once
 * (the page's ticksFrom); after that they are the reader's, for an import that has aged or a
 * what-if. `backlog` is what each unticked item still pays (unclaimedBacklog: what the import
 * left of it); `cleared` is the import's cleared stages, which name the stages left when an
 * item is opened. Whether any of it counts toward the forecast is the Include checkbox on
 * the frame that opens this. `dropped` is how many stages of each chapter and event the
 * Reward Tracker's toggles left out (excludeStageKinds), already gone from `backlog`: an item
 * they leave nothing of is no longer still to claim, so Unclaimed does not list it.
 */
export function PastRewards({ backlog, dropped, doneKeys, doneEvents, annihilationDone, onKeys, onEvents, onAnnihilation, imported, cleared, operatorBuilds, layout }: {
  backlog: BacklogSources;
  dropped: Readonly<Record<string, number>>;
  doneKeys: Set<string>; doneEvents: Set<string>; annihilationDone: boolean;
  onKeys: (keys: Set<string>) => void; onEvents: (keys: Set<string>) => void; onAnnihilation: (done: boolean) => void;
  imported: { at: string } | null;
  cleared: ReadonlySet<string> | null;
  /** 'popup': the Pull Planner's dialog, one group open at a time in a scrolling body. 'page':
   *  the Reward Tracker, every group a section of the page. */
  layout: 'popup' | 'page';
  operatorBuilds?: Roster;
}) {
  const [open, setOpen] = useState('story');
  const [category, setCategory] = useState('story');
  const [limits, setLimits] = useState<Record<string, number>>({});
  /* With an import the list opens on what is left to claim, without one on everything (there
     is nothing ticked to hide yet). The account loads after the first paint, so the default
     follows it until the reader picks a filter; their pick then stays. */
  const [picked, setPicked] = useState<Show | null>(null);
  const show: Show = picked ?? (imported ? 'unclaimed' : 'all');
  const [detail, setDetail] = useState<string | null>(null);
  const groups: { id: string; name: string; unit: string; items: Item[] }[] = [
    { id: 'story', name: 'Main story', unit: 'OP', items: backlog.chapters.map((c) => ({ id: c.id, name: `${c.label} · ${c.name}`, amount: c.op, stages: c.stages, stageCodes: c.stageCodes })) },
    // By release date, oldest first, as the chapters and the Annihilation maps are listed.
    { id: 'events', name: 'Events', unit: 'OP', items: [...backlog.playable].sort((a, b) => (a.start || '9999').localeCompare(b.start || '9999'))
      .map((e) => ({ id: e.id, name: e.name, amount: e.op, stages: e.stages, stageCodes: e.stageCodes })) },
    { id: 'annihilation', name: 'Annihilation', unit: 'Orundum', items: backlog.annihilation },
    { id: 'resources', name: 'Resource stages', unit: 'OP', items: backlog.resources },
    { id: 'paradox', name: 'Paradox Simulations', unit: 'Orundum', items: [...(backlog.paradox ?? [])].sort((a, b) => Number(paradoxAvailability(b, operatorBuilds).ready === true) - Number(paradoxAvailability(a, operatorBuilds).ready === true) || a.name.localeCompare(b.name)) },
  ];
  const complete = (group: string, id: string) => group === 'events' ? doneEvents.has(id) : group === 'annihilation' && annihilationDone || group === 'resources' && doneKeys.has('daily') || doneKeys.has(id);
  const setCompleted = (group: typeof groups[number], ids: string[], done: boolean) => {
    const next = new Set(group.id === 'events' ? doneEvents : doneKeys);
    // Expand old all-or-nothing saves only when the user edits this category.
    if (group.id === 'annihilation' && annihilationDone) { group.items.forEach((item) => next.add(item.id)); onAnnihilation(false); }
    if (group.id === 'resources' && next.has('daily')) { group.items.forEach((item) => next.add(item.id)); next.delete('daily'); }
    ids.forEach((id) => (done ? next.add(id) : next.delete(id)));
    (group.id === 'events' ? onEvents : onKeys)(next);
  };
  const leftOut = (item: Item) => !item.amount && !!dropped[item.id];
  const shown = (group: string, item: Item) => show === 'all' || (show === 'claimed' ? complete(group, item.id) : !complete(group, item.id) && !leftOut(item));
  /* What opening an item says: every stage claimed, or the ones left by their codes. Without
     an import, or for a stage list the release does not name, its whole list. */
  const stagesLeft = (group: string, item: Item) => {
    if (complete(group, item.id)) return <p className="hint pulls-past-detail">Everything is claimed.</p>;
    const skipped = dropped[item.id] ? ` ${dropped[item.id]} more left out by your stage filters.` : '';
    if (leftOut(item)) return <p className="hint pulls-past-detail">Only stages your filters leave out are left.{skipped}</p>;
    const codes = item.stageCodes;
    if (!item.stages || !codes || codes.length !== item.stages.length) return <p className="hint pulls-past-detail">The stages are not listed for this one yet.</p>;
    const left = cleared ? codes.filter((_, index) => !cleared.has(item.stages![index])) : codes;
    if (cleared && !left.length) return <p className="hint pulls-past-detail">Every stage is cleared in your import; untick it only to count it anyway.</p>;
    return <p className="hint pulls-past-detail">{cleared ? 'Not cleared' : 'Its Originite Prime stages'} ({left.length}): {left.join(', ')}.{skipped}</p>;
  };
  /* On the page, opening an item adds a line and closing it takes the line away: the list holds
     the tallest height it has had, so closing one never shortens the page under the reader
     (the Anti-Page Jump rule). A new filter starts afresh; the reader is at the filter then. */
  const rootRef = useRef<HTMLDivElement>(null);
  const floor = useRef(0);
  /* A new filter, the reader's or the default once the import loads, measures afresh: a floor
     kept from All would leave Unclaimed's list a page of empty space. */
  useLayoutEffect(() => {
    floor.current = 0;
    if (rootRef.current) rootRef.current.style.minHeight = '';
  }, [show, category]);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (layout !== 'page' || !root) return;
    const observer = new ResizeObserver(() => {
      if (root.offsetHeight > floor.current) { floor.current = root.offsetHeight; root.style.minHeight = `${floor.current}px`; }
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [layout]);
  const left = (group: typeof groups[number]) => `${formatNumber(group.items.reduce((n, item) => n + (complete(group.id, item.id) ? 0 : item.amount), 0))} ${group.unit} left`;
  const body = (group: typeof groups[number]) => {
    const items = group.items.filter((item) => shown(group.id, item));
    const staged = group.id === 'story' || group.id === 'events';
    return <>
      <div className="pulls-eventlist-acts"><button type="button" className="ghost btn-sm" onClick={() => setCompleted(group, group.items.map((item) => item.id), true)}>All claimed</button><button type="button" className="ghost btn-sm" onClick={() => setCompleted(group, group.items.map((item) => item.id), false)}>None claimed</button></div>
      {!items.length && <p className="hint pulls-past-empty">{show === 'claimed' ? 'Nothing claimed here yet.' : 'Everything here is claimed.'}</p>}
      {/* One row each: the tick (the .check primitive), and for a chapter or event a button
          that names the stages left. */}
      <ul className="pulls-past-list" aria-label={`${group.name}: claimed`}>{items.slice(0, limits[group.id] ?? 30).map((item) => {
        const key = `${group.id}:${item.id}`;
        const done = complete(group.id, item.id);
        const sanity = group.unit === 'OP' ? stageRewardSanity(item.stages ?? (group.id === 'resources' ? [item.id.slice(item.id.indexOf(':') + 1)] : undefined), backlog.stageSanity, cleared) : null;
        const availability = group.id === 'paradox' ? paradoxAvailability(item, operatorBuilds) : null;
        return <li key={item.id} className={`pulls-past-row${done ? ' on' : ''}${availability?.ready === false && !done ? ' is-locked' : ''}`}>
          <label className="check pulls-past-check"><input type="checkbox" checked={done} onChange={(event) => setCompleted(group, [item.id], event.target.checked)} /><span className="visually-hidden">{item.name}: claimed</span></label>
          {staged
            ? <button type="button" className="btn-bare pulls-past-name" aria-expanded={detail === key} onClick={() => setDetail(detail === key ? null : key)}>{item.name}</button>
            : <span className="pulls-past-name">{item.name}{availability && <small className="pulls-paradox-requirement">{availability.ready === true ? 'Ready to play · ' : ''}{availability.label}</small>}</span>}
          <span className="pulls-past-amount">{done ? '✓' : item.certs && !item.amount ? `${item.certs} yellow certs` : <>
            {layout === 'page' ? <RewardAmount iconOnly resource={group.unit === 'OP' ? 'op' : 'orundum'} amount={item.amount} /> : `${formatNumber(item.amount)} ${group.unit}`}
            {layout === 'page' && group.unit === 'OP' && (sanity === null ? <small title="Some stage costs are missing">Sanity unknown</small> : <RewardAmount iconOnly resource="sanity" amount={sanity} />)}
          </>}</span>
          {staged && detail === key && stagesLeft(group.id, item)}
        </li>;
      })}</ul>
      <LoadOnScroll shown={Math.min(limits[group.id] ?? 30, items.length)} total={items.length} onMore={() => setLimits(value => ({ ...value, [group.id]: (value[group.id] ?? 30) + 30 }))} />
    </>;
  };
  return <div ref={rootRef} className={layout === 'page' ? 'pulls-past-page' : 'pulls-past-body'}>
    {imported
      ? <p className="hint">Ticked from your account, imported {formatDayMonthYear(imported.at.slice(0, 10))}. Change any tick to adjust it; <Link href="/account">import again</Link> to tick them afresh.</p>
      : <p className="hint">Tick what you have done, or <Link href="/account">import your account</Link> to tick it for you.</p>}
    <SegmentedControl label="Show" value={show} options={SHOW} onChange={setPicked} />
    {layout === 'page' && <Tabs label="First-clear category" id="first-clear-category" value={category} onChange={setCategory} options={groups.map(group => ({ value: group.id, label: group.name }))} />}
    {groups.filter(group => layout !== 'page' || group.id === category).map((group) => layout === 'page'
      ? <section key={group.id} className="op-section pulls-past-section" {...tabPanelProps('first-clear-category', group.id)}>
          <h2 id={`past-${group.id}`}>{group.name} <span className="hint pulls-note">{left(group)}</span></h2>
          {body(group)}
        </section>
      : <details className="pulls-disclosure" key={group.id} open={open === group.id}>
          <summary onClick={(event) => { event.preventDefault(); setOpen((previous) => (previous === group.id ? '' : group.id)); }}>{group.name}<span className="hint pulls-note">{left(group)}</span></summary>
          {body(group)}
        </details>)}
  </div>;
}
