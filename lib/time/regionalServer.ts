import { readShippedTable } from '@/lib/content/shippedTable';
import type { RegionalSchedules } from './regional';

/* The Worker's build reads it from its static files (lib/content/shippedTable.ts): compiled in,
   it was 3.45 MB of handler.mjs. Every other build imports it. The constant is tested here, with
   the import in the other branch, so webpack leaves the import out of the Worker's build. */
const allSchedules = async (): Promise<RegionalSchedules> => (process.env.ARKPEDIA_WORKER === '1'
  ? readShippedTable<RegionalSchedules>('regional-schedules.json')
  : (await import('@/data/regional-schedules.json')).default as unknown as RegionalSchedules);

/** Slice by consumer to avoid shipping every region's client history on every page. */
export async function regionalTable(route: string): Promise<RegionalSchedules> {
  const all = await allSchedules();
  const fields: Record<string, string[]> = {
    '/': ['events', 'banners', 'weekly', 'forceOpen', 'skinWindows', 'farming', 'sss'],
    '/gacha': ['banners'], '/schedule': ['events', 'banners'], '/events/[slug]': ['events', 'banners'],
    '/pulls': ['events', 'banners', 'skinWindows'], '/skin-planner': ['skinWindows'], '/skins': ['skinWindows', 'skinReleases'],
    '/farming': ['events'], '/free-op': ['rewardWindows', 'releases'],
    '/stages/supplies': ['weekly', 'forceOpen'], '/stages/regular': ['annihilation', 'sss'],
    '/stages': ['contents', 'releases'], '/stages/browse': ['contents', 'weekly', 'forceOpen'],
  };
  const wanted = new Set(fields[route] ?? []);
  return { version: 1, servers: Object.fromEntries(Object.entries(all.servers).map(([server, schedule]) => [server,
    Object.fromEntries(Object.entries(schedule ?? {}).filter(([key]) => wanted.has(key) || key === 'sources'))])) } as RegionalSchedules;
}
