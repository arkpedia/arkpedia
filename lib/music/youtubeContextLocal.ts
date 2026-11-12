import fs from 'node:fs';
import path from 'node:path';
import { loadAllEventYears } from '@/lib/events/loadEventsData';
import { getAllOperators } from '@/lib/operators/operators';
import { getAllSkins } from '@/lib/skins/skins';
import { getAllEvents } from '@/lib/schedule/schedule';
import { getSkinWindows } from '@/lib/skins/skinAvailability';
import { getBannersSortedByDate } from '@/lib/gacha/headhuntingBannerData';
import confirmed from '@/data/skin-availability-windows.json';
import rotations from '@/data/skin-shop-rotations.json';
import type { VideoContextEvent } from './youtubeContextServer';
import type { RegionalSchedules } from '@/lib/time/regional';

/** Node-only source fallback for local builds and the daily content producer. */
export function localVideoContextRecords() {
  const skins = getAllSkins();
  // Standalone content jobs read the hydrated files, without runtime JSON loaders.
  const read = (file: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', file), 'utf8'));
  return {
    events: loadAllEventYears() as VideoContextEvent[],
    operators: getAllOperators(),
    skins,
    windows: getSkinWindows(skins, getAllEvents(), { confirmed, rotations }),
    banners: getBannersSortedByDate(),
    // Hydration removes the derived community catalogue before this producer runs.
    stages: JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/stages-index.json'), 'utf8')) as { contentId?: string; code: string }[],
    regional: read('regional-schedules.json') as RegionalSchedules,
  };
}
