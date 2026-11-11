/** Only explicit claim records are imported. Progress/eligibility is not a claim. */
export interface RewardClaims { known: string[]; claimed: string[] }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const validId = (id: string) => /^[a-zA-Z0-9_:-]{1,180}$/.test(id);

/** missionIds: the programme's own missions (open_server_table), absent from an older map. */
export interface BeginnerProgram { id: string; startTs: number; endTs?: number; missionIds?: readonly string[] }

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
  const groups = object(mission.missionGroups);
  for (const [id, value] of Object.entries(groups)) {
    if (id.startsWith('guide_') && (value === 0 || value === 1)) put(id, value === 1);
  }
  // A beginner programme's missions are one mission group, named by the programme's id
  // (openseverTaskGroup1), and MissionGroupState marks it Complete (1) once the group is done.
  // Read as all four collected: an inference from the schema, not yet seen in a real veteran
  // save (docs/development/reward-import-coverage.md). It settles the programme's missions when
  // an older account's OPENSERVER records are gone. Uncomplete (0) says nothing a mission's own
  // state does not, so it adds no unclaimed marks.
  for (const program of programs) {
    if (typeof program.id === 'string' && validId(program.id) && groups[program.id] === 1 && Array.isArray(program.missionIds)) {
      for (const id of program.missionIds.slice(0, 50)) if (typeof id === 'string') put(id, true);
    }
  }
  const checkIn = object(user.checkIn);
  for (const [id, value] of Object.entries(object(checkIn.longTermRecvRecord))) {
    if (value === 0 || value === 1) put(id, value === 1);
  }
  // The monthly sign-in's checkInHistory flags a day signed in with 1. Not canCheckIn,
  // nowIndex, level or elapsed days.
  const history = (prefix: unknown, value: unknown) => {
    if (typeof prefix !== 'string' || !validId(prefix) || !Array.isArray(value) || value.length > 1000) return;
    value.forEach((flag, index) => { if (flag === 0 || flag === 1) put(`${prefix}:${index + 1}`, flag === 1); });
  };
  /* An event's or a beginner programme's sign-in history is the other way round: an entry per
     day unlocked so far, 1 while that day's reward is waiting to be claimed and 0 once it has
     been. Read as received-when-1, an active player's save showed all 7 days of the
     Celebration Login Event unclaimed (owner's import, 2026-10-22: 7 known, 0 claimed), and
     the beginner days likewise. A day not yet unlocked has no entry, so it stays unknown. */
  const waiting = (prefix: unknown, value: unknown) => {
    if (typeof prefix !== 'string' || !validId(prefix) || !Array.isArray(value) || value.length > 1000) return;
    value.forEach((flag, index) => { if (flag === 0 || flag === 1) put(`${prefix}:${index + 1}`, flag === 0); });
  };
  history(checkIn.checkInGroupId, checkIn.checkInHistory);
  const activity = object(user.activity);
  for (const type of ['CHECKIN_ONLY', 'CHECKIN_ALL_PLAYER', 'CHECKIN_VIDEO']) {
    for (const [id, value] of Object.entries(object(activity[type]))) waiting(id, object(value).history);
  }
  // The Monthly Card check-in counts the days claimed, from day 1: rewardsCount of them are
  // (the owner's save, 2026-10-22: 13). The days after are not yet known either way.
  for (const [id, value] of Object.entries(object(activity.CHECKIN_ACCESS))) {
    const claimed = object(value).rewardsCount;
    if (typeof claimed === 'number' && Number.isInteger(claimed) && claimed >= 0 && claimed <= 62) for (let day = 1; day <= claimed; day += 1) put(`${id}:${day}`, true);
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
    waiting(`${program.id}:checkInData`, object(starter.checkIn).history);
    waiting(`${program.id}:chainLoginData`, object(starter.chainLogin).history);
  }
  // Internal result of the read-only mailbox import, already matched to this one gift.
  const mail = parseRewardClaims(user.arkpediaMailClaims);
  if (mail?.known.includes('free:welcome-mail')) states.set('free:welcome-mail', mail.claimed.includes('free:welcome-mail'));
  return { known: [...states.keys()].sort(), claimed: [...states].filter(([, claimed]) => claimed).map(([id]) => id).sort() };
}

/* Claims an import stored. A long-played account's save holds many thousands of mission and
   sign-in records; an earlier cap of 10,000 ids, and one bad id, each threw the whole list away,
   so nothing an import proved was ticked. Now the cap is generous and a bad id is dropped alone. */
const MAX_CLAIM_IDS = 200000;
export function parseRewardClaims(value: unknown): RewardClaims | undefined {
  const record = object(value);
  if (!Array.isArray(record.known) || !Array.isArray(record.claimed)) return undefined;
  const ids = (list: unknown[]) => list.slice(0, MAX_CLAIM_IDS).filter((id): id is string => typeof id === 'string' && id.startsWith('free:') && validId(id));
  const known = new Set(ids(record.known));
  return { known: [...known], claimed: [...new Set(ids(record.claimed))].filter(id => known.has(id)) };
}

/** Update imported claims. The progress merger preserves manual marks separately. */
export function mergeRewardClaims(manual: readonly string[], claims?: RewardClaims): string[] {
  const known = new Set(claims?.known);
  return [...new Set([...manual.filter(id => !known.has(id)), ...(claims?.claimed ?? [])])];
}
