import { useState } from 'react';
import { remainingBacklog } from '@/lib/pulls/pulls';
import type { GetStaticProps } from 'next';
import type { ContentRelease } from '@/lib/content/types';
import Head from 'next/head';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import DataLink from '@/components/account/DataLink';
import { PastRewards } from '@/components/pulls/PastRewards';
import { withContentPage } from '@/lib/content/server';
import { formatNumber, formatOneDecimal } from '@/lib/pulls/format';
import { fillFromDeployment, ORUNDUM_PER_ORIGINITE, ORUNDUM_PER_PULL, type BacklogSources } from '@/lib/pulls/pulls';
import { usePastRewards } from '@/lib/pulls/usePastRewards';
import FreeRewards from '@/components/pulls/FreeRewards';
import { freeRewardTotals, type FreeReward } from '@/lib/pulls/freeRewards';
import { useReaderClock } from '@/lib/time/readerClock';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';

/*
 * The Reward Tracker (the Planner menu): every first-clear reward the game still owes the
 * reader -- the main story's and the playable events' Originite Prime, the resource stages',
 * and Annihilation's Orundum -- as its own page, the way the Skin Planner is the Pull
 * Planner's skin section on its own. The ticks are the ones the Pull Planner's Past events
 * popup shows (lib/pulls/usePastRewards.ts): one list, two places to keep it.
 */

interface Props {
  /** The release's back catalogue (lib/pulls/sources.ts), as /pulls carries it. */
  backlogSources: BacklogSources;
  freeRewards?: FreeReward[];
  rewardIcons?: Record<string, string>;
  now: number;
  __contentRelease?: ContentRelease;
}

export default function FreeOpPage({ backlogSources, freeRewards = [], rewardIcons = {}, now }: Props) {
  const clock = useReaderClock(now);
  const [view, setView] = useState('stages');
  const past = usePastRewards(backlogSources);
  const [presentation, setPresentation] = useState(false);
  const [demoKeys, setDemoKeys] = useState(new Set<string>());
  const [demoEvents, setDemoEvents] = useState(new Set<string>());
  const [demoAnnihilation, setDemoAnnihilation] = useState(false);
  const remaining = presentation ? remainingBacklog(backlogSources, demoEvents, demoKeys, demoAnnihilation) : past.remaining;
  const keys = presentation ? demoKeys : past.doneKeys;
  const timed = freeRewardTotals(freeRewards.filter(reward => !reward.forecast), keys, clock);
  const originitePrime = remaining.originitePrime + timed.op;
  const orundum = remaining.orundum - remaining.originitePrime * ORUNDUM_PER_ORIGINITE + timed.orundum;
  const permits = remaining.permits + timed.permits;
  const pulls = (originitePrime * ORUNDUM_PER_ORIGINITE + orundum) / ORUNDUM_PER_PULL + permits;
  return (
    <>
      <Head><title>Reward Tracker — Arkpedia</title></Head>
      <PageHeader eyebrow="Rhodes Island // Reward Tracker" title="Reward Tracker"
        sub={<>First clears and free rewards still to claim. The <Link prefetch={false} href="/pulls">Pull Planner</Link> shares your first-clear and permanent reward completion.</>}
        actions={<DataLink />} />
      <main className="free-op-page">
        <section className="op-section free-op-overview" aria-labelledby="free-op-left">
          <div className="free-op-heading">
            <h2 id="free-op-left">Still to claim</h2>
            <label className="check"><input type="checkbox" checked={presentation} onChange={event => { setPresentation(event.target.checked); setDemoKeys(new Set()); setDemoEvents(new Set()); setDemoAnnihilation(false); }} />Fully uncompleted view</label>
          </div>
          {presentation && <p className="hint free-op-demo-note">Presentation view. Your saved completion stays unchanged.</p>}
          <dl className="free-op-summary">
            <div><dt>Originite Prime</dt><dd>{formatNumber(originitePrime)}</dd></div>
            <div><dt>Orundum</dt><dd>{formatNumber(orundum)}</dd></div>
            <div><dt>Headhunting permits</dt><dd>{formatNumber(permits)}</dd></div>
            <div><dt>Worth, in pulls</dt><dd>{formatOneDecimal(pulls)}</dd></div>
          </dl>
        </section>
        <Tabs label="Reward type" id="free-reward-type" value={view} onChange={setView} options={[{ value: 'stages', label: 'Stage rewards' }, { value: 'free', label: 'Free rewards' }]} />
        {view === 'stages' ? <div {...tabPanelProps('free-reward-type', 'stages')}><PastRewards backlog={presentation ? backlogSources : past.counting} doneKeys={presentation ? demoKeys : past.doneKeys} doneEvents={presentation ? demoEvents : past.doneEvents} annihilationDone={presentation ? demoAnnihilation : past.annihilationDone}
          onKeys={presentation ? setDemoKeys : past.onKeys} onEvents={presentation ? setDemoEvents : past.onEvents} onAnnihilation={presentation ? setDemoAnnihilation : past.onAnnihilation} imported={presentation ? null : past.imported} cleared={presentation ? null : past.cleared} layout="page" />
        </div> : <div {...tabPanelProps('free-reward-type', 'free')}><FreeRewards icons={rewardIcons} rewards={freeRewards} done={keys} onKeys={presentation ? setDemoKeys : past.onKeys} now={clock} /></div>}
      </main>
    </>
  );
}

/* bundledWhenUnpublished: no release before this has /free-op, and on Vercel there is no data/
   to build it from. The builder reads only the back catalogue compiled into the bundle (JSON
   imports). finalize fills what an older release lacks, as /pulls does. */
export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/free-op', async () => {
  const { bundledBacklogSources } = await import('@/lib/pulls/sources');
  const { default: free } = await import('@/data/free-rewards.json');
  const { freeRewardIcons } = await import('@/lib/pulls/rewardIcons');
  return { props: { backlogSources: bundledBacklogSources(), freeRewards: free.rewards, rewardIcons: freeRewardIcons(free.rewards) } };
}, {
  bundledWhenUnpublished: true,
  finalize: async (props) => {
    const { bundledBacklogSources } = await import('@/lib/pulls/sources');
    const { default: free } = await import('@/data/free-rewards.json');
    const { rewardTrackerArt } = await import('@/lib/pulls/rewardIcons');
    const freeRewards = (props.freeRewards ?? free.rewards).filter(reward => !('endAt' in reward) || !reward.endAt || reward.endAt > props.now);
    return { ...props, freeRewards, ...rewardTrackerArt(freeRewards, props.rewardIcons, props.__contentRelease), backlogSources: fillFromDeployment(props.backlogSources, bundledBacklogSources()) };
  },
});
