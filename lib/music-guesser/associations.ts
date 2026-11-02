// Server-only, reviewed associations. Do not infer in-game use from album category:
// OST albums also contain promotional music and unused instrumental arrangements.
// The reviewed event table is arkpedia-data's record (music-guesser-event-music.json),
// so a new event's BGM lands in the data, not in a deploy.
import type { SongConnection } from './game';
import { MAIN_STORY_MUSIC } from './mainStory';
import { EVENT_EXPANSION } from './eventExpansion';
import record from '@/data/music-guesser-event-music.json';

type Track = { id: string; role: SongConnection['role']; stages?: string[]; variant?: string; characters?: string[]; titles?: string[] };
export interface EventMusic { names: string[]; characters: string[]; source: string; tracks: Track[]; chapter?: number; kind?: 'vignette' }

export const EVENT_MUSIC = record.events as EventMusic[];

// CC numbering follows https://arknights.wiki.gg/wiki/Soundtrack/BGM/Contingency_Contract
// Usage can be checked at /wiki/Contingency_Contract_<name>/BGM.
// Exclude OST instrumental bonus tracks: they are not the in-game lobby recording.
// Also exclude the Barrenland W&W promotional mix, not its in-game menu BGM.
export const CC_MUSIC: { name: string; series: 'cc' | 'ccb'; number: number; lobby: string; battles: { id: string; variant?: string }[] }[] = [
  { name: 'Pyrite', series: 'cc', number: 1, lobby: '048747', battles: [] },
  { name: 'Blade', series: 'cc', number: 2, lobby: '880378', battles: [] },
  { name: 'Cinder', series: 'cc', number: 3, lobby: '461196', battles: [{ id: '461160', variant: '1' }, { id: '880347', variant: '2' }] },
  { name: 'Lead Seal', series: 'cc', number: 4, lobby: '125001', battles: [] },
  { name: 'Spectrum', series: 'cc', number: 5, lobby: '779420', battles: [{ id: '697658' }] },
  { name: 'Wild Scales', series: 'cc', number: 6, lobby: '953919', battles: [] },
  { name: 'Pine Soot', series: 'cc', number: 7, lobby: '880365', battles: [] },
  { name: 'Dawnseeker', series: 'cc', number: 8, lobby: '125009', battles: [{ id: '953917' }] },
  { name: 'Deepness', series: 'cc', number: 9, lobby: '306847', battles: [{ id: '232296' }] },
  { name: 'Ashring', series: 'cc', number: 10, lobby: '306837', battles: [{ id: '514566' }] },
  { name: 'Fake Waves', series: 'cc', number: 11, lobby: '461171', battles: [{ id: '697640' }] },
  { name: 'Base Point', series: 'cc', number: 12, lobby: '697635', battles: [{ id: '232272' }] },
  { name: 'Pyrolysis', series: 'ccb', number: 1, lobby: '048704', battles: [{ id: '953988' }] },
  { name: 'Underdawn', series: 'ccb', number: 2, lobby: '048798', battles: [{ id: '232253', variant: '1' }, { id: '880325', variant: '2' }] },
  { name: 'Extinguished Sins', series: 'ccb', number: 3, lobby: '232249', battles: [{ id: '697607' }] },
  { name: 'Arclight', series: 'ccb', number: 4, lobby: '514513', battles: [{ id: '880305' }] },
  // https://arknights.wiki.gg/wiki/Battleplan_Obliteration (vocal lobby recording).
  { name: 'Obliteration', series: 'ccb', number: 5, lobby: '697687', battles: [] },
];

export function getReviewedAssociations() {
  const result = new Map<string, { inGame: true; connections: SongConnection[]; titleAliases?: string[] }>();
  for (const event of [...EVENT_MUSIC, ...MAIN_STORY_MUSIC, ...EVENT_EXPANSION]) {
    for (const track of event.tracks) {
      result.set(track.id, {
        inGame: true,
        ...((track.titles || result.get(track.id)?.titleAliases) ? { titleAliases: [...new Set([...(result.get(track.id)?.titleAliases || []), ...(track.titles || [])])] } : {}),
        connections: [...(result.get(track.id)?.connections || []), {
          names: event.names, characters: [...event.characters, ...(track.characters || [])], role: track.role,
          ...(event.chapter !== undefined ? { chapter: event.chapter } : {}),
          ...(event.kind ? { kind: event.kind } : {}),
          ...(track.stages ? { stages: track.stages } : {}), ...(track.variant ? { variant: track.variant } : {}),
        }],
      });
    }
  }
  for (const cc of CC_MUSIC) {
    for (const track of [{ id: cc.lobby, role: 'lobby' as const }, ...cc.battles.map((battle) => ({ ...battle, role: 'battle' as const }))]) {
      result.set(track.id, { ...result.get(track.id), inGame: true, connections: [...(result.get(track.id)?.connections || []), {
        names: [cc.name], characters: [], role: track.role,
        cc: { series: cc.series, number: cc.number },
        ...('variant' in track ? { variant: track.variant } : {}),
      }] });
    }
  }
  return result;
}
