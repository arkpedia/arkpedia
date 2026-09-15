// Some faction names in the source data are conceptually the same
// group despite being distinct literal strings -- Yan-Lungmen
// operators are Yan-descended/affiliated, but "Yan-Lungmen" and "Yan"
// never literally equal each other, so a plain string match would
// treat them as unrelated. This is the single place that knows about
// that link, so the roster filter and both synergy surfaces (the
// dedicated /synergies page and each operator's own synergy section)
// stay consistent with each other rather than drifting apart if the
// same fix got hand-rolled in three places.
//
// Each inner array lists names that should be treated as mutually
// equivalent -- the relationship is symmetric: filtering by "Yan"
// pulls in Yan-Lungmen operators, and a Yan-Lungmen operator's own
// synergy section pulls in "Yan" operators too, not just one
// direction of the link.
const FACTION_EQUIVALENCE_GROUPS: string[][] = [['Yan', 'Yan-Lungmen']];

/** Every name that should be treated as equivalent to `faction` for
 * matching purposes, including itself. Returns just [faction] if it's
 * not part of any known equivalence group. */
export function expandFactionAliases(faction: string): string[] {
  const group = FACTION_EQUIVALENCE_GROUPS.find((g) => g.includes(faction));
  return group || [faction];
}

/** True if `op` belongs to `targetFaction` in ANY of its three tiers
 * (main/umbrella/connected), accounting for known faction
 * equivalences (see above). This is the one function the roster
 * filter and both synergy surfaces should all call, rather than each
 * re-implementing the same three-tier check with its own (possibly
 * inconsistent) handling of equivalences. */
export function operatorBelongsToFaction(
  op: { faction: string | null; umbrellaFactions?: string[]; connectedFactions?: string[] },
  targetFaction: string
): boolean {
  const equivalents = expandFactionAliases(targetFaction);
  return equivalents.some(
    (f) => op.faction === f || (op.umbrellaFactions || []).includes(f) || (op.connectedFactions || []).includes(f)
  );
}