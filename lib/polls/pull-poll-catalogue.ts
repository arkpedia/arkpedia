import { loadRelease, readPageProps } from '@/lib/content/release';
import { readShippedTable } from '@/lib/content/shippedTable';
import type { UpcomingBanner } from '@/lib/pulls/pulls';
import type { HeadhuntingBanner } from '@/lib/gacha/headhuntingBanners';
import { pollBanners } from './pull-poll';

type Sources = { banners: UpcomingBanner[] };
// Explicit build constants keep these records and the planner's build pipeline
// out of the code loaded on every Worker cold start.
const bundledSources = async (): Promise<Sources> => process.env.ARKPEDIA_WORKER === '1'
  ? readShippedTable<Sources>('pull-sources.json')
  : (await import('@/data/pull-sources.json')).default as Sources;
const bundledLineups = async (): Promise<HeadhuntingBanner[]> => process.env.ARKPEDIA_WORKER === '1'
  ? readShippedTable<HeadhuntingBanner[]>('headhunting_banners.json')
  : (await import('@/data/headhunting_banners.json')).default as HeadhuntingBanner[];

/** Reuse the planner’s published windows and the simulator’s full featured rosters. */
export async function pullPollCatalogue() {
  if (process.env.ARKPEDIA_EXPORT_CONTENT !== '1') {
    const release = await loadRelease();
    if (release?.manifest.pages['/pulls']) {
      const props = await readPageProps(release, '/pulls');
      if (!Array.isArray(props?.scheduledBanners)) throw Error('The banner catalogue is unavailable. Please try again.');
      const gacha = release.manifest.pages['/gacha'] ? await readPageProps(release, '/gacha') : null;
      return { banners: pollBanners(props.scheduledBanners as UpcomingBanner[], (gacha?.banners ?? await bundledLineups()) as HeadhuntingBanner[]), __contentRelease: release.context };
    }
    if (release) return { banners: pollBanners((await bundledSources()).banners, await bundledLineups()) };
  }
  return process.env.ARKPEDIA_WORKER === '1'
    ? { banners: pollBanners((await bundledSources()).banners, await bundledLineups()) }
    : { banners: pollBanners((await import('@/lib/pulls/schedule')).getPullSchedule(), await bundledLineups()) };
}

export async function pullPollPageCatalogue(){
  const catalogue=await pullPollCatalogue();
  return {...catalogue,portraits:await pullPollPortraits(catalogue.banners)};
}
export async function pullPollPortraits(banners:import('./pull-poll').PollBanner[]){
  const {communityOperators}=await import('@/lib/community/catalogues');
  const names=new Set(banners.flatMap(b=>b.operators));
  return Object.fromEntries((await communityOperators()).filter(op=>names.has(op.name)).map(op=>[op.name,{icon:op.icon,rarity:op.rarity}]));
}
