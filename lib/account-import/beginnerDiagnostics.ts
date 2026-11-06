/**
 * What an imported save holds of the fields the Reward Tracker reads its beginner rewards from
 * (lib/account/rewardClaims.ts), for the Copy diagnostics report: enough to tell why a beginner
 * row did or did not tick, and nothing that identifies the account. Four facts only:
 *   - each beginner programme's mission group (mission.missionGroups.openseverTaskGroupN), its value;
 *   - the beginner missions (mission.missions.OPENSERVER), by the game's mission id, their states;
 *   - the beginner sign-ins (openServer.checkIn / chainLogin): isAvailable and history length;
 *   - whether the account registered before the 2024-12-03 programme changeover.
 * and, under `sources`, counts for every other claim source (missions by type and state, event
 * sign-ins by the game's activity id, the monthly sign-in, Record Restoration).
 * Paradox diagnostics add state/count flags for six fixed public stage IDs.
 * Never a name, UID, timestamp, history value or any other field of the save; the only ids are
 * the game's own (mission types, activity ids, fixed stage ids).
 */
export interface BeginnerDiagnostics {
  /** Each openseverTaskGroupN the save sets, and its value; {} when it sets none. */
  programmeGroups: Record<string, number>;
  /** OPENSERVER mission id -> state; null when the save has no OPENSERVER block. */
  openServerMissions: Record<string, number> | null;
  checkIn: SignIn | null;
  chainLogin: SignIn | null;
  registered: 'before-2024-12-03' | 'on-or-after-2024-12-03' | 'unknown';
  /** Every other place the Reward Tracker reads a claim from (lib/account/rewardClaims.ts), as
   *  counts: why a main-story mission or an event sign-in did or did not tick. */
  sources: ClaimSources;
}
/** Mission states by count (0..3; 3 is collected). */
type States = Record<string, number>;
interface ClaimSources {
  /** mission.missions[type]: how many missions the save keeps, by state. */
  missions: Record<string, { count: number; states: States }>;
  /** The activity blocks the save has, by type name, and how many activities each holds. */
  activityTypes: Record<string, number>;
  /** Event sign-ins (CHECKIN_ONLY / CHECKIN_ALL_PLAYER) by the game's activity id: days, days received. */
  eventSignIns: Record<string, { days: number; received: number }>;
  /** LOGIN_ONLY rewards by activity id: whether the save says received (1), not (0), or neither. */
  loginOnly: Record<string, number | null>;
  /** The monthly sign-in: days in its history, days received, and the long-term records kept. */
  monthly: { days: number; received: number; longTermRecords: number } | null;
  /** Record Restoration: stories with a trail record, and rewards received across them. */
  retroTrail: { stories: number; received: number };
  /** Bounded handbook completion evidence; only fixed public stage IDs and numeric flags. */
  paradox?: { stages: number; states: States; samples: Record<string, { state: number | null; completeTimes: number | null; hasFts: boolean; hasRts: boolean }> };
  /** Count-only mailbox result; no subject, contents, recipient or mail identifiers. */
  mail?: { status: 'read' | 'unavailable'; retained: number; welcome: 'claimed' | 'unclaimed' | 'unknown' };
}
interface SignIn { isAvailable: boolean | null; historyLength: number | null }

/** The newer programme's start (open_server_table schedule, openseverTaskGroup2.startTs). */
const CHANGEOVER = 1733227200;
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const small = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= -1 && value <= 99 ? value : null;

const GAME_ID = /^[A-Za-z0-9_]{1,48}$/;
const flags = (value: unknown) => Array.isArray(value) ? { days: Math.min(value.length, 999), received: value.filter((flag) => flag === 1).length } : null;

function claimSources(user: Record<string, unknown>): ClaimSources {
  const missions: ClaimSources['missions'] = {};
  for (const [type, block] of Object.entries(object(object(user.mission)?.missions) ?? {}).slice(0, 30)) {
    if (!GAME_ID.test(type)) continue;
    const states: States = {};
    const rows = Object.values(object(block) ?? {});
    for (const row of rows) { const state = String(small(object(row)?.state) ?? -1); states[state] = (states[state] ?? 0) + 1; }
    missions[type] = { count: rows.length, states };
  }
  const activity = object(user.activity) ?? {};
  const activityTypes: Record<string, number> = {};
  for (const [type, block] of Object.entries(activity).slice(0, 80)) if (GAME_ID.test(type)) activityTypes[type] = Object.keys(object(block) ?? {}).length;
  const eventSignIns: ClaimSources['eventSignIns'] = {};
  for (const type of ['CHECKIN_ONLY', 'CHECKIN_ALL_PLAYER']) {
    for (const [id, value] of Object.entries(object(activity[type]) ?? {}).slice(0, 40)) {
      const counted = flags(object(value)?.history);
      if (GAME_ID.test(id) && counted) eventSignIns[id] = counted;
    }
  }
  const loginOnly: ClaimSources['loginOnly'] = {};
  for (const [id, value] of Object.entries(object(activity.LOGIN_ONLY) ?? {}).slice(0, 40)) {
    const received = object(value)?.reward;
    if (GAME_ID.test(id)) loginOnly[id] = received === 0 || received === 1 ? received : null;
  }
  const checkIn = object(user.checkIn);
  const history = flags(checkIn?.checkInHistory);
  const trail = Object.values(object(object(user.retro)?.trail) ?? {}).slice(0, 200);
  const addon = object(object(user.troop)?.addon);
  const paradox: NonNullable<ClaimSources['paradox']> = { stages: 0, states: {}, samples: {} };
  const sampleIds = new Set(['mem_skgoat_1', 'mem_strong_1', 'mem_crow_1', 'mem_malist_1', 'mem_cgbird_1', 'mem_tomimi_1']);
  for (const row of Object.values(addon ?? {}).slice(0, 2000)) {
    for (const [id, value] of Object.entries(object(object(row)?.stage) ?? {}).slice(0, 20)) {
      const stage = object(value);
      if (!stage) continue;
      paradox.stages++;
      const state = small(stage.state);
      paradox.states[String(state ?? -1)] = (paradox.states[String(state ?? -1)] ?? 0) + 1;
      if (sampleIds.has(id)) paradox.samples[id] = { state, completeTimes: small(stage.completeTimes),
        hasFts: typeof stage.fts === 'number' && Number.isFinite(stage.fts) && stage.fts > 0,
        hasRts: typeof stage.rts === 'number' && Number.isFinite(stage.rts) && stage.rts > 0 };
    }
  }
  return {
    missions, activityTypes, eventSignIns, loginOnly,
    monthly: checkIn ? { days: history?.days ?? 0, received: history?.received ?? 0, longTermRecords: Object.keys(object(checkIn.longTermRecvRecord) ?? {}).length } : null,
    retroTrail: { stories: trail.length, received: trail.reduce<number>((sum, rewards) => sum + Object.values(object(rewards) ?? {}).filter((flag) => flag === 1).length, 0) },
    ...(addon ? { paradox } : {}),
    ...(() => {
      const mail = object(user.arkpediaMailStatus), claims = object(user.arkpediaMailClaims);
      if (!mail || (mail.status !== 'read' && mail.status !== 'unavailable')) return {};
      return { mail: { status: mail.status, retained: typeof mail.retained === 'number' && Number.isSafeInteger(mail.retained) && mail.retained >= 0 && mail.retained <= 500 ? mail.retained : 0,
        welcome: Array.isArray(claims?.known) && claims.known.includes('free:welcome-mail') ? Array.isArray(claims?.claimed) && claims.claimed.includes('free:welcome-mail') ? 'claimed' as const : 'unclaimed' as const : 'unknown' as const } };
    })(),
  };
}

export function beginnerDiagnostics(user: Record<string, unknown>): BeginnerDiagnostics {
  const mission = object(user.mission);
  const programmeGroups: Record<string, number> = {};
  for (const [id, value] of Object.entries(object(mission?.missionGroups) ?? {})) {
    const state = small(value);
    if (/^openseverTaskGroup\d{1,3}$/.test(id) && state !== null) programmeGroups[id] = state;
  }
  const openServer = object(object(mission?.missions)?.OPENSERVER);
  const openServerMissions = openServer ? Object.fromEntries(Object.entries(openServer)
    .filter(([id]) => /^openserver_\d{1,3}(_\d{1,3})?$/.test(id)).slice(0, 20)
    .map(([id, value]) => [id, small(object(value)?.state) ?? -1])) : null;
  const signIn = (value: unknown): SignIn | null => {
    const block = object(value);
    if (!block) return null;
    return { isAvailable: typeof block.isAvailable === 'boolean' ? block.isAvailable : null,
      historyLength: Array.isArray(block.history) ? Math.min(block.history.length, 999) : null };
  };
  const starter = object(user.openServer);
  const registerTs = object(user.status)?.registerTs;
  return {
    programmeGroups, openServerMissions, checkIn: signIn(starter?.checkIn), chainLogin: signIn(starter?.chainLogin),
    registered: typeof registerTs === 'number' && Number.isSafeInteger(registerTs) && registerTs > 0
      ? registerTs < CHANGEOVER ? 'before-2024-12-03' : 'on-or-after-2024-12-03' : 'unknown',
    sources: claimSources(user),
  };
}
