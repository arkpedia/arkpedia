import { useRegionalTime } from '@/lib/time/useRegionalTime';
import { currentRegionalFreeRewards, regionalFreeRewards, type RegionalSchedules } from '@/lib/time/regional';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { remainingBacklog } from '@/lib/pulls/pulls';
import type { GetStaticProps } from 'next';
import type { ContentRelease } from '@/lib/content/types';
import Head from 'next/head';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import DataLink from '@/components/account/DataLink';
import Image from '@/components/content/ContentImage';
import InfoPopover from '@/components/ui/InfoPopover';
import { PastRewards } from '@/components/pulls/PastRewards';
import { withContentPage } from '@/lib/content/server';
import { formatNumber, formatOneDecimal } from '@/lib/pulls/format';
import { fillFromDeployment, ORUNDUM_PER_ORIGINITE, ORUNDUM_PER_PULL, type BacklogSources } from '@/lib/pulls/pulls';
import { usePastRewards } from '@/lib/pulls/usePastRewards';
import { PAST_PROGRESS_UNREAD } from '@/lib/pulls/pastProgress';
import FreeRewards from '@/components/pulls/FreeRewards';
import { allFreeRewards, freeOperatorsToClaim, freeRewardsForAccount, freeRewardTotals, importClaimedBeginner, rosterClaimedWelfare, rosterOperatorIds, type FreeReward, type LockedReason } from '@/lib/pulls/freeRewards';
import { excludeStageKinds, type StageKind } from '@/lib/pulls/stageKinds';
import { useRewardFilters } from '@/lib/pulls/rewardTrackerFilters';
import type { OperatorPreviewItem } from '@/components/operators/OperatorPreview';
import { FreeOperatorPreview, WelfareCard } from '@/components/pulls/FreeOperator';
import { useReaderClock } from '@/lib/time/readerClock';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import StickyControls from '@/components/ui/StickyControls';
import { useSwitchHold } from '@/components/ui/useSwitchHold';
import { useQueryState } from '@/lib/hooks/useQueryState';

/*
 * The Reward Tracker (the Planner menu): every first-clear reward the game still owes the
 * reader -- the main story's and the playable events' Originite Prime, the resource stages',
 * and Annihilation's Orundum -- as its own page, the way the Skin Planner is the Pull
 * Planner's skin section on its own. The ticks are the ones the Pull Planner's Past events
 * popup shows (lib/pulls/usePastRewards.ts): one list, two places to keep it.
 *
 * The stage toggles leave the kinds of hard stage a reader cannot clear out of the totals and
 * the Unclaimed lists (lib/pulls/stageKinds.ts); each is off until the reader turns it on, and
 * kept in this browser (lib/pulls/rewardTrackerFilters.ts). The welfare operators are the ones
 * still obtainable now (lib/pulls/freeRewards.ts obtainableWelfare): Record Restoration's, and
 * an open event's own. An imported roster ticks every welfare row of an operator it holds
 * (rosterClaimedWelfare), while it holds it; and every beginner row its save records as
 * received (importClaimedBeginner). Those rows show locked.
 */

const STAGE_FILTERS: { kind: StageKind; label: string }[] = [
  { kind: 'challenge', label: 'Exclude Challenge Mode' },
  { kind: 'h', label: 'Exclude H stages' },
  { kind: 'adverse', label: 'Exclude Adverse Environment' },
  { kind: 's', label: 'Exclude S stages' },
];

const NO_ROWS: ReadonlyMap<string, LockedReason> = new Map();

interface Props {
  /** The release's back catalogue (lib/pulls/sources.ts), as /pulls carries it. */
  backlogSources: BacklogSources;
  freeRewards?: FreeReward[];
  rewardIcons?: Record<string, string>;
  now: number;
  __contentRelease?: ContentRelease;
  __contentTables?: { 'regional-schedules'?: RegionalSchedules };
}

export default function FreeOpPage({ backlogSources, freeRewards: globalFreeRewards = [], rewardIcons = {}, now }: Props) {
  const { server, schedule } = useRegionalTime();
  const freeRewards = regionalFreeRewards(globalFreeRewards, schedule, server);
  const clock = useReaderClock(now, { tickMs: 1000, onFocus: true });
  const [viewQuery, setView] = useQueryState('view', 'stages');
  const view = viewQuery === 'free' ? 'free' : 'stages';
  const viewHold = useSwitchHold('reward-tracker');
  const [excluded, setExcluded] = useRewardFilters();
  const past = usePastRewards(backlogSources, excluded);
  const [presentation, setPresentation] = useState(false);
  const [demoKeys, setDemoKeys] = useState(new Set<string>());
  const [demoEvents, setDemoEvents] = useState(new Set<string>());
  const [demoAnnihilation, setDemoAnnihilation] = useState(false);
  /* The presentation view counts everything uncleared, its stage filters still applied. */
  const demo = useMemo(() => excludeStageKinds(past.backlog, excluded, null), [past.backlog, excluded]);
  const remaining = presentation ? remainingBacklog(demo.backlog, demoEvents, demoKeys, demoAnnihilation) : past.remaining;
  const leftOut = presentation
    ? [...demo.backlog.chapters.filter(c => !demoKeys.has(c.id)), ...demo.backlog.playable.filter(e => !demoEvents.has(e.id))].reduce((sum, item) => sum + (demo.dropped[item.id] ?? 0), 0)
    : past.leftOut;
  const eligible = freeRewardsForAccount(freeRewards, past.account);
  const roster = useMemo(() => rosterOperatorIds(past.account), [past.account]);
  const locked = useMemo(() => new Map<string, LockedReason>([...[...rosterClaimedWelfare(eligible, roster)].map(id => [id, 'roster'] as const),
    ...importClaimedBeginner(eligible, past.account?.rewardClaims)]), [eligible, roster, past.account]);
  const keys = useMemo(() => presentation ? demoKeys : locked.size ? new Set([...past.doneKeys, ...locked.keys()]) : past.doneKeys, [presentation, demoKeys, locked, past.doneKeys]);
  /* A locked tick is the import's, not a mark to store: a change elsewhere keeps it out of the saved keys. */
  const onFreeKeys = presentation ? setDemoKeys : (next: Set<string>) => past.onKeys(new Set([...next].filter(key => !locked.has(key) || past.doneKeys.has(key))));
  const timed = freeRewardTotals(eligible.filter(reward => !reward.forecast), keys, clock);
  const originitePrime = remaining.originitePrime + timed.op;
  const orundum = remaining.orundum - remaining.originitePrime * ORUNDUM_PER_ORIGINITE + timed.orundum;
  const permits = remaining.permits + timed.permits;
  const pulls = (originitePrime * ORUNDUM_PER_ORIGINITE + orundum) / ORUNDUM_PER_PULL + permits;
  const operators = freeOperatorsToClaim(eligible, keys, clock);
  const [preview, setPreview] = useState<OperatorPreviewItem | null>(null);
  const closePreview = useCallback(() => setPreview(null), []);
  /* Ticking a welfare operator in Free rewards, below, takes its row out of this list: the
     list holds the tallest height it has had, so the page never shortens under the reader
     (the Anti-Page Jump rule). The floor starts again whenever what the list is read from
     settles: the saved progress loads, or an import's claims are applied. Kept from the first
     paint, it was the height with every welfare operator listed, before those trimmed it, and
     the panel stayed that tall over one card (2026-10-21). */
  const welfareRef = useRef<HTMLDivElement>(null);
  const welfareBasis = `${past.progress === PAST_PROGRESS_UNREAD}|${past.account?.importedAt ?? ''}|${past.imported?.at ?? ''}`;
  useLayoutEffect(() => {
    const list = welfareRef.current;
    if (!list) return;
    list.style.minHeight = '';
    let floor = 0;
    const observer = new ResizeObserver(() => { if (list.offsetHeight > floor) { floor = list.offsetHeight; list.style.minHeight = `${floor}px`; } });
    observer.observe(list);
    return () => observer.disconnect();
  }, [welfareBasis]);
  return (
    <>
      <Head><title>Reward Tracker — Arkpedia</title></Head>
      <PageHeader eyebrow="Rhodes Island // Reward Tracker" title="Reward Tracker"
        sub="Track first clears, free rewards and the pulls still waiting for you."
        actions={<><DataLink /><Link prefetch={false} href="/pulls" className="ghost btn-sm">Pull Planner</Link><InfoPopover label="About Reward Tracker"><p>Your first-clear and permanent reward completion is shared with the Pull Planner. Mark rewards as claimed below, or use Import / export to fill completion from your account.</p></InfoPopover></>} />
      <main className="free-op-page">
        <section className="op-section free-op-overview" aria-labelledby="free-op-left">
          <div className="free-op-heading">
            <h2 id="free-op-left">Still to claim</h2>
            <label className="check"><input type="checkbox" checked={presentation} onChange={event => { setPresentation(event.target.checked); setDemoKeys(new Set()); setDemoEvents(new Set()); setDemoAnnihilation(false); }} />Fully uncompleted view</label>
          </div>
          {presentation && <p className="hint free-op-demo-note">Presentation view. Your saved completion stays unchanged.</p>}
          <dl className="free-op-summary">
            <div><Image src="/material-icons/Originite%20Prime.webp" alt="" width={48} height={48} /><dt>Originite Prime</dt><dd>{formatNumber(originitePrime)}</dd></div>
            <div><Image src="/material-icons/Orundum.webp" alt="" width={48} height={48} /><dt>Orundum</dt><dd>{formatNumber(orundum)}</dd></div>
            <div><Image src="/material-icons/Headhunting%20Permit.webp" alt="" width={48} height={48} /><dt>Headhunting permits</dt><dd>{formatNumber(permits)}</dd></div>
            <div className="free-op-pull-total"><Image src="/material-icons/Headhunting%20Permit.webp" alt="" width={48} height={48} /><dt>Worth, in pulls</dt><dd>{formatOneDecimal(pulls)}</dd></div>
          </dl>
          {/* Always the same lines, whatever is on, each short enough for one line on a phone: a
              toggle changes numbers, never the height. */}
          <fieldset className="free-op-filters">
            <legend>Stage exclusions <InfoPopover label="About stage exclusions"><p>Leave out stage types you cannot clear yet. The totals and unclaimed stage lists update together; your completion marks stay saved.</p></InfoPopover></legend>
            <div className="free-op-stage-choices">{STAGE_FILTERS.map(({ kind, label }) => <label key={kind} className="check free-op-stage-choice"><input type="checkbox" checked={excluded.has(kind)} onChange={event => setExcluded(kind, event.target.checked)} />{label}</label>)}</div>
          </fieldset>
          <p className="hint free-op-excluded" aria-live="polite">{excluded.size
            ? `${formatNumber(leftOut)} ${leftOut === 1 ? 'stage' : 'stages'} left out, ${formatNumber(leftOut)} OP.`
            : 'Every stage counts.'}</p>
          <div ref={welfareRef} className="free-op-welfare">
            <h3>Welfare operators</h3>
            {operators.length
              ? <ul className="free-op-welfare-list" aria-label="Welfare operators to claim">{operators.map(({ reward, operator }) =>
                  <WelfareCard key={`${reward.id}:${operator.id}`} reward={reward} operator={operator} icon={rewardIcons[operator.id]} server={server} now={clock} onPreview={setPreview} />)}</ul>
              : <p className="hint free-op-welfare-empty">No welfare operator to claim right now.</p>}
          </div>
        </section>
        <StickyControls><Tabs label="Reward type" id="free-reward-type" value={view} onChange={value => { viewHold.capture(); setView(value); }} options={[{ value: 'stages', label: 'Stage rewards' }, { value: 'free', label: 'Free rewards' }]} /></StickyControls>
        <div ref={viewHold.ref} style={viewHold.style}>
        {view === 'stages' ? <div {...tabPanelProps('free-reward-type', 'stages')}><PastRewards backlog={presentation ? demo.backlog : past.counting} dropped={presentation ? demo.dropped : past.dropped} doneKeys={presentation ? demoKeys : past.doneKeys} doneEvents={presentation ? demoEvents : past.doneEvents} annihilationDone={presentation ? demoAnnihilation : past.annihilationDone}
          onKeys={presentation ? setDemoKeys : past.onKeys} onEvents={presentation ? setDemoEvents : past.onEvents} onAnnihilation={presentation ? setDemoAnnihilation : past.onAnnihilation} imported={presentation ? null : past.imported} cleared={presentation ? null : past.cleared} layout="page" />
        </div> : <div {...tabPanelProps('free-reward-type', 'free')}><FreeRewards icons={rewardIcons} rewards={eligible} done={keys} locked={presentation ? NO_ROWS : locked} onKeys={onFreeKeys} now={clock} server={server} /></div>}
        </div>
      </main>
      {preview && <FreeOperatorPreview key={preview.name} item={preview} onClose={closePreview} nativeModal />}
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
  const rewards = allFreeRewards(free);
  return { props: { backlogSources: bundledBacklogSources(), freeRewards: rewards, rewardIcons: freeRewardIcons(rewards) } };
}, {
  bundledWhenUnpublished: true,
  finalize: async (props) => {
    const { bundledBacklogSources } = await import('@/lib/pulls/sources');
    const { default: free } = await import('@/data/free-rewards.json');
    const { rewardTrackerArt } = await import('@/lib/pulls/rewardIcons');
    const freeRewards = currentRegionalFreeRewards(props.freeRewards ?? allFreeRewards(free), props.__contentTables?.['regional-schedules'], props.now);
    return { ...props, freeRewards, ...rewardTrackerArt(freeRewards, props.rewardIcons, props.__contentRelease), backlogSources: fillFromDeployment(props.backlogSources, bundledBacklogSources()) };
  },
});
