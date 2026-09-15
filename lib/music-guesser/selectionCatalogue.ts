// Server-only: project small group labels/dates, not the event calendar or albums.
import albums from '@/data/albums.json';
import stageContent from '@/data/stages-content.json';
import { loadAllEventYears } from '@/lib/events/loadEventsData';
import { isInstrumentalVersion, normalizeTitle } from './game';
import type { SongChoice } from './game';
import { connectionGroupId } from './selection';
import type { MusicGroup } from './selection';

interface EventRelease { name: string; global?: { dateRange?: string | null; note?: string | null } | null }
export function eventKey(name: string): string {
  return normalizeTitle(name.replace(/^\[[^\]]*\]\s*/, '').replace(/\brerun\b/gi, ''));
}
export function confirmedRelease(event: EventRelease): string | null {
  if (/estimat|predict|unconfirmed|not.*confirm/i.test(event.global?.note || '')) return null;
  const match = event.global?.dateRange?.match(/^\s*(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!match) return null;
  const date = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(date) ? date : null;
}

export function getMusicSelectionCatalogue(songs: SongChoice[]): { songs: SongChoice[]; groups: MusicGroup[] } {
  songs = songs.filter((song) => !isInstrumentalVersion(song));
  const releases = new Map<string, string>();
  const remember = (name: string, date: string | null) => {
    const key = eventKey(name), previous = releases.get(key);
    if (date && (!previous || date < previous)) releases.set(key, date);
  };
  for (const event of loadAllEventYears() as EventRelease[]) remember(event.name, confirmedRelease(event));
  // The stage index contains Global release dates for launch chapters and
  // older events missing from the calendar (e.g. Ancient Forge).
  for (const stage of Object.values(stageContent)) remember(stage.name, stage.release_date);
  // Calendar still labels this estimated, but the official Global announcement
  // and event record confirm the release: https://arknights.global/news
  // https://arknights.wiki.gg/wiki/Crossing (2026-08-13).
  remember('Crossing', '2026-08-13');
  const releaseFor = (names: string[]) => names.map((name) => releases.get(eventKey(name))).filter((date): date is string => Boolean(date)).sort()[0] || null;
  const groups = new Map<string, MusicGroup>();
  const namesToGroup = new Map<string, string>();
  for (const song of songs) for (const connection of song.connections || []) {
    const id = connectionGroupId(connection);
    const names = connection.cc ? connection.names.flatMap((name) => [name, `Contingency Contract ${name}`]) : connection.names;
    const group: MusicGroup = {
      id, name: connection.cc ? `${connection.cc.series.toUpperCase()}${connection.cc.number}: ${connection.names[0]}` : connection.names[0],
      kind: connection.chapter !== undefined ? 'story' : connection.cc ? 'cc' : connection.kind === 'vignette' ? 'mini' : 'events',
      globalRelease: releaseFor(names),
      search: connection.names.join(' '),
    };
    groups.set(id, group);
    for (const name of names) namesToGroup.set(eventKey(name), id);
  }
  const albumGroups = new Map<string, string[]>();
  const songsById = new Map(songs.map((song) => [song.id, song]));
  for (const album of albums) {
    const isEp = album.albumCategory.includes('Operator EP');
    const title = album.albumAltName || album.albumName;
    const related = isEp ? [] : [...new Set([title.replace(/\s*OST\s*\d*$/i, '')]
      .map((name) => namesToGroup.get(eventKey(name))).filter((id): id is string => Boolean(id)))];
    const id = `${isEp ? 'eps' : 'album'}:${album.albumId}`;
    if (!related.length) groups.set(id, {
      id, kind: isEp ? 'eps' : 'other',
      name: isEp ? `${album.characters.join(' / ')} EP` : title,
      search: `${album.albumName} ${title} ${album.characters.join(' ')} ${album.songs.flatMap((song) => songsById.get(song.songId)?.ep?.characters || []).join(' ')}`,
    });
    for (const song of album.songs) albumGroups.set(song.songId, related.length ? related : [id]);
  }
  const projected = songs.map((song) => {
    const uses = (song.connections || []).map(connectionGroupId);
    const albumIds = albumGroups.get(song.id) || [];
    // Actual in-game connections take precedence over the release album, so
    // cross-album reuse never invents a connection to an unrelated event.
    const groupIds = [...new Set(uses.length ? [...uses, ...albumIds.filter((id) => id.startsWith('eps:'))] : albumIds)];
    return { ...song, groupIds };
  });
  const used = new Set(projected.flatMap((song) => song.groupIds));
  return { songs: projected, groups: [...groups.values()].filter((group) => used.has(group.id)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) };
}
