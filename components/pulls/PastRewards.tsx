import Link from 'next/link';
import { useState } from 'react';
import SegmentedControl from '@/components/ui/SegmentedControl';
import type { BacklogSources } from '@/lib/pulls/pulls';
import { formatDayMonthYear, formatNumber } from '@/lib/pulls/format';

type Show = 'all' | 'unclaimed' | 'claimed';
const SHOW = [
  { value: 'all', label: 'All' },
  { value: 'unclaimed', label: 'Unclaimed' },
  { value: 'claimed', label: 'Claimed' },
] as const;

interface Item { id: string; name: string; amount: number; stages?: string[]; stageCodes?: string[] }

/**
 * The Past events popup's contents (pages/pulls.tsx): what is left of the back catalogue,
 * group by group, each item a tick the reader can always change. An import ticks them once
 * (the page's ticksFrom); after that they are the reader's, for an import that has aged or a
 * what-if. `backlog` is what each unticked item still pays (unclaimedBacklog: what the import
 * left of it); `cleared` is the import's cleared stages, which name the stages left when an
 * item is opened. Whether any of it counts toward the forecast is the Include checkbox on
 * the frame that opens this.
 */
export function PastRewards({ backlog, doneKeys, doneEvents, annihilationDone, onKeys, onEvents, onAnnihilation, imported, cleared }: {
  backlog: BacklogSources;
  doneKeys: Set<string>; doneEvents: Set<string>; annihilationDone: boolean;
  onKeys: (keys: Set<string>) => void; onEvents: (keys: Set<string>) => void; onAnnihilation: (done: boolean) => void;
  imported: { at: string } | null;
  cleared: ReadonlySet<string> | null;
}) {
  const [open, setOpen] = useState('story');
  const [show, setShow] = useState<Show>('all');
  const [detail, setDetail] = useState<string | null>(null);
  const groups: { id: string; name: string; unit: string; items: Item[] }[] = [
    { id: 'story', name: 'Main story', unit: 'OP', items: backlog.chapters.map((c) => ({ id: c.id, name: `${c.label} · ${c.name}`, amount: c.op, stages: c.stages, stageCodes: c.stageCodes })) },
    { id: 'events', name: 'Events', unit: 'OP', items: backlog.playable.map((e) => ({ id: e.id, name: e.name, amount: e.op, stages: e.stages, stageCodes: e.stageCodes })) },
    { id: 'annihilation', name: 'Annihilation', unit: 'Orundum', items: backlog.annihilation },
    { id: 'resources', name: 'Resource stages', unit: 'OP', items: backlog.resources },
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
  const shown = (group: string, item: Item) => show === 'all' || (show === 'claimed') === complete(group, item.id);
  /* What opening an item says: every stage claimed, or the ones left by their codes. Without
     an import, or for a stage list the release does not name, its whole list. */
  const stagesLeft = (group: string, item: Item) => {
    if (complete(group, item.id)) return <p className="hint pulls-past-detail">Everything is claimed.</p>;
    const codes = item.stageCodes;
    if (!item.stages || !codes || codes.length !== item.stages.length) return <p className="hint pulls-past-detail">The stages are not listed for this one yet.</p>;
    const left = cleared ? codes.filter((_, index) => !cleared.has(item.stages![index])) : codes;
    if (cleared && !left.length) return <p className="hint pulls-past-detail">Every stage is cleared in your import; untick it only to count it anyway.</p>;
    return <p className="hint pulls-past-detail">{cleared ? 'Not cleared' : 'Its Originite Prime stages'} ({left.length}): {left.join(', ')}</p>;
  };
  return <div className="pulls-past-body">
    {imported
      ? <p className="hint">Ticked from your account, imported {formatDayMonthYear(imported.at.slice(0, 10))}. Change any tick to adjust it; <Link href="/account">import again</Link> to tick them afresh.</p>
      : <p className="hint">Tick what you have done, or <Link href="/account">import your account</Link> to tick it for you.</p>}
    <SegmentedControl label="Show" value={show} options={SHOW} onChange={setShow} />
    {groups.map((group) => {
      const items = group.items.filter((item) => shown(group.id, item));
      const staged = group.id === 'story' || group.id === 'events';
      return <details className="pulls-disclosure" key={group.id} open={open === group.id}>
        <summary onClick={(event) => { event.preventDefault(); setOpen((previous) => (previous === group.id ? '' : group.id)); }}>{group.name}<span className="hint pulls-note">{formatNumber(group.items.reduce((n, item) => n + (complete(group.id, item.id) ? 0 : item.amount), 0))} {group.unit} left</span></summary>
        <div className="pulls-eventlist-acts"><button type="button" className="ghost btn-sm" onClick={() => setCompleted(group, group.items.map((item) => item.id), true)}>All claimed</button><button type="button" className="ghost btn-sm" onClick={() => setCompleted(group, group.items.map((item) => item.id), false)}>None claimed</button></div>
        {!items.length && <p className="hint pulls-past-empty">{show === 'claimed' ? 'Nothing claimed here yet.' : 'Everything here is claimed.'}</p>}
        {/* One row each: the tick (the .check primitive), and for a chapter or event a button
            that names the stages left. */}
        <ul className="pulls-past-list" aria-label={`${group.name}: claimed`}>{items.map((item) => {
          const key = `${group.id}:${item.id}`;
          const done = complete(group.id, item.id);
          return <li key={item.id} className={`pulls-past-row${done ? ' on' : ''}`}>
            <label className="check pulls-past-check"><input type="checkbox" checked={done} onChange={(event) => setCompleted(group, [item.id], event.target.checked)} /><span className="visually-hidden">{item.name}: claimed</span></label>
            {staged
              ? <button type="button" className="btn-bare pulls-past-name" aria-expanded={detail === key} onClick={() => setDetail(detail === key ? null : key)}>{item.name}</button>
              : <span className="pulls-past-name">{item.name}</span>}
            <span className="pulls-past-amount">{done ? '✓' : `${formatNumber(item.amount)} ${group.unit}`}</span>
            {staged && detail === key && stagesLeft(group.id, item)}
          </li>;
        })}</ul>
      </details>;
    })}
  </div>;
}
