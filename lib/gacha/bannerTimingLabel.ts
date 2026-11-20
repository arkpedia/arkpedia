import type { HeadhuntingBanner } from './headhuntingBanners';
import { sourcedTiming, type ReleaseTiming, type TimingEvidence } from '@/lib/time/releaseTiming';

export function bannerReleaseTiming(banner: Partial<Pick<HeadhuntingBanner, 'cn_date' | 'global_date_estimated' | 'globalScheduleStatus'>> & { global_window?: TimingEvidence | null }): ReleaseTiming {
  if (banner.globalScheduleStatus === 'announced') return 'confirmed';
  if (sourcedTiming({ ...banner.global_window, status: banner.globalScheduleStatus }) === 'datamined') return 'datamined';
  if (banner.global_date_estimated) return banner.cn_date ? 'cn-estimate' : 'estimated';
  return 'confirmed';
}

export function bannerTimingLabel(banner: HeadhuntingBanner): string {
  if (banner.globalForecastWithdrawn) return 'Global date unannounced';
  const timing = bannerReleaseTiming(banner);
  const prefix = timing === 'cn-estimate' ? 'Estimated Global (CN-based) · ' : timing === 'estimated' ? 'Estimated Global · '
    : timing === 'datamined' ? `Datamined ${banner.timingServer?.toUpperCase() ?? 'Global'} · `
    : banner.global_date ? '' : 'CN · ';
  return `${prefix}${banner.global_date || banner.cn_date || 'date unknown'}`;
}
