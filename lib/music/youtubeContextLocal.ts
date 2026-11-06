import { loadAllEventYears } from '@/lib/events/loadEventsData';
import { getAllOperators } from '@/lib/operators/operators';
import { getAllSkins } from '@/lib/skins/skins';
import { getAllEvents } from '@/lib/schedule/schedule';
import { getSkinWindows } from '@/lib/skins/skinAvailability';
import { getBannersSortedByDate } from '@/lib/gacha/headhuntingBannerData';
import confirmed from '@/data/skin-availability-windows.json';
import rotations from '@/data/skin-shop-rotations.json';
import type { VideoContextEvent } from './youtubeContextServer';

/** Node-only source fallback for local builds and the daily content producer. */
export function localVideoContextRecords() {
  const skins = getAllSkins();
  return {
    events: loadAllEventYears() as VideoContextEvent[],
    operators: getAllOperators(),
    skins,
    windows: getSkinWindows(skins, getAllEvents(), { confirmed, rotations }),
    banners: getBannersSortedByDate(),
  };
}
