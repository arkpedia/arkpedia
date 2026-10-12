/** Only explicit claim records are imported. Progress/eligibility is not a claim. */
export interface RewardClaims { known: string[]; claimed: string[] }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const validId = (id: string) => /^[a-zA-Z0-9_:-]{1,180}$/.test(id);

export function rewardClaimsFromGame(user: Record<string, unknown>): RewardClaims {
  const states = new Map<string, boolean>();
  const put = (id: string, claimed: boolean) => { if (validId(id)) states.set(`free:${id}`, claimed); };
  const mission = object(user.mission);
  const missions = object(mission.missions);
  // Game mission states: 2 is available/in progress; 3 is collected.
  for (const type of ['GUIDE', 'MAIN', 'SUB', 'OPENSERVER']) {
    for (const [id, value] of Object.entries(object(missions[type]))) {
      const state = object(value).state;
      if (typeof state === 'number' && Number.isInteger(state) && state >= 0 && state <= 3) put(id, state === 3);
    }
  }
  for (const [id, value] of Object.entries(object(mission.missionGroups))) {
    if (id.startsWith('guide_') && (value === 0 || value === 1)) put(id, value === 1);
  }
  for (const [id, value] of Object.entries(object(object(user.checkIn).longTermRecvRecord))) {
    if (value === 0 || value === 1) put(id, value === 1);
  }
  return { known: [...states.keys()].sort(), claimed: [...states].filter(([, claimed]) => claimed).map(([id]) => id).sort() };
}

export function parseRewardClaims(value: unknown): RewardClaims | undefined {
  const record = object(value);
  const ids = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 10000 && value.every(id => typeof id === 'string' && id.startsWith('free:') && validId(id));
  if (!ids(record.known) || !ids(record.claimed)) return undefined;
  const known = new Set(record.known);
  return { known: [...known], claimed: [...new Set(record.claimed)].filter(id => known.has(id)) };
}

/** Reimport replaces known claims but keeps manual marks for unsupported reward records. */
export function mergeRewardClaims(manual: readonly string[], claims?: RewardClaims): string[] {
  const known = new Set(claims?.known);
  return [...new Set([...manual.filter(id => !known.has(id)), ...(claims?.claimed ?? [])])];
}
