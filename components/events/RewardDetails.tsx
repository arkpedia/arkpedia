import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo, type ReactNode, type MouseEvent } from 'react';
import Image from '@/components/content/ContentImage';
import { OperatorPreview, type OperatorPreviewItem } from '@/components/operators/OperatorPreview';
import XButton from '@/components/ui/XButton';
import type { TicketDetails } from '@/lib/events/announcements';
import type { EventExtras } from '@/lib/events/tableRewards';
import { RewardTile } from './RewardTile';
import { packDay } from '@/lib/events/packDay';
import { combinedRecommendation, pointLabel, rankByRecommendation, type Recommendation } from '@/lib/selectors/scoring';

export interface ResolvedTicket extends Omit<TicketDetails, 'operators'> {
  operators: { name: string; iconPath: string; href: string }[];
  pools?: { name: string; operators: ResolvedTicket['operators'] }[];
}
type Pack = EventExtras['packs'][number]['packs'][number];
type Detail = { name: string; ticket: ResolvedTicket } | { name: string; pack: Pack; source: string };
const Details = createContext<{ tickets: Record<string, ResolvedTicket>; open: (detail: Detail, trigger: HTMLElement) => void } | null>(null);

/** One native modal handles packs and their tickets. Browser focus containment, Escape,
 * scroll locking and restoring the original card keep both desktop and phone usable. */
export function RewardDetailsProvider({ tickets, children, recommendations, recommendationNote, recommendationSettings }: { tickets: Record<string, ResolvedTicket>; children: ReactNode; recommendations?: Record<string, Recommendation>; recommendationNote?: string; recommendationSettings?: ReactNode }) {
  const [stack, setStack] = useState<Detail[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsHeight, setSettingsHeight] = useState<number | undefined>();
  const operatorScroll = useRef(0);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const [operatorPreview, setOperatorPreview] = useState<OperatorPreviewItem | null>(null);
  const closeOperatorPreview = useCallback(() => setOperatorPreview(null), []);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const active = stack[stack.length - 1];
  const ticket = active && 'ticket' in active ? active.ticket : undefined;
  const operators = useMemo(() => rankByRecommendation(ticket?.operators ?? [], recommendations), [ticket, recommendations]);
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
  useEffect(() => { setShowSettings(false); setSettingsHeight(undefined); if (active) { dialog.current!.scrollTop = 0; heading.current?.focus(); } }, [active]);
  useEffect(() => { if (isOpen) dialog.current!.scrollTop = showSettings ? 0 : operatorScroll.current; }, [showSettings, isOpen]);
  const toggleSettings = () => {
    if (!showSettings) {
      operatorScroll.current = dialog.current!.scrollTop;
      setSettingsHeight(dialog.current!.getBoundingClientRect().height);
    }
    setShowSettings(value => !value);
  };
  const open = (detail: Detail, button: HTMLElement) => {
    if (!stack.length) trigger.current = button;
    setStack(current => [...current, detail]);
  };
  const close = () => { operatorScroll.current = 0; setStack([]); };
  const renderOperators = (items: ResolvedTicket['operators']) => (
<div className="event-selector-operators">
            {items.map(op => { const score = recommendations?.[op.name]; const breakdown = score ? `${score.complete ? "Recommendation" : "Available subtotal (rating data missing)"}: ${pointLabel(score.total)}. ${score.lines.map(line => `${line.label}: ${pointLabel(line.points)}`).join("; ")}` : undefined; return <button key={op.name} type="button" className="btn-bare event-selector-operator" aria-haspopup="dialog" title={breakdown} aria-label={`${op.name}: operator preview${score ? `, ${breakdown}${score.owned ? ", already owned" : ""}` : ""}`}
              onClick={() => setOperatorPreview({ name: op.name, icon: op.iconPath, rarity: 6 })}>
              <span className="selector-portrait"><Image src={op.iconPath} alt="" width={56} height={56} />
              {score && <span className={`selector-score selector-score-${score.tone}`} aria-hidden="true">{pointLabel(score.total)}</span>}
              </span>
              <span>{op.name}</span>
            {score?.owned && <span className="selector-owned">Owned</span>}
            </button>; })}
          </div>
  );
  return <Details.Provider value={{ tickets, open }}>
    {children}
    <dialog ref={dialog} className="event-details-dialog" style={showSettings ? { height: settingsHeight } : undefined} aria-labelledby="event-details-title" onCancel={e => { e.preventDefault(); if (showSettings) { setShowSettings(false); settingsTrigger.current?.focus(); } else close(); }} onKeyDown={e => {
      if (e.key !== 'Tab') return;
      const focusable = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')];
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }} onClick={e => {
      if (e.target !== dialog.current) return;
      const rect = dialog.current.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) close();
    }}>
      {active && <>
        <div className="event-details-head">
          <div>
            {stack.length > 1 && <button type="button" className="btn" onClick={() => setStack(current => current.slice(0, -1))}>← Pack contents</button>}
            <h2 id="event-details-title" ref={heading} className="entity-title" tabIndex={-1}>{active.name}</h2>
            {'ticket' in active && recommendationSettings && <button ref={settingsTrigger} type="button" className="btn btn-sm selector-personalize-button" aria-expanded={showSettings} aria-controls="event-selector-content" onClick={toggleSettings}>{showSettings ? 'Show recommendations' : 'Personalize recommendations'}</button>}
          </div>
          <XButton onClick={close} label={`Close ${active.name}`} />
        </div>
        {'ticket' in active ? <div id="event-selector-content">{showSettings ? recommendationSettings : <>
          <p>{active.ticket.description}</p>
          {active.ticket.note && <p className="hint">{active.ticket.note}</p>}
          {recommendationNote && <p className="hint">{recommendationNote}</p>}
          {active.ticket.pools ? [...active.ticket.pools].sort((a, b) => recommendations ? combinedRecommendation(b.operators, recommendations).total - combinedRecommendation(a.operators, recommendations).total : 0).map(pool => {
            const score = recommendations ? combinedRecommendation(pool.operators, recommendations) : null;
            return <section key={pool.name} className="selector-pool">
              <h3>Ticket {pool.name}{score && <span className={`selector-pool-total selector-score-${score.tone}`}>{score.complete ? 'Combined score' : 'Available subtotal'} {pointLabel(score.total)}</span>}</h3>
              {renderOperators(rankByRecommendation(pool.operators, recommendations))}
            </section>;
          }) : renderOperators(operators)}
          <p className="hint"><a href={active.ticket.source} target="_blank" rel="noopener noreferrer">Source announcement</a></p>
        </>}</div> : <>
          {active.pack.imagePath && <Image className="event-pack-detail-image" src={active.pack.imagePath} alt={`${active.pack.name} artwork`} width={200} height={150} />}
          {active.pack.start && <p className="hint">Sale window: {packDay(active.pack.start)} – {active.pack.end ? packDay(active.pack.end) : 'Not announced'}</p>}
          {active.pack.limit && <p className="hint">Purchase limit: {active.pack.limit}</p>}
          <div className="event-reward-totals">{active.pack.contents.map(item => <RewardTile key={item.name} {...item} />)}</div>
          {(active.pack.notes ?? []).map(line => <p className="hint" key={line}>{line}</p>)}
          <p className="hint"><a href={active.source} target="_blank" rel="noopener noreferrer">Source announcement</a></p>
        </>}
      </>}
    </dialog>
    {operatorPreview && <OperatorPreview item={operatorPreview} onClose={closeOperatorPreview} nativeModal />}
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
