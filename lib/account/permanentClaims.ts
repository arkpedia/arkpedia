/**
 * Which permanent-mode rewards a save says are claimed (lib/planner/farmingMethod.ts counts the rest).
 *
 * The ids are the ones data/permanent-rewards.json lists (scripts/build/build-permanent-rewards.mjs),
 * prefixed by their mode: `is-2:bp_level_4`, `sss:tower_season1_3`.
 *  - Integrated Strategies: the milestone track, `rlv2.outer[rogue_N].bp.reward`, an entry per level
 *    claimed. The field is read as the docs (docs/development/game-server-reads.md) place it, and has
 *    not been checked against a real save yet: the planner says so on the page.
 *  - Stationary Security Service: the season missions are ordinary missions, collected at state 3
 *    (MissionHoldingState, as rewardClaims.ts reads the others), whatever mission type holds them.
 *  - Reclamation Algorithm: nothing is read. Its challenge days and base levels have no claim field this
 *    code has seen, so they count in full until one is found.
 *
 * `modes` lists the modes the save had a record for. A mode not in it is counted in full, and the page
 * names which those are, so a missing record is never read as everything claimed.
 */
export interface PermanentClaims { modes: string[]; claimed: string[] }

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const validId = (id: string) => /^[a-zA-Z0-9_:-]{1,120}$/.test(id);
const MAX_IDS = 5000;

export function permanentClaimsFromGame(user: Record<string, unknown>): PermanentClaims {
  const modes: string[] = [];
  const claimed = new Set<string>();
  const outer = object(object(user.rlv2).outer);
  for (let n = 1; n <= 12; n += 1) {
    const theme = outer[`rogue_${n}`];
    if (!theme || typeof theme !== 'object') continue;
    modes.push(`is-${n}`);
    for (const [id, value] of Object.entries(object(object(object(theme).bp).reward)).slice(0, MAX_IDS)) {
      if (value && validId(id)) claimed.add(`is-${n}:${id}`);
    }
  }
  let sss = Object.keys(object(object(user.tower).outer)).length > 0;
  for (const byId of Object.values(object(object(user.mission).missions))) {
    for (const [id, value] of Object.entries(object(byId)).slice(0, MAX_IDS)) {
      if (!id.startsWith('tower_season') || !validId(id)) continue;
      sss = true;
      if (object(value).state === 3) claimed.add(`sss:${id}`);
    }
  }
  if (sss) modes.push('sss');
  return { modes, claimed: [...claimed].sort() };
}

/** A stored record is untrusted: anything else is no claims, never a throw. */
export function parsePermanentClaims(value: unknown): PermanentClaims | undefined {
  const record = object(value);
  if (!Array.isArray(record.modes) || !Array.isArray(record.claimed)) return undefined;
  const modes = record.modes.filter((id): id is string => typeof id === 'string' && /^[a-z]{2,4}(-\d{1,2})?$/.test(id)).slice(0, 40);
  const claimed = record.claimed.filter((id): id is string => typeof id === 'string' && validId(id)).slice(0, MAX_IDS * 4);
  return { modes: [...new Set(modes)], claimed: [...new Set(claimed)] };
}
