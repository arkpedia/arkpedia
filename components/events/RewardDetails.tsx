import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type MouseEvent } from 'react';
import Image from '@/components/content/ContentImage';
import XButton from '@/components/ui/XButton';
import type { TicketDetails } from '@/lib/events/announcements';
import type { EventExtras } from '@/lib/events/tableRewards';
import { RewardTile } from './RewardTile';
import { packDay } from '@/lib/events/packDay';

export interface ResolvedTicket extends Omit<TicketDetails, 'operators'> {
  operators: { name: string; iconPath: string; href: string }[];
}
type Pack = EventExtras['packs'][number]['packs'][number];
type Detail = { name: string; ticket: ResolvedTicket } | { name: string; pack: Pack; source: string };
const Details = createContext<{ tickets: Record<string, ResolvedTicket>; open: (detail: Detail, trigger: HTMLElement) => void } | null>(null);

/** One native modal handles packs and their tickets. Browser focus containment, Escape,
 * scroll locking and restoring the original card keep both desktop and phone usable. */
export function RewardDetailsProvider({ tickets, children }: { tickets: Record<string, ResolvedTicket>; children: ReactNode }) {
  const [stack, setStack] = useState<Detail[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const active = stack[stack.length - 1];
  const isOpen = !!active;
  useEffect(() => {
    if (!isOpen) return;
    const element = dialog.current!;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previous;
      trigger.current?.focus({ preventScroll: true });
    };
  }, [isOpen]);
  useEffect(() => { if (active) { dialog.current!.scrollTop = 0; heading.current?.focus(); } }, [active]);
  const open = (detail: Detail, button: HTMLElement) => {
    if (!stack.length) trigger.current = button;
    setStack(current => [...current, detail]);
  };
  const close = () => setStack([]);
  return <Details.Provider value={{ tickets, open }}>
    {children}
    <dialog ref={dialog} className="event-details-dialog" aria-labelledby="event-details-title" onCancel={e => { e.preventDefault(); close(); }} onClick={e => {
      if (e.target !== dialog.current) return;
      const rect = dialog.current.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) close();
    }}>
      {active && <>
        <div className="event-details-head">
          <div>
            {stack.length > 1 && <button type="button" className="btn" onClick={() => setStack(current => current.slice(0, -1))}>← Pack contents</button>}
            <h2 id="event-details-title" ref={heading} className="entity-title" tabIndex={-1}>{active.name}</h2>
          </div>
          <XButton onClick={close} label={`Close ${active.name}`} />
        </div>
        {'ticket' in active ? <>
          <p>{active.ticket.description}</p>
          {active.ticket.note && <p className="hint">{active.ticket.note}</p>}
          <div className="event-selector-operators">
            {active.ticket.operators.map(op => <a key={op.name} href={op.href} className="event-selector-operator">
              <Image src={op.iconPath} alt="" width={56} height={56} />
              <span>{op.name}</span>
            </a>)}
          </div>
          <p className="hint"><a href={active.ticket.source} target="_blank" rel="noopener noreferrer">Source announcement</a></p>
        </> : <>
          {active.pack.start && <p className="hint">Sale window: {packDay(active.pack.start)} – {active.pack.end ? packDay(active.pack.end) : 'Not announced'}</p>}
          {active.pack.limit && <p className="hint">Purchase limit: {active.pack.limit}</p>}
          <div className="event-reward-totals">{active.pack.contents.map(item => <RewardTile key={item.name} {...item} />)}</div>
          {(active.pack.notes ?? []).map(line => <p className="hint" key={line}>{line}</p>)}
          <p className="hint"><a href={active.source} target="_blank" rel="noopener noreferrer">Source announcement</a></p>
        </>}
      </>}
    </dialog>
  </Details.Provider>;
}

export function RewardClick({ name, className, children }: { name: string; className: string; children: ReactNode }) {
  const details = useContext(Details);
  const ticket = details?.tickets[name];
  if (!ticket) return <span className={className} title={name}>{children}</span>;
  return <button type="button" className={`${className} btn-bare event-ticket-trigger`} title={name} aria-label={`${name}: selectable operators`} aria-haspopup="dialog" onClick={e => details!.open({ name, ticket }, e.currentTarget)}>{children}<span className="event-ticket-open" aria-hidden="true">↗</span></button>;
}

export function PackButton({ pack, source, children }: { pack: Pack; source: string; children: ReactNode }) {
  const details = useContext(Details);
  return <button type="button" className="btn-bare event-pack-card" aria-haspopup="dialog" onClick={(e: MouseEvent<HTMLButtonElement>) => details?.open({ name: pack.name, pack, source }, e.currentTarget)}>{children}</button>;
}
