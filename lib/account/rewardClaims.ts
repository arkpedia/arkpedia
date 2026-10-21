/** Only explicit claim records are imported. Progress/eligibility is not a claim. */
export interface RewardClaims { known: string[]; claimed: string[] }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const validId = (id: string) => /^[a-zA-Z0-9_:-]{1,180}$/.test(id);

export interface BeginnerProgram { id: string; startTs: number; endTs?: number }

export function rewardClaimsFromGame(user: Record<string, unknown>, programs: readonly BeginnerProgram[] = []): RewardClaims {
  const states = new Map<string, boolean>();
  const put = (id: string, claimed: boolean) => { if (validId(id)) states.set(`free:${id}`, claimed); };
  const mission = object(user.mission);
  const missions = object(mission.missions);
  // Game mission states (MissionHoldingState): 2 is completed, not yet collected; 3 is collected.
  // ACTIVITY and RETRO hold the welfare operators' missions (an event's, and a main-story
  // event's permanent ones: Viy's act4mainssPermanent_5), keyed by mission id as the catalogue is.
  for (const type of ['GUIDE', 'MAIN', 'SUB', 'OPENSERVER', 'ACTIVITY', 'RETRO']) {
    for (const [id, value] of Object.entries(object(missions[type]))) {
      const state = object(value).state;
      if (typeof state === 'number' && Number.isInteger(state) && state >= 0 && state <= 3) put(id, state === 3);
    }
  }
  for (const [id, value] of Object.entries(object(mission.missionGroups))) {
    if (id.startsWith('guide_') && (value === 0 || value === 1)) put(id, value === 1);
  }
  const checkIn = object(user.checkIn);
  for (const [id, value] of Object.entries(object(checkIn.longTermRecvRecord))) {
    if (value === 0 || value === 1) put(id, value === 1);
  }
  // These are received flags, not canCheckIn, nowIndex, level or elapsed days.
  const history = (prefix: unknown, value: unknown) => {
    if (typeof prefix !== 'string' || !validId(prefix) || !Array.isArray(value) || value.length > 1000) return;
    value.forEach((flag, index) => { if (flag === 0 || flag === 1) put(`${prefix}:${index + 1}`, flag === 1); });
  };
  history(checkIn.checkInGroupId, checkIn.checkInHistory);
  const activity = object(user.activity);
  for (const type of ['CHECKIN_ONLY', 'CHECKIN_ALL_PLAYER']) {
    for (const [id, value] of Object.entries(object(activity[type]))) history(id, object(value).history);
  }
  for (const [id, value] of Object.entries(object(activity.LOGIN_ONLY))) {
    const received = object(value).reward;
    if (received === 0 || received === 1) put(id, received === 1);
  }
  // Record Restoration: retro.trail[retro id][trail reward id], 1 once received. The reward ids
  // repeat between stories, so the catalogue keys them by both (build-free-rewards.mjs).
  for (const [retroId, rewards] of Object.entries(object(object(user.retro).trail)).slice(0, 200)) {
    for (const [id, value] of Object.entries(object(rewards)).slice(0, 50)) if (value === 0 || value === 1) put(`trail:${retroId}:${id}`, value === 1);
  }
  const levelPacks = object(object(object(user.shop).GP).level).info;
  if (Array.isArray(levelPacks)) for (const value of levelPacks.slice(0, 1000)) {
    const { id, count } = object(value);
    if (typeof id === 'string' && id.startsWith('GP_freeL_') && typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) put(id, count > 0);
  }
  // The server's beginner history carries no programme ID. Resolve it from the
  // Global schedule and registration time; an old/unknown programme stays unknown.
  const registered = object(user.status).registerTs;
  const program = typeof registered === 'number' && Number.isSafeInteger(registered) && registered > 0 ? programs.filter(row => typeof row.id === 'string' && validId(row.id)
    && Number.isSafeInteger(row.startTs) && row.startTs <= registered
    && (row.endTs === undefined || Number.isSafeInteger(row.endTs) && registered <= row.endTs)).sort((a, b) => b.startTs - a.startTs)[0] : undefined;
  if (program) {
    const starter = object(user.openServer);
    history(`${program.id}:checkInData`, object(starter.checkIn).history);
    history(`${program.id}:chainLoginData`, object(starter.chainLogin).history);
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

/** Update imported claims. The progress merger preserves manual marks separately. */
export function mergeRewardClaims(manual: readonly string[], claims?: RewardClaims): string[] {
  const known = new Set(claims?.known);
  return [...new Set([...manual.filter(id => !known.has(id)), ...(claims?.claimed ?? [])])];
}
