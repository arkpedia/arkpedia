import { loadRelease, readPageProps } from '@/lib/content/release';
import type { UpcomingBanner } from '@/lib/pulls/pulls';
import type { HeadhuntingBanner } from '@/lib/gacha/headhuntingBanners';
import source from '@/data/pull-sources.json';
import lineups from '@/data/headhunting_banners.json';
import { pollBanners } from './pull-poll';

/** Reuse the planner’s published windows and the simulator’s full featured rosters. */
export async function pullPollCatalogue() {
  if (process.env.ARKPEDIA_EXPORT_CONTENT !== '1') {
    const release = await loadRelease();
    if (release?.manifest.pages['/pulls']) {
      const props = await readPageProps(release, '/pulls');
      if (!Array.isArray(props?.scheduledBanners)) throw Error('The banner catalogue is unavailable. Please try again.');
      const gacha = release.manifest.pages['/gacha'] ? await readPageProps(release, '/gacha') : null;
      return { banners: pollBanners(props.scheduledBanners as UpcomingBanner[], (gacha?.banners ?? lineups) as HeadhuntingBanner[]), __contentRelease: release.context };
    }
    // The first deployment can predate these published pages. Use compiled records,
    // without opening data/ in a cold Worker, until the next content release lands.
    if (release) return { banners: pollBanners(source.banners as UpcomingBanner[], lineups as HeadhuntingBanner[]) };
  }
  const { getPullSchedule } = await import('@/lib/pulls/schedule');
  return { banners: pollBanners(getPullSchedule(), lineups as HeadhuntingBanner[]) };
}
