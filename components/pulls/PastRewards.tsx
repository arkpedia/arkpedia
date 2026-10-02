import Link from 'next/link';
import { useState } from 'react';
import type { BacklogSources } from '@/lib/pulls/pulls';
import { formatDayMonthYear, formatNumber } from '@/lib/pulls/format';

/** `backlog` is the page's release copy, never an import of data/: see BacklogSources. */
/** Whether these count toward the forecast is the Include checkbox in the Past events
 *  frame that opens this panel (pages/pulls.tsx), shown at every width. */
/**
 * What is left of the back catalogue, group by group. Without an import the reader ticks off
 * what they have done; with one (`imported`), the account says, stage by stage, and the lists
 * only show it -- except Annihilation on a record from before it was kept, which the reader
 * still ticks. `editKeys` is the reader's own ticks, which an edit changes: `doneKeys` may hold
 * what the import derived, which must not be saved as theirs.
 */
export function PastRewards({ backlog, doneKeys, doneEvents, annihilationDone, onKeys, onEvents, onAnnihilation, editKeys, imported }: {
  backlog: BacklogSources;
  doneKeys: Set<string>; doneEvents: Set<string>; annihilationDone: boolean;
  onKeys: (keys: Set<string>) => void; onEvents: (keys: Set<string>) => void; onAnnihilation: (done: boolean) => void;
  editKeys: Set<string>;
  imported: { at: string; annihilation: boolean } | null;
}) {
  const [open, setOpen] = useState('story');
  const groups = [
    { id:'story', name:'Main story', unit:'OP', items:backlog.chapters.map(c => ({id:c.id, name:`${c.label} · ${c.name}`, amount:c.op})) },
    { id:'events', name:'Events', unit:'OP', items:backlog.playable.map(e => ({id:e.id, name:e.name, amount:e.op})) },
    { id:'annihilation', name:'Annihilation', unit:'Orundum', items:backlog.annihilation },
    { id:'resources', name:'Resource stages', unit:'OP', items:backlog.resources },
  ];
  const complete = (group: string, id: string) => group === 'events' ? doneEvents.has(id) : group === 'annihilation' && annihilationDone || group === 'resources' && doneKeys.has('daily') || doneKeys.has(id);
  const locked = (group: string) => !!imported && (group !== 'annihilation' || imported.annihilation);
  const setCompleted = (group: typeof groups[number], ids: string[], done: boolean) => {
    if (locked(group.id)) return;
    const next = new Set(group.id === 'events' ? doneEvents : editKeys);
    // Expand old all-or-nothing saves only when the user edits this category.
    if (group.id === 'annihilation' && annihilationDone) { group.items.forEach(item => next.add(item.id)); onAnnihilation(false); }
    if (group.id === 'resources' && next.has('daily')) { group.items.forEach(item => next.add(item.id)); next.delete('daily'); }
    ids.forEach(id => done ? next.add(id) : next.delete(id));
    (group.id === 'events' ? onEvents : onKeys)(next);
  };
  return <>
    <div className="pulls-panel-head"><h2>Unclaimed rewards</h2></div>
    {imported
      ? <p className="hint">Counted from your account, imported {formatDayMonthYear(imported.at.slice(0, 10))}: every stage you have cleared is ticked off.{imported.annihilation ? '' : ' Tick Annihilation yourself, or import again to count it too.'} <Link href="/account">Import again</Link> to update it.</p>
      : <p className="hint">Tick completed content, or <Link href="/account">import your account</Link> to count it for you.</p>}
    {groups.map(group => <details className="pulls-disclosure" key={group.id} open={open === group.id}>
      <summary onClick={event => { event.preventDefault(); setOpen(previous => previous === group.id ? '' : group.id); }}>{group.name}<span className="hint pulls-note">{formatNumber(group.items.reduce((n,item) => n + (complete(group.id,item.id) ? 0 : item.amount),0))} {group.unit} left</span></summary>
      {!locked(group.id) && <div className="pulls-eventlist-acts"><button type="button" className="ghost btn-sm" onClick={() => setCompleted(group, group.items.map(item => item.id), true)}>All completed</button><button type="button" className="ghost btn-sm" onClick={() => setCompleted(group, group.items.map(item => item.id), false)}>None completed</button></div>}
      {/* A list you tick: each item a real checkbox in the .check primitive (it was a
          button drawing its own box and tick). */}
      <div className="pulls-eventgrid" role="group" aria-label={`${group.name}: completed`}>{group.items.map(item => <label key={item.id} className={`check pulls-eventchip${complete(group.id,item.id) ? ' on' : ''}`}>
        <input type="checkbox" checked={complete(group.id,item.id)} disabled={locked(group.id)} onChange={event => setCompleted(group,[item.id],event.target.checked)} /><span className="pulls-eventchip-name">{item.name}</span><span className="pulls-eventchip-op">{item.amount}</span>
      </label>)}</div>
    </details>)}
  </>;
}
