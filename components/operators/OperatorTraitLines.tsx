import { Fragment } from 'react';
import type { TraitPhase } from '@/lib/operators/operatorTrait';
import { highlightStats } from '../ui/HighlightedText';

/*
 * A trait's lines (lib/operators/operatorTrait.ts traitPhases) inside a paragraph or span the
 * caller owns: one line for a trait that never changes, else one per promotion, each opened by
 * its stage as a <b> label ("Base:", "Elite 2:"), the page's own label look (a module stage's
 * "Trait:" effect, the Profile facts' "Main Faction:"). `highlight` is the overview's number
 * highlighting, which the Profile facts row does not use.
 */
export default function OperatorTraitLines({ lines, highlight }: { lines: TraitPhase[]; highlight: boolean }) {
  return <>
    {lines.map((line, index) => (
      <Fragment key={line.stage ?? 'trait'}>
        {index > 0 && <br />}
        {line.stage && <><b>{line.stage}:</b>{' '}</>}
        {highlight ? highlightStats(line.text) : line.text}
      </Fragment>
    ))}
  </>;
}
