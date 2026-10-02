import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserImports, pages, pathToTarget } from './browser-graph';
import eventRewards from '../../data/pull-event-rewards.json';
import { backlogFromAccount, bannerHaul, fillStageIds, remainingBacklog, type BacklogSources } from '../../lib/pulls/pulls';
import { resolvePullEventSchedule } from '../../lib/pulls/schedule';
import type { getAllEvents } from '../../lib/schedule/schedule';

/*
 * The pull planner once imported data/pull-sources.json into the browser. The
 * page's schedule came from the live content release, the back catalogue from
 * whatever the last deploy compiled in, so a Global event the release already
 * listed as playable ('People, A People', 27 OP) was skipped by one and never
 * counted by the other until somebody redeployed. The browser must only ever see
 * the release's copy, which the page gets through getStaticProps.
 */
const BUNDLED = ['data/pull-sources.json', 'data/pull-first-clears.json'];
const pathToBundled = (entry: string, clientOnly = true) => pathToTarget(entry, BUNDLED, { clientOnly });

test('no page ships the bundled pull data to the browser', () => {
  const all = pages();
  assert.ok(all.includes('pages/pulls.tsx'));
  // The walk is not vacuous: the server half of /pulls does reach the bundled
  // data, through getStaticProps, and the browser half reaches the planner code.
  assert.deepEqual(pathToBundled('pages/pulls.tsx', false)?.at(-1)?.startsWith('data/pull-'), true);
  assert.ok(browserImports('pages/pulls.tsx', true).includes('components/pulls/PastRewards.tsx'));
  assert.ok(browserImports('pages/pulls.tsx', true).includes('lib/pulls/pulls.ts'));
  assert.ok(!browserImports('pages/pulls.tsx', true).includes('lib/pulls/sources.ts'));
  const leaks = all.flatMap(page => { const chain = pathToBundled(page); return chain ? [chain.join(' -> ')] : []; });
  assert.deepEqual(leaks, [], 'Browser code must read the back catalogue from the page props (BacklogSources), which carry the content release, not from data/.');
});

/** The release's back catalogue with one event the deployed bundle has never heard of. */
function withReleaseOnly(bundled: BacklogSources, event: { id: string; name: string; op: number; stages: string[] }): BacklogSources {
  assert.ok(!bundled.playable.some(known => known.id === event.id || known.name === event.name));
  return { ...bundled, playable: [...bundled.playable, event] };
}

/* A made-up back catalogue and calendar. The live ones change with every refresh:
   the day the last scheduled event that pays Originite joins the back catalogue,
   a test that looked one up in them would fail the release. */
const bundled: BacklogSources = {
  chapters: [{ id: 'main_01', label: 'Episode 01', name: 'Chapter', op: 20, stages: Array.from({ length: 20 }, (_, i) => `main_01-${i}`) }],
  originiteByStageType: { daily: 12, main: 99, activity: 99 },
  annihilationOrundum: 1800,
  playable: [{ id: 'act_old', name: 'Old Event', op: 24, stages: Array.from({ length: 24 }, (_, i) => `act_old_${i}`) }],
  resources: [{ id: 'resource:wk_melee_1', name: 'Tough Siege', amount: 2 }],
  annihilation: [{ id: 'annihilation:camp_r_01', name: 'Chernobog', amount: 400 }],
};
// resolvePullEventSchedule reads the rewards file itself; any event in it that pays
// Originite will do, given a window of its own.
const reward = eventRewards.find(event => event.op > 0 && !/rerun/i.test(event.event));

test('an event only the content release lists is counted, once', () => {
  const none = new Set<string>();
  const release = withReleaseOnly(bundled, { id: 'act_release_only', name: 'Release Only', op: 27, stages: Array.from({ length: 27 }, (_, i) => `act_release_only_${i}`) });
  assert.equal(remainingBacklog(release, none, none, false).originitePrime, remainingBacklog(bundled, none, none, false).originitePrime + 27);
  assert.equal(remainingBacklog(release, new Set(['act_release_only']), none, false).originitePrime, remainingBacklog(bundled, none, none, false).originitePrime);

  /* The schedule marks it inBacklog from the SAME object, so bannerHaul hands it
     over to the back catalogue rather than losing it between the two. */
  assert.ok(reward, 'data/pull-event-rewards.json lists an event that pays Originite');
  const events = [{ name: reward.event, global: { dateRange: '2030/01/01–2030/01/15' } }] as unknown as ReturnType<typeof getAllEvents>;
  const before = resolvePullEventSchedule(events, bundled);
  const target = before.find(event => event.name === reward.event);
  assert.ok(target && target.op > 0 && !target.inBacklog && !target.rerun);
  const moved = withReleaseOnly(bundled, { id: 'act_release_only', name: target.event!, op: target.op, stages: [] });
  const after = resolvePullEventSchedule(events, moved);
  assert.equal(after.find(event => event.name === target.name)?.inBacklog, true);
  const farFuture = new Date('2099-12-31T23:59:59Z');
  const counted = (sources: BacklogSources, schedule: typeof before) =>
    bannerHaul(schedule, farFuture, { cleared: none }).op + remainingBacklog(sources, none, none, false).originitePrime;
  assert.equal(counted(moved, after), counted(bundled, before));
  assert.equal(bannerHaul(after, farFuture, { cleared: none }).op, bannerHaul(before, farFuture, { cleared: none }).op - target.op);
});

test("an imported account's cleared stages say what is left, stage by stage", () => {
  const cleared = new Set([...bundled.chapters[0].stages!, ...bundled.playable[0].stages!.slice(0, 20), 'wk_melee_1']);
  const fromAccount = backlogFromAccount(bundled, cleared, new Set(['camp_r_01']));
  // The chapter is done; the event is worth its four uncleared stages; the resource stage and
  // the Annihilation map are done.
  assert.deepEqual([...fromAccount.doneKeys].sort(), ['annihilation:camp_r_01', 'main_01', 'resource:wk_melee_1']);
  assert.equal(fromAccount.sources.playable[0].op, 4);
  assert.deepEqual([...fromAccount.doneEvents], []);
  const left = remainingBacklog(fromAccount.sources, fromAccount.doneEvents, fromAccount.doneKeys, false);
  // The event's 4, and the resource stages' 12 less the 2 the cleared one paid.
  assert.equal(left.originitePrime, 4 + 10);
  assert.equal(left.annihilationOrundum, 1800 - 400);
  // A record from before Annihilation was kept leaves the maps to the reader's ticks.
  assert.ok(![...backlogFromAccount(bundled, cleared, null).doneKeys].includes('annihilation:camp_r_01'));
});

test('a release from before stage ids were kept takes them from the deployment, and an item neither has counts in full', () => {
  // The nightly release is compiled by main's code: dev met one without stages and the
  // page crashed reading them.
  const strip = <T extends { stages?: string[] }>({ stages: _, ...item }: T) => item;
  const extra = { id: 'act99new', name: 'Newer than the deploy', op: 30 };
  const release: BacklogSources = { ...bundled, chapters: bundled.chapters.map(strip), playable: [...bundled.playable.map(strip), extra] };
  const filled = fillStageIds(release, bundled);
  assert.deepEqual(filled.chapters[0].stages, bundled.chapters[0].stages);
  assert.deepEqual(filled.playable[0].stages, bundled.playable[0].stages);
  assert.equal(filled.playable.at(-1)!.stages, undefined);
  const cleared = new Set([...bundled.chapters[0].stages!, ...bundled.playable[0].stages!]);
  const fromAccount = backlogFromAccount(filled, cleared, null);
  assert.equal(fromAccount.sources.chapters[0].op, 0);
  assert.equal(fromAccount.sources.playable.at(-1)!.op, 30);
  assert.ok(!fromAccount.doneEvents.has('act99new'));
  // Nothing filled at all still counts, rather than throwing.
  assert.doesNotThrow(() => backlogFromAccount(release, cleared, null));
});

