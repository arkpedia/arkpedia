import type { GameEventListing } from '../home/frontPageContent';
import type { ScheduleEvent } from '../schedule/scheduleTypes';
export interface ModeDetails {
  title: string; description: string[]; unlock: string; rewards: string; cnLaunch: string; source: string;
  globalLaunch?: string;
  poster?: string;
  panels?: { title: string; description: string; image: string; width: number; height: number }[];
  guides?: { label: string; url: string }[];
}
const DETAILS: Record<string, ModeDetails> = {
  '[Reclamation Algorithm] Relaunch Anchor': {
    title: 'Reclamation Algorithm: Relaunch Anchor',
    description: [
      'A permanent Reclamation Algorithm theme focused on building New Rhodes Island on Victoria’s southeastern border.',
      'Clear stages to earn Mission Acceptance Slips and redeem them at the Rhodes Island Procurement Center.',
    ],
    unlock: 'Clear Main Storyline 3-8.',
    rewards: 'Mountain’s The Hardcore Rider outfit, the Relaunch background, Reclamation Endures icon, Algorithm profile theme and Blueprint of Rebuild interactive furniture.',
    cnLaunch: '2026/05/15',
    globalLaunch: '2026/10/28 at 08:00 (UTC−7)',
    source: 'https://www.arknights.global/news/4980',
    poster: 'https://webusstatic.yo-star.com/web-cms-test/upload/content/2026/10/22/b7-p7sQa.png',
    panels: [
      { title: 'Rebuilding New Rhodes Island', description: 'Upgrade the base and its four Node Structures to expand construction space and advance the Main Sequence stories.', image: 'https://pbs.twimg.com/media/HVTqqjka8AAYyTC.jpg?name=orig', width: 1920, height: 1953 },
      { title: 'Construction and stage buffs', description: 'Place Constructs for Construct Score, adjacency bonuses and buffs during stages.', image: 'https://pbs.twimg.com/media/HVTqxcbaYAASpfc.jpg?name=orig', width: 1920, height: 1240 },
      { title: 'Energy production and visitors', description: 'Connect processing facilities and Refiners, boost output with Energy Amps, and welcome permanent residents.', image: 'https://pbs.twimg.com/media/HVTq5b-akAAXA_k.jpg?name=orig', width: 1920, height: 1283 },
      { title: 'Garrison and Plans', description: 'Assign garrison Operators for starting resources and spend stage-earned Points on Plans buffs.', image: 'https://pbs.twimg.com/media/HVTrAV4bEAAoF3y.jpg?name=orig', width: 1920, height: 1468 },
      { title: 'Permanent reward phases', description: 'Spend Mission Acceptance Slips across five initial phases. Rewards and redemption progress remain available after updates end.', image: 'https://pbs.twimg.com/media/HVh0kEZaYAA7L1n.jpg?name=orig', width: 1920, height: 989 },
      { title: 'Archive Center', description: 'Revisit experienced stories, completed objectives and discovered music.', image: 'https://pbs.twimg.com/media/HVh0ofhaYAArnNR.jpg?name=orig', width: 1920, height: 1162 },
      { title: 'Material processing', description: 'Follow the official Plank and Adhesive recipes; higher-level processors improve efficiency.', image: 'https://pbs.twimg.com/media/HVh0tWJawAEQWEl.jpg?name=orig', width: 1920, height: 1240 },
      { title: 'Tutorial and common questions', description: 'Getting started, expanding zones, recruitment rules and resources. Tales Within the Sand keeps its separate save data.', image: 'https://pbs.twimg.com/media/HVh0xvMbIAAnuhx.jpg?name=orig', width: 1920, height: 1917 },
    ],
    guides: [
      { label: 'Mechanics post', url: 'https://x.com/ArknightsEN/status/2114567697677648213' },
      { label: 'Rewards and recipes post', url: 'https://x.com/ArknightsEN/status/2114568526837280830' },
    ],
  },
};
export const modeDetails = (name: string): ModeDetails | null => DETAILS[name] ?? null;
/** Detail routes exist for permanent launches without inventing an event end date. */
export function permanentEventListing(event: ScheduleEvent): GameEventListing | null {
  if (!event.modeId) return null;
  const launch = event.global.releaseDate ?? event.cn.releaseDate;
  if (!launch) return null;
  const start = new Date(`${launch.replaceAll('/', '-')}T00:00:00Z`);
  if (!Number.isFinite(+start)) return null;
  return { name: event.name, poster: event.poster, year: event.year, dateRange: event.global.releaseDate ?? 'Global launch unannounced', start, end: start, isPredicted: !!event.global.note || !event.global.releaseDate };
}
