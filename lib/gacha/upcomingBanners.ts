import { HeadhuntingBanner } from './headhuntingBanners';
import { parseBannerWindow } from './realGachaBanners';

/** Live at `now`: started, and not yet at its (exclusive) end. `now` is required on
 * purpose -- a render that read the clock itself would use the server's clock in the
 * markup and the reader's in the browser, and React rejects the markup when they
 * disagree about a banner. The page passes its useReaderClock value. */
export function isBannerLive(banner: HeadhuntingBanner, now: number): boolean {
  if (banner.globalLineupPending) return false;
  const window = parseBannerWindow(banner);
  return window !== null && window.start.getTime() <= now && now < window.end.getTime();
}

/** The simulator's Upcoming tab at `now`: every banner that has not ended yet,
 * regardless of pull_type (Limited, Crossover, Joint, etc. all count) -- additive, not
 * a replacement for its normal mechanic tab, so the same banner shows in both places.
 * Live banners come first, soonest-ending first, since that is the most time-sensitive;
 * then upcoming ones, soonest-starting first -- the opposite of the newest-first order
 * every other tab uses, since this tab is about what is live or coming up soonest.
 * Banners with no parseable window are left out. Forecast-only Global lineups remain
 * listed with estimated dates, without a live claim or CN operators. */
export function upcomingBanners<T extends HeadhuntingBanner>(banners: readonly T[], now: number): T[] {
  return banners
    .flatMap((banner) => {
      const window = parseBannerWindow(banner);
      if (!window || window.end.getTime() <= now) return [];
      const start = window.start.getTime();
      return [{ banner, start, end: window.end.getTime(), live: !banner.globalLineupPending && start <= now }];
    })
    .sort((a, b) => {
      if (a.live !== b.live) return a.live ? -1 : 1;
      return a.live ? a.end - b.end : a.start - b.start;
    })
    .map((row) => row.banner);
}
