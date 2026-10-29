/**
 * Writes data/farming-events.json: what each current and upcoming event hands out in
 * materials, for the Operator Planner's Farming method (lib/planner/farmingMethod.ts).
 *
 *   npx tsx scripts/build/build-farming-events.ts
 *
 * Joins three tables the site already keeps, by the event's name (every event in
 * data/event-rewards.json and data/event-stores.json is also in the calendar, checked below):
 *  - the calendar (lib/home/frontPageContent getEventCalendar): the event's Global window, or the
 *    CN one moved by the usual gap when Global has not dated it (`estimated`);
 *  - data/event-rewards.json: what the event gives for free. Only the groups that hold materials
 *    count (login, missions, first-clear, milestones); the packs are paid and the Lucky Strips
 *    random, and neither carries a material;
 *  - data/event-stores.json: what its store sells. A finite stock adds up (quantity x stock); an
 *    unlimited one cannot, and is only named.
 * Only materials the planner's depot knows (data/material-catalogue.json) are kept: the event
 * tokens, prestige and furniture are not materials a build costs. The ones dropped are reported.
 *
 * Event windows and the banners' ends follow the schedule, so this is regenerated with it (the
 * content run), and the planner reads only what is still ahead of the reader's clock.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The reward groups that hand out materials for free, whatever the reader does in the event. */
export const FREE_GROUPS = ['login', 'missions', 'first-clear', 'milestones'] as const;

export interface FarmingEvent {
  name: string;
  /** Global dates, UTC, YYYY-MM-DD. */
  start: string;
  end: string;
  /** The window is a CN-date estimate: Global has not dated it. */
  estimated: boolean;
  /** Materials the event gives for free, summed. */
  free: Record<string, number>;
  /** What its store sells: limited stock summed, and the names sold without a limit. */
  shop: { limited: Record<string, number>; unlimited: string[] };
}

export interface FarmingEventsTable {
  about: string;
  /** Banners to set the date by: name and the last day it is open (Global, UTC). */
  banners: { name: string; end: string }[];
  events: FarmingEvent[];
}

interface Inputs {
  calendar: { name: string; start: Date; end: Date; isPredicted: boolean }[];
  rewards: { events: Record<string, { groups?: { kind: string; items?: { name: string; count: number; kind: string }[] }[] }> };
  stores: { events: Record<string, { stores: { items: { name: string; type: string; quantity: number; stock: string }[] }[] }> };
  banners: { name: string; end: string }[];
  /** The materials the planner knows. */
  materials: ReadonlySet<string>;
  /** Day the table is built; older events and banners are left out. */
  today: string;
}

const day = (date: Date) => date.toISOString().slice(0, 10);
const add = (into: Record<string, number>, name: string, count: number) => { into[name] = (into[name] ?? 0) + count; };
const sorted = <T,>(record: Record<string, T>): Record<string, T> => Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]]));

export function buildFarmingEvents({ calendar, rewards, stores, banners, materials, today }: Inputs): { table: FarmingEventsTable; dropped: string[] } {
  const known = new Set(calendar.map((event) => event.name));
  for (const name of [...Object.keys(rewards.events), ...Object.keys(stores.events)]) {
    if (!known.has(name)) throw new Error(`farming-events: "${name}" has rewards or a store but no place in the calendar, so it has no dates`);
  }
  const dropped = new Set<string>();
  const events: FarmingEvent[] = [];
  for (const event of calendar) {
    const end = day(event.end);
    if (end < today) continue;
    const free: Record<string, number> = {};
    for (const group of rewards.events[event.name]?.groups ?? []) {
      if (!(FREE_GROUPS as readonly string[]).includes(group.kind)) continue;
      for (const item of group.items ?? []) {
        if (item.kind !== 'material' || !(item.count > 0)) continue;
        if (materials.has(item.name)) add(free, item.name, item.count);
        else dropped.add(item.name);
      }
    }
    const limited: Record<string, number> = {};
    const unlimited = new Set<string>();
    for (const store of stores.events[event.name]?.stores ?? []) {
      for (const item of store.items) {
        if (item.type !== 'material') continue;
        if (!materials.has(item.name)) { dropped.add(item.name); continue; }
        if (item.stock === 'unlimited') { unlimited.add(item.name); continue; }
        const stock = Number(item.stock);
        if (Number.isFinite(stock) && stock > 0 && item.quantity > 0) add(limited, item.name, item.quantity * stock);
      }
    }
    if (!Object.keys(free).length && !Object.keys(limited).length && !unlimited.size) continue;
    events.push({ name: event.name, start: day(event.start), end, estimated: event.isPredicted, free: sorted(free), shop: { limited: sorted(limited), unlimited: [...unlimited].sort() } });
  }
  events.sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
  return {
    table: {
      about: 'What each current and upcoming event hands out in materials (scripts/build/build-farming-events.ts): free rewards, and what its store sells. Windows are Global, or CN estimated. Generated: do not edit.',
      banners: banners.filter((banner) => banner.end >= today).map(({ name, end }) => ({ name, end })).sort((a, b) => a.end.localeCompare(b.end) || a.name.localeCompare(b.name)),
      events,
    },
    dropped: [...dropped].sort(),
  };
}

async function main() {
  const root = process.cwd();
  const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, 'data', file), 'utf8'));
  const { getEventCalendar } = await import('../../lib/home/frontPageContent');
  const catalogue = read('material-catalogue.json') as { order: string[] };
  const { table, dropped } = buildFarmingEvents({
    calendar: getEventCalendar(),
    rewards: read('event-rewards.json'),
    stores: read('event-stores.json'),
    banners: (read('pull-sources.json').banners ?? []) as { name: string; end: string }[],
    materials: new Set(catalogue.order),
    today: new Date().toISOString().slice(0, 10),
  });
  const dest = path.join(root, 'data', 'farming-events.json');
  fs.writeFileSync(dest, JSON.stringify(table, null, 2) + '\n');
  console.log(`Wrote ${table.events.length} events and ${table.banners.length} banners -> ${path.relative(root, dest)}`);
  console.log(`Not materials the planner tracks (left out): ${dropped.length} (${dropped.slice(0, 12).join(', ')}${dropped.length > 12 ? ', ...' : ''})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
