import type { HeadhuntingBanner } from './headhuntingBanners';

export function bannerTimingLabel(banner: HeadhuntingBanner): string {
  if (banner.globalForecastWithdrawn) return 'Global date unannounced';
  const prefix = banner.global_date_estimated ? 'Estimated Global · '
    : banner.globalScheduleStatus === 'datamined' ? `Datamined ${banner.timingServer?.toUpperCase() ?? 'Global'} · `
    : banner.global_date ? '' : 'CN · ';
  return `${prefix}${banner.global_date || banner.cn_date || 'date unknown'}`;
}
