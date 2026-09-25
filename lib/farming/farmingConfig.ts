/*
 * The farming guide's wording. Its content -- which stages to run for each material, 31
 * materials over three tiers -- is data/farming-tiers.json, a game record published with
 * the content release: /farming and the planner read it from their props
 * (__contentTables['farming-tiers']), so a new material or a better stage needs a data
 * edit in arkpedia-data, not a redeploy.
 */

export const TIER_1_2_FOOTNOTE =
  "Apart from Orirock Cubes, avoid farming Tier 1 and Tier 2 materials. Farm only when urgently required.";

export const LEGEND: { kind: 'efficient' | 'focused' | 'alternative' | 'eventActive'; label: string; rest: string }[] = [
  {
    kind: 'eventActive',
    label: 'Farming stages',
    rest: 'should be farmed actively during an ongoing event to also obtain event currency.',
  },
  {
    kind: 'efficient',
    label: 'Efficient stages',
    rest: 'save sanity in the long run through side drops.',
  },
  {
    kind: 'focused',
    label: 'Focused stages',
    rest: 'are slightly less sanity efficient, but have a higher drop rate for the featured resource. Best for if you don\'t care about most side drops.',
  },
  {
    kind: 'alternative',
    label: 'Alternative stages',
    rest: 'should be farmed sparingly. Farm strictly what is necessary until you unlock a better stage.',
  },
];
