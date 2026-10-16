import data from '@/data/regional-schedules.json';
import type { RegionalSchedules } from './regional';

/** Slice by consumer to avoid shipping every region's client history on every page. */
export function regionalTable(route: string): RegionalSchedules {
  const all = data as unknown as RegionalSchedules;
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
