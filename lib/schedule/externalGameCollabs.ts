import type { ScheduleEvent } from './scheduleTypes';

/** Confirmed dates from the host game's announcement. These are not Arknights
 * server events and never participate in game rewards or pull-planner income.
 * Date-only end dates are inclusive; a launch-only entry does not invent an end
 * to permanent content. Keep stable IDs when correcting dates or adding sources. */
export const EXTERNAL_GAME_COLLABS = [
  {
    id: 'arcaea-arknights-2026', game: 'Arcaea', region: 'International release',
    title: 'Arcaea × Arknights', start: '2026-11-17', end: '2028-03-17',
    description: 'Collaboration pack, Amiya partner and a free Renegade map. This is the announced acquisition period; obtained songs and content remain playable afterwards. Exact closing time has not been announced.',
    source: 'https://x.com/arcaea_en/status/2118493572538286182',
    image: 'https://pbs.twimg.com/media/HWK3ASwbAAAdu5W.jpg?format=jpg&name=large',
  },
  {
    id: 'cytus-ii-arknights-2021', game: 'Cytus II', region: 'International release',
    title: 'Cytus II × Arknights', start: '2021-12-16', end: null,
    description: 'Version 4.4.5 introduced the paid Amiya character, an original story and ten songs. Calendar marks the release day; purchased songs unlock permanently. The announcement does not specify a collaboration end date.',
    source: 'https://rayark.com/en/news/20211216_cytus2_arknights/',
    image: 'https://rayark.com/news/20211216_cytus2_arknights/01.jpg',
  },
  {
    id: 'muse-dash-msr-2023', game: 'Muse Dash', region: 'International release',
    title: 'Muse Dash × Arknights · MSR Anthology', start: '2023-01-20', end: '2024-01-20',
    description: 'Original limited-time sale of MSR Anthology, including eight songs and Amiya. Dates describe pack availability, rather than an Arknights in-game event. Exact closing time was not specified.',
    source: 'https://store.steampowered.com/news/app/774171/view/5035621474413984887',
    image: 'https://clan.akamai.steamstatic.com/images/31923494/e938255a534571990406baca0e412e837754c5a2.png',
  },
  {
    id: 'muse-dash-msr-2025', game: 'Muse Dash', region: 'International release',
    title: 'Muse Dash × Arknights · MSR Vol.02', start: '2025-01-26', end: '2026-01-26',
    description: 'MSR Anthology Vol.02 introduced eight songs and Wiš\'adel, while Vol.01 returned to sale. Both packs shared this announced sale period. Exact closing time was not specified.',
    source: 'https://store.steampowered.com/news/app/774171/view/1789580505397330',
    image: null,
  },
  {
    id: 'delta-force-arknights-launch-2025', game: 'Delta Force', region: 'International release',
    title: 'Delta Force × Arknights · Launch', start: '2025-07-09', end: null,
    description: 'The international collaboration launched with Executor-themed Stinger pass rewards; Schwarz-themed Luna research followed on July 11. Calendar marks the launch day because this announcement does not provide one closing date for all activities.',
    source: 'https://www.playdeltaforce.com/events/arknights/', image: null,
  },
  {
    id: 'garena-delta-force-arknights-2025', game: 'Delta Force', region: 'Garena service',
    title: 'Delta Force × Arknights · Garena events', start: '2025-07-11', end: '2025-11-09',
    description: 'Garena announced the Treasure Store, Operator Recruitment, Voice of the Ark and Rhodes Island crates for this period. This service-specific schedule is separate from the international launch announcement. Exact closing times were not specified.',
    source: 'https://deltaforce.garena.com/en/news/announcement/PTVR3X', image: null,
  },
] as const;

export function externalGameScheduleEvents(): ScheduleEvent[] {
  return EXTERNAL_GAME_COLLABS.map(collab => ({
    name: collab.title, poster: collab.image, year: Number(collab.start.slice(0, 4)),
    cn: { dateRange: null, note: null }, tw: { dateRange: null, note: null },
    global: { dateRange: `${collab.start.replaceAll('-', '/')}–${(collab.end ?? collab.start).replaceAll('-', '/')}`, note: null },
    externalGame: { id: collab.id, game: collab.game, region: collab.region, source: collab.source, description: collab.description, launchOnly: collab.end === null },
  }));
}
