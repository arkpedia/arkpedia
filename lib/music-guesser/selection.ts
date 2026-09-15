import { normalizeTitle } from './game';
import type { AnswerMode, ClipStartPosition, SongChoice, SongConnection } from './game';

export const MUSIC_CATEGORIES = [
  ['events', 'Events'], ['mini', 'Mini-events'], ['story', 'Main story'],
  ['cc', 'Contingency Contract'], ['eps', 'Character EPs'], ['other', 'Other releases'],
] as const;
export interface MusicGroup {
  id: string;
  name: string;
  kind: typeof MUSIC_CATEGORIES[number][0];
  search?: string;
  // Undefined: non-game release, outside the CN event filter. Null: no
  // confirmed Global release. Dates are confirmed calendar release dates.
  globalRelease?: string | null;
}
export interface MusicSettings {
  mode: AnswerMode;
  startPosition: ClipStartPosition;
  includeCn: boolean;
  excluded: string[];
}
export const DEFAULT_MUSIC_SETTINGS: MusicSettings = { mode: 'all', startPosition: 'beginning', includeCn: false, excluded: [] };
export const MUSIC_SETTINGS_KEY = 'arkpedia-song-guesser-settings-v1';

export function connectionGroupId(connection: SongConnection): string {
  if (connection.chapter !== undefined) return `story:${connection.chapter}`;
  if (connection.cc) return `cc:${connection.cc.series}:${connection.cc.number}`;
  return `${connection.kind === 'vignette' ? 'mini' : 'events'}:${normalizeTitle(connection.names[0])}`;
}

export function isGlobalGroup(group: MusicGroup, asOf: string): boolean {
  return group.globalRelease === undefined || Boolean(group.globalRelease && group.globalRelease <= asOf);
}

export function selectMusic(songs: SongChoice[], groups: MusicGroup[], settings: MusicSettings, asOf: string): SongChoice[] {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const excluded = new Set(settings.excluded);
  const enabled = new Set(groups.filter((group) => !excluded.has(group.id) && (settings.includeCn || isGlobalGroup(group, asOf))).map((group) => group.id));
  return songs.filter((song) => song.groupIds?.some((id) => enabled.has(id))).map((song) => {
    // Reused music can remain playable through another selected event. Keep
    // disabled/CN-only event names out of autocomplete and the reveal as well.
    const { connections, ep, releaseNames: _releaseNames, ...rest } = song;
    const releaseNames = (song.groupIds || []).filter((id) => enabled.has(id)).flatMap((id) => {
      const group = groupById.get(id);
      return group && ['events', 'mini', 'story'].includes(group.kind) ? [group.name] : [];
    });
    const selectedConnections = connections?.filter((connection) => enabled.has(connectionGroupId(connection)));
    return { ...rest, ...(releaseNames.length ? { releaseNames } : {}), ...(selectedConnections?.length ? { connections: selectedConnections } : {}),
      ...(ep && song.groupIds?.some((id) => id.startsWith('eps:') && enabled.has(id)) ? { ep } : {}) };
  });
}

export function readMusicSettings(raw: string | null, groups: MusicGroup[]): MusicSettings {
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || typeof value !== 'object') return { ...DEFAULT_MUSIC_SETTINGS, excluded: [] };
    const known = new Set(groups.map((group) => group.id));
    return {
      mode: 'all',
      startPosition: value.startPosition === 'random' || value.startPosition === 'middle' ? value.startPosition : 'beginning',
      includeCn: value.includeCn === true,
      excluded: Array.isArray(value.excluded) ? [...new Set(value.excluded.filter((id: unknown): id is string => typeof id === 'string' && known.has(id)))] as string[] : [],
    };
  } catch { return { ...DEFAULT_MUSIC_SETTINGS, excluded: [] }; }
}
