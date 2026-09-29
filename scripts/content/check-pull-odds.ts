/**
 * The refresh's odds-rules stage: every limited, crossover or Orienteering banner the pull
 * planner lists without odds because nobody has verified its rules, as a quarantine entry
 * (stage odds-rules), so the daily 'Content quarantined' issue names it until someone does.
 *
 *   npx tsx scripts/content/check-pull-odds.ts
 *
 * The planner gives such a banner odds only once its announcement's rules are in
 * data/pull-odds-rules.json (lib/pulls/bannerOdds.ts). Before that, a new crossover
 * showed no operators and nothing said why (the Persona 3 Reload banner, 2026-09-29).
 * Only the banners a reader can still plan for count: the ones currentPullPlan keeps at
 * the run's clock, as the page does on a request. An entry names the banner's
 * announcement when its record has one, and clears on the first refresh run after its
 * rules are added. It is overdue after the usual three days, since only a person can
 * clear it.
 */
import { getAllHeadhuntingBanners } from '../../lib/gacha/headhuntingBannerData';
import { getBannerOdds, unverifiedBanners } from '../../lib/pulls/bannerOdds';
import { currentPullPlan } from '../../lib/pulls/currentPlan';
import { getPullSchedule } from '../../lib/pulls/schedule';
// @ts-expect-error Plain Node helper shared by the importers.
import { beginStage, defaultNow } from '../lib/quarantine.mjs';

export const STAGE = 'odds-rules';

const now: Date = defaultNow();
const schedule = getPullSchedule();
const current = currentPullPlan({ scheduledBanners: schedule, bannerOdds: getBannerOdds(schedule), skinCollections: [] }, now.getTime());
const records = new Map(getAllHeadhuntingBanners().map(banner => [banner.name, banner]));
const stage = beginStage(process.cwd(), STAGE, now);
for (const { banner, reason } of unverifiedBanners(current.scheduledBanners, current.bannerOdds)) {
  const announcement = records.get(banner.name)?.cn_window?.timingSource;
  stage.add({ key: `odds:${banner.poolId}`, action: 'published-partial', reason, ...(announcement ? { sourceRef: announcement } : {}) });
}
const written: { key: string; reason: string }[] = stage.commit();
console.log(written.length
  ? `${written.length} banner(s) without verified odds rules:\n${written.map(entry => `  ! ${entry.key}: ${entry.reason}`).join('\n')}`
  : 'Every scheduled limited, crossover and Orienteering banner has verified odds rules.');
