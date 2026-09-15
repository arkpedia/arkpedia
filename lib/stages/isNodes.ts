/**
 * What an Integrated Strategies node's own level path says about it.
 *
 * The game codes 400 of the 525 nodes "ISW-NO" and the other 125 with three more
 * prefixes, so a code tells you a node's category and nothing else. Its level path
 * does: `level_rogue1_3-2` is node 2 of floor 3.
 *
 * These read a slug, which is why they are here rather than in the pipeline: the
 * slug is this site's own name for the level, assembled by scripts/stage-pipeline.
 * Both were sitting in pages/stages/content/[id].tsx, where the rail and any other
 * caller could not reach them.
 */
/**
 * The floor an Integrated Strategies node sits on, from its slug.
 *
 * An IS level path ends in <group>-<index>, and the group is the floor for
 * ordinary combat nodes: level_rogue1_3-2 is the second node built for floor 3.
 * The rest name a category the dataset does not translate anywhere -- b, ev, t,
 * sv, fs, d, dv -- so they are grouped together rather than labelled by guess.
 * (b is 84/94 boss nodes, which is a strong hint and still a guess.)
 */
export function isFloor(slug: string): number | null {
  const at = /_level_rogue\d+_([a-z0-9]+)-\d+/.exec(slug);
  if (!at) return null;
  return /^\d+$/.test(at[1]) ? Number(at[1]) : null;
}

/**
 * An Integrated Strategies node's own token: level_rogue1_3-2 is node 2 of floor 3.
 *
 * NOT the card's front. The game's own code goes there, the way it does for every
 * other stage on the site -- ISW-NO, ISW-DF, ISW-SP, ISW-DU are what the game prints
 * on these, and printing a token instead made the same season read two ways at once
 * (the nodes whose level path this matched showed 1-1, the DLC cuts beside them
 * showed ISW-NO). It sits beside the code as the thing that tells two ISW-NO nodes
 * apart, and it is what a search of the season matches on.
 */
export function isNodeCode(slug: string): string | null {
  // (?:^|_) because one node's slug IS its level path with nothing in front of it:
  // level_rogue4_b-9 has neither a code nor a name in the table, so it had nothing
  // to disambiguate it with and printed its whole slug on the card.
  const at = /(?:^|_)level_rogue\d+_([a-z0-9]+-\d+(?:-[a-z0-9]+)?)$/.exec(slug);
  return at ? at[1] : null;
}
