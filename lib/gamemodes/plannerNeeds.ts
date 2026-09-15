/**
 * What each enemy pool asks of a squad, as a phrase rather than as a shopping list.
 *
 * This used to be a rule with a count and a predicate -- "wants 2 operators that can
 * hit air" -- and the companion would rank the roster against it and offer six. That
 * was the wrong shape of answer twice over: the pools are drawn, not chosen, so the
 * requirement is a fact about the run rather than a list to satisfy, and satisfying it
 * by tier order spent slots proving the warning had been read.
 *
 * So it is a label now. The pool tile carries it, the player knows what the fight
 * needs, and what they put in the squad is theirs to decide.
 *
 * Keyed by the tail of the pool's name, since the groups are filed as
 * "Tactical Training/Flying". Special and Refraction have no entry: no requirement is
 * claimed for a pool nobody has settled one for, and a blank subscript is the honest
 * way to say so.
 */
export const POOL_NEEDS: Record<string, string> = {
  Flying: 'Needs anti-air',
  Frequency: 'Needs multi-target or poison',
  Elements: 'Needs elemental healing',
  Continuous: 'Needs healing',
  Invisible: 'Needs block',
};

export const poolTail = (group: string) => group.split('/').pop() ?? group;
