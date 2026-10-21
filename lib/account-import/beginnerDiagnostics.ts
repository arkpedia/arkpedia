/**
 * What an imported save holds of the fields the Reward Tracker reads its beginner rewards from
 * (lib/account/rewardClaims.ts), for the Copy diagnostics report: enough to tell why a beginner
 * row did or did not tick, and nothing that identifies the account. Four facts only:
 *   - each beginner programme's mission group (mission.missionGroups.openseverTaskGroupN), its value;
 *   - the beginner missions (mission.missions.OPENSERVER), by the game's mission id, their states;
 *   - the beginner sign-ins (openServer.checkIn / chainLogin): isAvailable and history length;
 *   - whether the account registered before the 2024-12-03 programme changeover.
 * Never a name, UID, timestamp, history value or any other field of the save.
 */
export interface BeginnerDiagnostics {
  /** Each openseverTaskGroupN the save sets, and its value; {} when it sets none. */
  programmeGroups: Record<string, number>;
  /** OPENSERVER mission id -> state; null when the save has no OPENSERVER block. */
  openServerMissions: Record<string, number> | null;
  checkIn: SignIn | null;
  chainLogin: SignIn | null;
  registered: 'before-2024-12-03' | 'on-or-after-2024-12-03' | 'unknown';
}
interface SignIn { isAvailable: boolean | null; historyLength: number | null }

/** The newer programme's start (open_server_table schedule, openseverTaskGroup2.startTs). */
const CHANGEOVER = 1733227200;
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const small = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= -1 && value <= 99 ? value : null;

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
  };
}
