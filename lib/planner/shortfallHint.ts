import type { Formula } from './craft';
import type { Source } from './sources';

/**
 * The sentence under the planner's shortfall cards (components/planner/ShortfallList.tsx),
 * worked out from what the cards show.
 *
 * It said "None of these can be made at the bench, so every one of them is a run or a
 * shop." whenever no short material had a recipe the resolver walks -- which was wrong
 * about the one kind of material it most needed to be right about. A Guard Dualchip is
 * made in the Factory, out of Chip Packs and a Chip Catalyst, by a recipe the planner
 * deliberately does not follow (its ingredients lead down into the chip trades, a cycle),
 * and its card already said "Factory recipe" in the same panel as the sentence denying it.
 * A chip's class trade is the same case at the Workshop. So a short material with a recipe
 * the planner does not walk, and no stage to drop it, is counted as made in the base by
 * the reader, and named; and the sentence only says "every one of them is a run or a
 * shop" when that is what the cards say (a material with no listed source is neither).
 *
 * Pure, and takes the page's own lookups, so it answers from the release's tables like
 * every card beside it.
 */
export interface ShortfallHintTools {
  /** A recipe the reader can declare a craft for (lib/planner/craft.ts isDeclarable): the walkable
   *  ones and the Dualchip, which a card offers a Craft box for. Required, and not the narrower
   *  isCraftable, so a recipe the card offers is never called one "the planner will not follow". */
  isDeclarable: (name: string) => boolean;
  formulaFor: (name: string) => Pick<Formula, 'count' | 'costs'> | null;
  sourceFor: (name: string) => Pick<Source, 'kind'>;
}

/** LMD, EXP or both still short once no material is. */
export type MoneyShort = 'LMD' | 'EXP' | 'LMD and EXP' | null;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
/** "a", "a or b", "a, b or c". */
const either = (words: string[]) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`);

/** What a run of short materials with no bench recipe comes down to: runs, shops, or
 *  a material the site has no source for (SOURCE_LABELS.unknown, "Elsewhere"). */
function routes(rows: { name: string }[], tools: ShortfallHintTools, one: boolean): string {
  const kinds = new Set(rows.map((r) => tools.sourceFor(r.name).kind));
  const words: string[] = [];
  if (kinds.has('farm')) words.push(one ? 'a run' : 'runs');
  if (kinds.has('certificate') || kinds.has('event')) words.push(one ? 'a shop' : 'shops');
  if (kinds.has('unknown')) words.push('found elsewhere');
  return either(words);
}

export function shortfallHint(
  shortRows: readonly { name: string; short: number }[],
  depot: Readonly<Record<string, number>>,
  money: MoneyShort,
  tools: ShortfallHintTools,
): string {
  const total = shortRows.length;
  if (!total) return `Only ${money ?? 'LMD'} left to cover — no material is short.`;

  const craftable = shortRows.filter((r) => tools.isDeclarable(r.name));
  /* "Craftable but blocked one level down" is the case the expandable recipe exists for,
     so the panel counts it rather than asserting it: a short material with a walkable
     recipe, at least one of whose ingredients is also short. */
  const blockedDown = craftable.filter((r) => {
    const recipe = tools.formulaFor(r.name);
    if (!recipe) return false;
    const runs = Math.max(1, Math.ceil(r.short / Math.max(1, recipe.count)));
    return recipe.costs.some((c) => c.name !== 'LMD' && (depot[c.name] || 0) < c.count * runs);
  });
  if (blockedDown.length) {
    return `${blockedDown.length} of the ${total} short ${plural(blockedDown.length, 'is', 'are')} craftable but blocked one level down — open a material to see its recipe.`;
  }
  if (craftable.length) {
    return `${craftable.length} of the ${total} short can be made at the bench right now — open a material to see its recipe.`;
  }

  /* Made in the base, by the reader: no stage drops it, and its recipe is one the
     resolver will not walk -- what its card calls "Factory" or "Workshop" (sourceFor
     puts a stage first, so a chip that drops somewhere is a run, as its card says). */
  const bench = (r: { name: string }) => ['factory', 'workshop'].includes(tools.sourceFor(r.name).kind);
  const byHand = shortRows.filter(bench);
  const rest = shortRows.filter((r) => !bench(r));
  if (!byHand.length) {
    return `None of these can be made at the bench, so every one of them is ${routes(rest, tools, true)}.`;
  }
  const rooms = [...new Set(byHand.map((r) => (tools.sourceFor(r.name).kind === 'factory' ? 'Factory' : 'Workshop')))].sort();
  const where = rooms.map((room) => `the ${room}`).join(' or ');
  const n = byHand.length;
  const lead = n === 1 ? byHand[0].name : n === total ? (n === 2 ? 'Both' : `All ${n}`) : `${n} of the ${total} short`;
  const made = `${lead} ${plural(n, 'is', 'are')} made in ${where} by ${plural(n, 'a recipe', 'recipes')} the planner will not follow for you — open ${plural(n, 'it', 'one')} to see ${plural(n, 'the recipe', 'its recipe')}.`;
  if (!rest.length) return made;
  return `${made} The other ${rest.length === 1 ? 'one is' : `${rest.length} are`} ${routes(rest, tools, rest.length === 1)}.`;
}
