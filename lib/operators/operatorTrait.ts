import type { Operator } from '@/lib/operators/operatorTypes';

/** One line of a trait as the site shows it: `stage` is the promotion it reads at ("Base",
 *  "Elite 1", "Elite 2"), or null for a trait that reads the same at every promotion. */
export interface TraitPhase {
  stage: string | null;
  text: string;
}

const STAGE_ORDER = (stage: string) => (stage === 'Base' ? 0 : Number(stage.match(/^Elite (\d)$/)?.[1] ?? Infinity));

/*
 * A record's trait as lines, for every place that shows one (the operator page's overview and
 * profile, the /gacha preview). A trait that reads the same at every promotion is one string and
 * one unlabelled line; one that changes is { Base, "Elite 1", "Elite 2" } (the refresh's
 * officialTrait writes only the phases the game has: Pudding's Base and Elite 2), and each phase
 * is a line labelled with its key, in promotion order. Those 12 records were shown as the fixed
 * text "Trait changes with promotion." on the page and as their last phase alone in the preview,
 * so a reader never saw what changed. A phase with no text is left out.
 */
export function traitPhases(trait: Operator['trait'] | undefined): TraitPhase[] {
  if (typeof trait === 'string') return trait.trim() ? [{ stage: null, text: trait }] : [];
  if (!trait || typeof trait !== 'object') return [];
  return Object.entries(trait)
    .filter(([, text]) => typeof text === 'string' && text.trim())
    .map(([stage, text], index) => ({ stage, text, index }))
    .sort((a, b) => STAGE_ORDER(a.stage) - STAGE_ORDER(b.stage) || a.index - b.index)
    .map(({ stage, text }) => ({ stage, text }));
}
