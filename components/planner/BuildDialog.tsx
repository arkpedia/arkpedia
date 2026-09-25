import { PlannerStateLabel } from "./PromotionIcon";
import Image from '@/components/content/ContentImage';
import { useEffect, useRef } from 'react';
import { getEssentialIconPath, getMaterialIconPath } from '@/lib/operators/operatorIconPaths';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import type { CostGroup, PlannerOperatorSummary } from '@/lib/operators/operatorTypes';
import type { BuildPlan } from '@/lib/planner/build';
import { compactBadge } from '@/lib/planner/format';
import type { Goal } from '@/lib/planner/goals';

/**
 * Building, as its own screen.
 *
 * It began as a block at the bottom of the operator editor, under the four
 * state blocks and the bill, and that was the wrong place twice over: you had
 * to open the editor -- a screen for CHANGING what you want -- to do the thing
 * that spends your depot, and by the time you had scrolled to it the costs were
 * a run-on line of text, "20,000 LMD · 4 Vanguard Chip · 5 Polyester · 3
 * Oriron", which is a sentence to read rather than a bill to check.
 *
 * So: its own dialog, reachable from the plan row, and the costs are PICTURES.
 * Krooster's goal list is the reference -- one row per upgrade, the materials
 * as icons with the count on the corner -- because recognising four icons is a
 * glance and reading four names is a paragraph. The same reason the depot is a
 * grid of faces rather than a list of names.
 *
 * Every row is here, in the game's order of prerequisites, whether or not it
 * can be pressed. One that the game will not allow yet says what it is waiting
 * for; one the depot cannot pay for says what is short. That is the same
 * argument the editor's four blocks make: a screen that hides what you cannot
 * do yet cannot teach you the order things come in.
 */

export interface BuildStep {
  goal: Goal;
  /** The game allows this next. */
  ready: boolean;
  /** Why not, when it does not -- "After E0 Lv50", "After rank 2". */
  blocker: string;
  cost: CostGroup;
  /** The depot's answer, worked out only for a goal that is ready. */
  plan: BuildPlan | null;
}

/**
 * The picture that leads a row.
 *
 * A promotion and a mastery have emblems of their own in `essential-icons/`;
 * everything else is led by the first material it actually costs, which for a
 * level run is LMD and for a skill rank is the summary tier it wants. Nothing
 * here is drawn for the occasion -- and nothing reaches `Image` unless the
 * catalogue says the file is on disk, because `getMaterialIconPath` builds a
 * path whether or not one exists and a wrong name is a blank square.
 */
function leadIcon(goal: Goal, cost: CostGroup, held: (name: string) => boolean): { src: string; emblem: boolean } | null {
  if (goal.kind === 'elite') {
    const src = getEssentialIconPath(`Elite ${goal.elite}`);
    return src ? { src, emblem: true } : null;
  }
  if (goal.kind === 'mastery') {
    const src = getEssentialIconPath(`M${goal.mastery}`);
    return src ? { src, emblem: true } : null;
  }
  const first = cost.find((c) => c.name !== 'EXP' && c.name !== 'LMD' && held(c.name))
    ?? cost.find((c) => held(c.name));
  const src = first ? getMaterialIconPath(first.name) : null;
  /* `emblem` is what tells the stylesheet this is white line art rather than a
     full-colour material, so only the emblems get inverted on the light theme. */
  return src ? { src, emblem: false } : null;
}

/** One material and how many of it. The count is on the corner, as the game
 *  and Krooster both put it; the exact figure is in the title for the ones
 *  that get shortened. */
function CostChip({ name, count, held }: { name: string; count: number; held: boolean }) {
  const icon = held ? getMaterialIconPath(name) : null;
  return (
    <span className="cost-chip" title={`${Math.ceil(count).toLocaleString()} ${name}`}>
      {icon
        ? <Image src={icon} alt={name} width={34} height={34} />
        /* EXP is a number an operator needs rather than a thing you hold, so it
           has no icon and gets its name instead. */
        : <span className="cost-chip-noart">{name === 'EXP' ? 'EXP' : name.slice(0, 3)}</span>}
      <b>{compactBadge(count)}</b>
    </span>
  );
}

export function BuildDialog({
  name,
  op,
  fromLabel,
  toLabel,
  steps,
  note,
  canUndo,
  held,
  onBuild,
  onUndo,
  onClose,
}: {
  name: string;
  op: PlannerOperatorSummary;
  fromLabel: string;
  toLabel: string;
  steps: BuildStep[];
  note: string | null;
  canUndo: boolean;
  /** Whether a material has a picture on disk -- the depot catalogue. */
  held: (name: string) => boolean;
  onBuild: (goal: Goal) => void;
  onUndo: () => void;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  /* The same dialog behaviour as the roster: Escape closes, Tab wraps inside,
     and the page behind does not scroll under it. */
  useEffect(() => {
    const box = boxRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const els = Array.from(
        box?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled])') ?? [],
      ).filter((el) => el.tabIndex >= 0);
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
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const ready = steps.filter((s) => s.ready && s.plan?.ok).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box build-box"
        role="dialog"
        aria-modal="true"
        aria-label={`Build ${name}`}
        ref={boxRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="build-head">
          <span className="planner-buildface">
            <Image src={getOperatorIconPath(op)} alt="" width={44} height={44} />
            <span className={`planner-buildrarity tier-${op.rarity || 1}`} />
          </span>
          <span className="planner-buildwho">
            <span className="label-pair"><h2>{name}</h2></span>
            <span className="planner-buildfromto">
              <i>from</i>
              <b><PlannerStateLabel label={fromLabel} /></b>
              <em aria-hidden="true">&rarr;</em>
              <span className="visually-hidden">to</span>
              <b className="planner-buildto"><PlannerStateLabel label={toLabel} /></b>
            </span>
          </span>
          <button type="button" className="wizard-close" aria-label="Close" onClick={onClose}>&times;</button>
        </div>

        <div className="build-body">
          {steps.length === 0 ? (
            <p className="hint plan-hint">
              Everything this plan targets is done. Set a further target on <b>{name}</b> and the
              steps to it appear here.
            </p>
          ) : (
            <>
              {/* Derived from the rows below, not asserted. */}
              <p className="hint plan-hint build-lede">
                {steps.length} {steps.length === 1 ? 'step' : 'steps'} to go &middot;{' '}
                {ready > 0
                  ? `${ready} you can build right now`
                  : 'none of them payable from your depot yet'}
              </p>
              <div className="build-steps">
                {steps.map(({ goal, ready: canDo, blocker, cost, plan }) => {
                  const ok = !!plan && plan.ok;
                  const lead = leadIcon(goal, cost, held);
                  const state = !canDo
                    ? blocker
                    : ok
                      ? (Object.keys(plan.made).length ? 'Crafting on the way' : 'Covered')
                      : `Short of ${(plan as { short: string[] }).short.join(', ')}`;
                  return (
                    <div key={goal.label} className={`build-step${!canDo ? ' locked' : ok ? ' ready' : ' short'}`}>
                      <span className={`build-lead${lead?.emblem ? ' emblem' : ''}`}>
                        {lead && <Image src={lead.src} alt="" width={34} height={34} />}
                      </span>
                      <span className="build-goal"><b>{goal.label}</b></span>
                      <span className="build-cost">
                        {cost.filter((c) => Number(c.quantity) > 0).length === 0
                          ? <i>Costs nothing</i>
                          : cost
                            .filter((c) => Number(c.quantity) > 0)
                            .map((c) => (
                              <CostChip key={c.name} name={c.name} count={Number(c.quantity)} held={held(c.name)} />
                            ))}
                      </span>
                      <span className="build-state">{state}</span>
                      <button
                        type="button"
                        className={ok ? 'primary btn-sm' : 'btn-sm'}
                        disabled={!ok}
                        title={!canDo ? `${blocker} — the game does not allow this yet` : ok ? `Spend your depot on ${goal.label}` : state}
                        onClick={() => onBuild(goal)}
                      >
                        Build
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="wizard-foot">
          <p className="hint plan-hint build-note" role="status">
            {note ?? 'Building spends the materials and moves the operator, one step at a time.'}
          </p>
          <span className="wizard-foot-acts">
            {canUndo && <button type="button" className="ghost" onClick={onUndo}>Undo</button>}
            <button type="button" className="primary" onClick={onClose}>Done</button>
          </span>
        </div>
      </div>
    </div>
  );
}
