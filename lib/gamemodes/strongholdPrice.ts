import type { StrongholdOperator } from './stronghold';

/**
 * The parts of the Stronghold Protocol model the browser needs.
 *
 * Separate from stronghold.ts on purpose: that file reads the datasets off disk, so it
 * imports `fs`, and anything a component calls at render time would drag `fs` into the
 * client bundle and fail the build. Only types cross the line from there to here.
 */

/**
 * What an operator costs to buy out of the Dispatch Center.
 *
 * NOT its tier number. The game's own table -- shopCharChessInfoData, emitted to
 * data/gamemodes/stronghold/tier_costs.json -- prices tiers I to VI at 2, 3, 3, 3, 4, 4,
 * so a Tier II Gravel and a Tier IV Bagpipe both cost 3. An earlier version of this file
 * asserted one Fund per tier, which reads plausibly, matches the autochess convention,
 * and is wrong; the user checked in game.
 *
 * An operator can still undercut its tier, and says so on itself when it does -- exactly
 * one does, Minimalist, "Costs 1 Funds to purchase" against her tier's 3, and kukki's own
 * role field tags her "Cost 1". That is read out of the attribute text rather than kept
 * in a list here that would go stale the next time the roster turns over.
 */
const STATED_PRICE = /costs?\s+(\d+)\s+funds?\s+to\s+purchase/i;

export interface TierCost {
  tier: string;
  funds: number | null;
  sell: number | null;
}

export function tierFunds(costs: TierCost[], tier: string): number | null {
  return costs.find((c) => c.tier === tier)?.funds ?? null;
}

export function operatorFunds(
  op: StrongholdOperator,
  costs: TierCost[],
): { funds: number | null; stated: boolean } {
  const said = STATED_PRICE.exec(op.base_attribute || '');
  if (said) return { funds: Number(said[1]), stated: true };
  return { funds: tierFunds(costs, op.tier), stated: false };
}

/**
 * Icon file names, kept in step with scripts/build-alliance-icons.mjs. ASCII and
 * kebab-case on purpose: /_next/image answers 400 for a non-ASCII filename, and
 * "Ægir.webp" is exactly that trap.
 */
export function allianceSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const FUNDS_ICON = '/alliance-icons/funds.webp';

/**
 * The same fold scripts/build-operator-deploy.mjs uses, so a name looked up here and a
 * name resolved there agree. Punctuation that joins rather than separates is dropped
 * (Ch'en, Wis'adel), then the letters no NFD decomposition covers.
 */
const LETTERS: Record<string, string> = {
  'ł': 'l', 'đ': 'd', 'ƀ': 'b', 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'ð': 'd', 'þ': 'th',
};

export function foldName(text: string): string {
  return String(text)
    .toLowerCase()
    .replace(/['\u2019\u02bc.]/g, '')
    .replace(/[łđƀøæœßðþ]/g, (c) => LETTERS[c] || c)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Mirrors slug() in scripts/build-stronghold-icons.mjs, LETTERS included: NFD splits an
 *  accent off its base letter but leaves ł alone, which turned Młynar into "m-ynar". */
export function stratagemSlug(leader: string): string {
  return leader
    .toLowerCase()
    .replace(/[łđƀøæœßðþ]/g, (c) => LETTERS[c] || c)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
