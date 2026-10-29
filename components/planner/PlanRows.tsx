import { FARMING_STRINGS } from '@/lib/planner/farmingStrings';
import { PlannerStateLabel } from "./PromotionIcon";
import Image from '@/components/content/ContentImage';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import type { PlannerOperatorSummary } from '@/lib/operators/operatorTypes';
import { useHeightFloor } from '@/components/ui/useHeightFloor';
import XButton from '@/components/ui/XButton';

/**
 * Who you are building.
 *
 * A row per operator rather than a card, because a row can hold the whole
 * sentence -- who, how many goals, where they are, where they are going, how
 * covered it is and what is next -- on one line, and that sentence is the
 * screen. A grid of cards had room for the face and the badges and then put the
 * from-and-to somewhere else.
 *
 * The operators with goals come first, in plan order, and that order is not
 * cosmetic: the depot is shared, so when two operators want the same Orirock
 * Cube the resolver spends it on whichever comes first. Everything else in the
 * roster is folded away behind one line, because a roster is mostly operators
 * you are not currently working on.
 */

export interface PlanRowView {
  name: string;
  op: PlannerOperatorSummary;
  /** Discrete upgrades between where they are and the target. */
  goals: number;
  /** The first of those, in upgrade order. */
  next: string | null;
  fromLabel: string;
  /** null when nothing is targeted yet. */
  toLabel: string | null;
  /** Share of this operator's own bill the depot already covers, 0 to 1. */
  covered: number;
  /** How many materials in that bill the plan is short of. */
  blocked: number;
  /** When the events being counted (the Farming method) will have given the last material this
   *  operator's bill lacks (YYYY-MM-DD); null when nothing comes from events or something is still short. */
  readyBy: string | null;
  /**
   * True while this operator's build data is still on the wire.
   *
   * It matters because everything else on the row is computed FROM that data:
   * with it missing, the goal count comes out as the promotions and level runs
   * alone (Texas read 3 instead of 9) and the bill comes out empty, which the
   * coverage meter reads as 100% -- a full green bar on an operator whose
   * materials are in the shortfall above. So the row says it is working rather
   * than answering from nothing.
   */
  pending: boolean;
}

function Row({
  view,
  open,
  onEdit,
  onBuild,
  onRemove,
  included,
  onInclude,
}: {
  view: PlanRowView;
  open: boolean;
  onEdit: () => void;
  /** Only for a row with a target: there is nothing to build towards without
   *  one, and a button that opens an empty dialog is worse than no button. */
  onBuild?: () => void;
  onRemove?: () => void;
  included: boolean;
  onInclude: (included: boolean) => void;
}) {
  const rarity = view.op.rarity || 1;
  const pct = Math.round(view.covered * 100);
  return (
    <div className={`plan-row${open ? ' open' : ''}${included ? '' : ' is-excluded'}`}>
      <label className="check plan-row-check"><input type="checkbox" checked={included} onChange={event => onInclude(event.target.checked)} /><span className="visually-hidden">Include {view.name} in material totals</span></label>
      <span className="plan-face">
        <Image src={getOperatorIconPath(view.op)} alt="" width={46} height={46} />
        {/* Rarity is a 3px edge, and it comes from the folder the portrait was
            read out of rather than being stored a second time. */}
        <span className={`tier-${rarity}`} />
      </span>

      <span className="plan-who">
        <b title={view.name}>{view.name}</b>
        <i>
          {!view.toLabel
            ? 'no goals set'
            : view.pending
              ? 'counting...'
              : `${view.goals} ${view.goals === 1 ? 'goal' : 'goals'}`}
        </i>
      </span>

      <span className="plan-arrow">
        <b><PlannerStateLabel label={view.fromLabel} /></b>
        {view.toLabel ? (
          <>
            <em aria-hidden="true">&rarr;</em>
            <span className="visually-hidden">to</span>
            <span className="to"><PlannerStateLabel label={view.toLabel} /></span>
          </>
        ) : (
          <span className="unset">&mdash; nothing targeted yet</span>
        )}
      </span>

      <span className="plan-progress">
        {view.toLabel && !view.pending && (
          <>
            <span className="meter plan-progress-meter">
              <span className="meter-fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="pct">{pct}%</span>
          </>
        )}
        {/* Which note shows is the useful part: what to do next, or what is
            stopping you. Amber only for the second. */}
        <span className={`note${view.blocked > 0 && !view.pending ? ' blocked' : ''}`}>
          {!view.toLabel
            ? 'Set a target to price it'
            : view.pending
              ? 'Working out what it costs...'
              : view.blocked > 0
                ? `Blocked on ${view.blocked} ${view.blocked === 1 ? 'material' : 'materials'}`
                : view.next
                  ? `Next: ${view.next}`
                  : 'Everything targeted is done'}
        </span>
        {/* Only once nothing is short: the date the events finish covering the bill. */}
        {view.readyBy && view.blocked === 0 && !view.pending && (
          <span className="plan-ready-by" title={FARMING_STRINGS.operatorReadyTitle(view.readyBy)}>{FARMING_STRINGS.operatorReady(view.readyBy)}</span>
        )}
      </span>

      <span className="plan-row-acts">
        {/* Building is the errand this row exists for once a target is set, so
            it leads -- and it is reachable without opening the editor, which is
            for changing what you want rather than spending what you have. */}
        {onBuild && (
          <button
            type="button"
            className="primary btn-sm"
            disabled={view.pending}
            title={view.pending ? 'Working out what it costs...' : `What it takes to build ${view.name}`}
            onClick={onBuild}
          >
            Build
          </button>
        )}
        <button type="button" className="ghost" aria-expanded={open} onClick={onEdit}>
          {open ? 'Close' : 'Edit'}
        </button>
        {onRemove && (
          <XButton label={`Drop ${view.name} from the plan`} title={`Drop ${view.name} from the plan`} onClick={onRemove} />
        )}
      </span>
    </div>
  );
}

export function PlanRows({
  clearControl,
  planned,
  openName,
  onEdit,
  onBuild,
  onRemove,
  onRoster,
  onAddGoal,
  rosterCount,
  excluded,
  onInclude,
  selectionControl,
}: {
  clearControl?: React.ReactNode;
  planned: PlanRowView[];
  openName: string | null;
  onEdit: (name: string) => void;
  onBuild: (name: string) => void;
  onRemove: (name: string) => void;
  /** Opens the roster window: every operator, yours lit, for recording what you
   *  have and how far along it is. */
  onRoster: () => void;
  /** Opens the goal window: the operators you HAVE, for aiming one somewhere. */
  onAddGoal: () => void;
  rosterCount: number;
  excluded: ReadonlySet<string>;
  onInclude: (name: string, included: boolean) => void;
  selectionControl: React.ReactNode;
}) {
  /**
   * WHO YOU ARE BUILDING, and nobody else.
   *
   * Three things went from this panel, all of them saying something the reader
   * could already get somewhere better:
   *
   *   - The operators in the roster with no goals set, folded behind a
   *     "Show them" bar. The roster grid IS that list, in colour, one press
   *     away on the button in this head -- so the bar was a second, worse copy
   *     of it, and the one that could shove four hundred pixels of rows under
   *     a reader who had scrolled past.
   *   - A search box that filtered these rows. It narrowed a list you can see
   *     all of.
   *   - A keyboard strip explaining the `/` shortcut for that search box.
   *
   * The reserve stays, because opening and closing an operator's editor still
   * changes this panel's height.
   */
  const floor = useHeightFloor(planned.length);

  return (
    <>
      <div className="plan-panel-head">
        {/* The title and its count: .plan-panel-lead hangs the dot in the gap between them
            and hides it where the count wraps under the title (planner.css). */}
        <span className="plan-panel-lead">
          <span className="label-pair">
            <span className="label-tag plan-panel-tag">Who you are building</span>
            <h2 className="section-title">Your plan</h2>
          </span>
          {/* Derived from the rows beneath it, which is now all this panel holds. */}
          <span className="hint plan-hint">
            <span className="plan-sep" aria-hidden="true">&middot;</span>{planned.length} {planned.length === 1 ? 'operator' : 'operators'} with goals
          </span>
        </span>
        <span className="plan-panel-acts plan-panel-acts-fill">{clearControl}
          {selectionControl}
          {/* Two errands, two buttons. `Your roster` is where you say what you
              HAVE -- a transcription job, done once for a hundred and fifty
              operators. `Add a goal` is where you say what you are AIMING AT,
              a decision you make for the four you are building, and it offers
              the operators you have already recorded. */}
          <button type="button" className="ghost btn-sm" onClick={onRoster}>
            Your roster
          </button>
          <button type="button" className="primary btn-sm" onClick={onAddGoal}>
            + Add a goal
          </button>
        </span>
      </div>

      <div className="plan-panel-body" ref={floor.ref}>
        {planned.length === 0 ? (
          <p className="hint plan-hint">
            Nothing here yet. Open <b>Your roster</b> and press whoever you own to say how
            far along they are &mdash; then <b>+ Add a goal</b> for the ones you are
            building, and everything else on this page fills in from that.
          </p>
        ) : (
          <div className="plan-rows">
            {planned.map((v) => (
              <Row key={v.name} view={v} included={!excluded.has(v.name)} onInclude={included => onInclude(v.name, included)} open={openName === v.name} onEdit={() => onEdit(v.name)} onBuild={() => onBuild(v.name)} onRemove={() => onRemove(v.name)} />
            ))}
          </div>
        )}

        {rosterCount === 0 && planned.length > 0 && (
          <p className="hint plan-hint">
            Nothing is recorded in your roster yet, so every plan here starts from E0 Lv1.
            Press <b>Edit</b> on a row and set where they actually are.
          </p>
        )}
        {floor.spacer}
      </div>
    </>
  );
}
