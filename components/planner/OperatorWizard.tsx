import Image from '@/components/content/ContentImage';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { useEffect, useRef, useState } from 'react';
import type { PlannerOperatorSummary } from '@/lib/operators/operatorTypes';
import type { Roster } from '@/lib/planner/roster';
import { NO_FILTERS, RosterGrid, type RosterFilters } from './RosterGrid';

/**
 * A grid of operators, then one operator -- for either of the two errands.
 *
 * TWO ERRANDS, NOT ONE SCREEN WITH TABS. Recording what you own and deciding
 * what to aim at were the two halves of one dialog, sitting behind a
 * `Where they are now` / `Target` tab pair, and they are not two views of one
 * thing: the first is a transcription job you do once for a hundred and fifty
 * operators, the second is a decision you make for the four you are actually
 * building. Sharing a window meant every goal you set began by looking at a
 * form for the other question.
 *
 * So the same shell serves both, told apart by `flow`:
 *
 *   roster  every operator as a face, yours in colour -> where they are now
 *   goal    the operators you HAVE (plus a way to widen it) -> their target
 *
 * Each is opened by its own button, and the step rail names the errand you are
 * on rather than a generic "1 / 2".
 *
 * Previous and Next walk the grid in the order you filtered it, so narrowing to
 * your 6-star Snipers and stepping through them is one gesture per operator. A
 * plan row's Edit opens the goal flow at its second step, because editing a
 * target and setting one are the same act arriving from different directions.
 *
 * It is also the answer to the page-jump the inline editor had. An overlay does
 * not change the height of the document behind it, so there is nothing to
 * clamp and nothing to reserve.
 *
 * The chrome, the step rail and the grid live here; the second step's own body
 * is passed in as children, because it is the four-block form the page already
 * owns and wires to its own state.
 */

export type WizardStep = 'pick' | 'one';
export type WizardFlow = 'roster' | 'goal';

const RAIL: Record<WizardFlow, [string, string]> = {
  roster: ['Your roster', 'Where they are now'],
  goal: ['Add a goal', 'Target'],
};

export function OperatorWizard({
  clearControl,
  simpleStep,
  onSimpleNext,
  flow,
  step,
  operators,
  roster,
  inPlan,
  queue,
  index,
  headline,
  canGoBack,
  onOpen,
  onBack,
  onIndex,
  onClose,
  children,
}: {
  clearControl?: React.ReactNode;
  simpleStep?: 'current' | 'goal';
  onSimpleNext?: () => void;
  flow: WizardFlow;
  step: WizardStep;
  operators: PlannerOperatorSummary[];
  /** What you own -- lit in the grid, with how far along each one is. */
  roster: Roster;
  /** Who is already in the plan, marked so on the tile. */
  inPlan: ReadonlySet<string>;
  /** The operators the second step is walking, in the grid's own order. */
  queue: string[];
  index: number;
  /** Who the second step is about, drawn by the page. */
  headline: React.ReactNode;
  canGoBack: boolean;
  /** A tile was pressed: that operator, and the grid's current order. */
  onOpen: (name: string, order: string[]) => void;
  onBack: () => void;
  onIndex: (index: number) => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const activeSummary = operators.find((operator) => operator.name === queue[index]);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  /* The grid's filters live here so they survive the trip into an operator and
     back. They die with the dialog, which is the right lifetime: the next visit
     is a new errand. */
  /* The goal picker opens on the operators you HAVE, because a goal for one you
     do not own is the exception -- `Add a new operator` inside the grid widens
     it to everybody. The roster picker opens on everybody, because recording
     ownership is exactly the act of finding one that is not lit yet. */
  const [filters, setFilters] = useState<RosterFilters>(
    flow === 'goal' ? { ...NO_FILTERS, owned: 'owned' } : NO_FILTERS,
  );
  /* Who the reader stepped back from, so the grid can land on them. Set on
     Back, cleared when the next tile is opened. */
  const [returnTo, setReturnTo] = useState<string | null>(null);

  /**
   * Dialog behaviour, the same as the site's nav drawer: Escape closes, focus
   * moves in on open and Tab wraps inside, because the page behind the overlay
   * is still in the DOM and would otherwise be reachable blind.
   */
  useEffect(() => {
    const box = boxRef.current;
    const focusables = () => Array.from(
      box?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? [],
    ).filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !box?.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !box?.contains(active))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => { if (previous?.isConnected) previous.focus(); else document.getElementById('planner-search')?.focus(); };
  }, []);
  useEffect(() => {
    if (step === 'one') boxRef.current?.querySelector<HTMLElement>('.wizard-close')?.focus();
    const body = boxRef.current?.querySelector('.wizard-body');
    if (body) body.scrollTop = 0;
  }, [step, simpleStep]);

  /* Scroll behind an overlay is scroll you cannot see the result of. Same
     one-line lock the nav drawer uses, released on unmount either way. */
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    /* Focus lands on the search when you arrive at the grid from the page, and
       on the tile you were editing when you arrive from an operator -- the
       grid handles the second; this is the first. */
    if (step === 'pick' && !returnTo) searchRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-box wizard-box${simpleStep ? ' simple-wizard' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={simpleStep ? `${queue[index]} — ${simpleStep === 'current' ? 'Set starting level' : 'Set goal'}` : RAIL[flow][step === 'pick' ? 0 : 1]}
        ref={boxRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wizard-head">
          {/* Two steps, and the rail says which one you are on and what the
              other one is -- the thing none of the three old screens did. */}
          {simpleStep ? <h2 className="simple-editor-title">{activeSummary && <Image src={getOperatorIconPath(activeSummary)} alt={activeSummary.name} width={40} height={40} />}<span>{simpleStep === 'current' ? 'Set starting level' : 'Set goal'}</span></h2> : <span className="wizard-rail">
            <span className={`wizard-step${step === 'pick' ? ' current' : ' done'}`}>
              <b>1</b>
              <i>{RAIL[flow][0]}</i>
            </span>
            <span className={`wizard-step${step === 'one' ? ' current' : ''}`}>
              <b>2</b>
              <i>{RAIL[flow][1]}</i>
            </span>
          </span>}
          <button type="button" className="wizard-close" aria-label="Close" onClick={onClose}>&times;</button>
        </div>

        {step === 'pick' ? (
          <>
            {clearControl && <div className="planner-roster-clear">{clearControl}</div>}
            <RosterGrid
              mode={flow}
              operators={operators}
              roster={roster}
              inPlan={inPlan}
              filters={filters}
              onFilters={setFilters}
              returnTo={returnTo}
              onOpen={(name, order) => { setReturnTo(null); onOpen(name, order); }}
              searchRef={searchRef}
            />
            <div className="wizard-foot wizard-foot-pick">
              <span />
              <span className="wizard-foot-acts">
                {/* Done, not Cancel: everything in here wrote through as it
                    was pressed, so there is nothing left to discard. On a phone
                    this footer is dropped altogether -- the close in the rail
                    is the same act, and sixty pixels is half a row of faces. */}
                <button type="button" className="primary" onClick={onClose}>Done</button>
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="wizard-body">
              {!simpleStep && <div className="wizard-who">
                {headline}
                {queue.length > 1 && (
                  <span className="wizard-count">
                    {index + 1} of {queue.length}
                  </span>
                )}
              </div>}
              {children}
            </div>

            {simpleStep ? <div className="wizard-foot"><button type="button" className="primary" onClick={onSimpleNext ?? onClose}>{onSimpleNext ? 'Next' : 'Done'}</button></div> : <div className="wizard-foot">
              <span className="wizard-foot-acts">
                {canGoBack && (
                  <button type="button" className="ghost" onClick={() => { setReturnTo(queue[index] ?? null); onBack(); }}>
                    &lsaquo; {RAIL[flow][0]}
                  </button>
                )}
              </span>
              <span className="wizard-foot-acts">
                {/* Previous and Next walk the grid as it was filtered, so a
                    reader who narrowed it to their 6-stars steps through those
                    and nobody else. Done is always here: the walk has no end
                    the reader has to reach. */}
                {queue.length > 1 && (
                  <>
                    <button type="button" className="ghost" disabled={index <= 0} onClick={() => onIndex(index - 1)}>&lsaquo; Previous</button>
                    <button type="button" className="ghost" disabled={index >= queue.length - 1} onClick={() => onIndex(index + 1)}>Next &rsaquo;</button>
                  </>
                )}
                <button type="button" className="primary" onClick={onClose}>Done</button>
              </span>
            </div>}
          </>
        )}
      </div>
    </div>
  );
}
