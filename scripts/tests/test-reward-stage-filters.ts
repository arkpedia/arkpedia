import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { excludeStageKinds, NO_STAGE_EXCLUSIONS, stageKindsOf, type StageKind, type StageKindRecord } from '../../lib/pulls/stageKinds';
import { backlogFromAccount, fillFromDeployment, remainingBacklog, unclaimedBacklog, type BacklogSources } from '../../lib/pulls/pulls';
import { parseRewardFilters } from '../../lib/pulls/rewardTrackerFilters';
import { freeOperatorsToClaim, type FreeReward } from '../../lib/pulls/freeRewards';
import { buildFreeRewards } from '../build/build-free-rewards.mjs';

/* The site's own stage records, as build-pull-sources.ts reads them: Originite Prime stages only. */
const STAGES = path.join(process.cwd(), 'data', 'stages');
const records = new Map<string, StageKindRecord & { id: string }>();
for (const file of fs.readdirSync(STAGES)) {
  if (!file.endsWith('.json')) continue;
  const rec = JSON.parse(fs.readFileSync(path.join(STAGES, file), 'utf8'));
  if ((rec.drops ?? []).some((drop: { item?: { id?: string } }) => drop.item?.id === '4002')) records.set(rec.id, rec);
}

test('each kind of hard stage is classified from the stage records, the way stage_table files it', () => {
  const kinds = (id: string) => { const rec = records.get(id); assert.ok(rec, id); return stageKindsOf(rec); };
  assert.deepEqual(kinds('hard_11-01'), ['h'], 'H11-1: stageType SUB, diffGroup TOUGH');
  assert.deepEqual(kinds('hard_05-01'), ['h'], 'H5-1: an H stage stage_table files under diffGroup NONE');
  assert.deepEqual(kinds('tough_11-01'), ['adverse'], 'Adverse Environment: diffGroup TOUGH');
  assert.deepEqual(kinds('tough_11-18'), ['adverse'], 'a tough_ stage the records file as sub is still Adverse, not H');
  assert.deepEqual(kinds('main_11-01'), []);
  assert.deepEqual(kinds('act13d5_ex01#f#'), ['challenge'], "Maria Nearl's EX Challenge Mode: difficulty FOUR_STAR");
  assert.deepEqual(kinds('act13d5_ex01'), []);
  assert.deepEqual(kinds('main_01-01#f#'), ['challenge'], "the main story's Challenge Mode too");
  assert.deepEqual(kinds('act13side_s01'), ['s'], 'NL-S-1');
  assert.deepEqual(kinds('act13side_s01#f#'), ['challenge', 's'], 'an S stage in Challenge Mode is both');
  assert.deepEqual(kinds('act25side_s01_a'), ['s'], 'CW-S-1-A');
  assert.deepEqual(kinds('tr_s_1'), [], 'TR-S-1 is a training stage, not an event S stage');
  assert.deepEqual(kinds('main_15-02#s'), [], 'six-star stages are none of the four');
});

test('the classification covers every H and Adverse Environment stage the game ships, and nothing else', () => {
  const ids = (kind: StageKind) => [...records.values()].filter((rec) => stageKindsOf(rec).includes(kind)).map((rec) => rec.id);
  const h = ids('h'); const adverse = ids('adverse');
  assert.ok(h.length >= 49 && h.every((id) => id.startsWith('hard_')));
  assert.deepEqual(h.length, [...records.keys()].filter((id) => id.startsWith('hard_')).length);
  assert.ok(adverse.length >= 85 && adverse.every((id) => id.startsWith('tough_')));
  assert.deepEqual(adverse.length, [...records.keys()].filter((id) => id.startsWith('tough_')).length);
  assert.ok(ids('challenge').every((id) => id.endsWith('#f#')));
  assert.ok(ids('s').every((id) => records.get(id)!.stage_type === 'activity'));
});

const chapter = { id: 'main_11', label: 'Episode 11', name: 'Return To Mist', op: 4,
  stages: ['hard_11-01', 'main_11-01', 'main_11-02', 'tough_11-01'], stageCodes: ['H11-1', '11-1', '11-2', '11-1'],
  stageKinds: [['h'], [], [], ['adverse']] as StageKind[][] };
const event = { id: 'act13sre', name: 'Near Light', op: 3, stages: ['act13side_01', 'act13side_s01', 'act13side_s01#f#'],
  stageCodes: ['NL-1', 'NL-S-1', 'NL-S-1 CM'], stageKinds: [[], ['s'], ['challenge', 's']] as StageKind[][], start: '2022-04-28' };
const backlog: BacklogSources = { chapters: [chapter], playable: [event], originiteByStageType: {}, annihilationOrundum: 0, annihilation: [], resources: [], paradox: [], freeRewards: [] };

test('a toggle takes its stages out of the totals, the stage lists and what each item pays', () => {
  assert.equal(remainingBacklog(backlog, new Set(), new Set(), false).originitePrime, 7);
  const { backlog: left, dropped } = excludeStageKinds(backlog, new Set<StageKind>(['h', 's']), null);
  assert.deepEqual(dropped, { main_11: 1, act13sre: 2 });
  assert.equal(left.chapters[0].op, 3);
  assert.deepEqual(left.chapters[0].stageCodes, ['11-1', '11-2', '11-1']);
  assert.deepEqual(left.playable[0].stages, ['act13side_01']);
  assert.equal(remainingBacklog(left, new Set(), new Set(), false).originitePrime, 4);
  // Challenge Mode alone takes only the S stage's Challenge Mode.
  assert.deepEqual(excludeStageKinds(backlog, new Set<StageKind>(['challenge']), null).dropped, { act13sre: 1 });
  // Off by default: nothing changes, not even the object.
  assert.equal(excludeStageKinds(backlog, NO_STAGE_EXCLUSIONS, null).backlog, backlog);
});

test('with an import, a toggle takes out only the excluded stages still uncleared, and never ticks anything', () => {
  const cleared = new Set(['main_11-01', 'main_11-02', 'act13side_01', 'act13side_s01']);
  const fromAccount = backlogFromAccount(backlog, cleared, null);
  const counting = unclaimedBacklog(backlog, fromAccount.sources);
  assert.equal(counting.chapters[0].op, 2);
  const { backlog: left, dropped } = excludeStageKinds(counting, new Set<StageKind>(['h', 'adverse', 's']), cleared);
  // Episode 11 has only its H and Adverse stages left: it pays nothing, and stays unticked.
  assert.equal(left.chapters[0].op, 0);
  assert.deepEqual(dropped, { main_11: 2, act13sre: 1 });
  assert.ok(!fromAccount.doneKeys.has('main_11'), 'the import ticks from the unfiltered catalogue');
  // An item the import cleared in full and the reader unticked counts in full, and loses all its excluded stages.
  const all = new Set(chapter.stages);
  const full = unclaimedBacklog(backlog, backlogFromAccount(backlog, all, null).sources);
  assert.equal(excludeStageKinds(full, new Set<StageKind>(['h']), all).backlog.chapters[0].op, 3);
});

test('a release from before stage kinds were kept takes them from the deployment, only for the same stages', () => {
  const old = { ...backlog, chapters: [{ ...chapter, stageKinds: undefined }], playable: [{ ...event, stageKinds: undefined, stages: [...event.stages, 'act13side_02'], stageCodes: undefined }] };
  const filled = fillFromDeployment(old, backlog);
  assert.deepEqual(filled.chapters[0].stageKinds, chapter.stageKinds);
  assert.equal(filled.playable[0].stageKinds, undefined, 'different stage ids keep no kinds');
  assert.equal(excludeStageKinds(filled, new Set<StageKind>(['s']), null).backlog.playable[0].op, 3, 'an item without kinds stays whole');
});

test('the stored toggles parse strictly and keep only known kinds', () => {
  assert.equal(parseRewardFilters(null), null);
  assert.equal(parseRewardFilters('{"exclude":"h"}'), null);
  assert.deepEqual(parseRewardFilters('{"exclude":["s","bogus","challenge"]}'), { exclude: ['challenge', 's'] });
});

test('welfare operators come from an event\'s missions, Global only, open while its stages are', () => {
  const start = Date.parse('2026-09-16T08:00:00Z') / 1000; const end = Date.parse('2026-09-30T03:59:59Z') / 1000;
  // The Global tables: act51side's missions give Botani. A CN-only event's operator is in no Global
  // table, so an event-rewards entry naming one adds nothing.
  const result = buildFreeRewards({
    handbook: { handbookStageData: {} }, missions: { missions: {}, missionGroups: {} }, checkin: { groups: {} },
    openServer: { schedule: [{ id: 'starter', startTs: 0 }], dataMap: {}, constant: { firstDiamondShardMailCount: 1 } },
    items: { items: {} }, shops: { shopGPDataDict: {} },
    characters: { char_4223_botany: { name: 'Botani', rarity: 'TIER_5' }, char_4215_buddy: { name: 'Buddy', rarity: 3 } },
    activity: { activity: {}, basicInfo: { act51side: { name: 'People, A People', startTime: start, endTime: end, rewardEndTime: end + 7 * 86400 } },
      missionData: [{ id: '51sideActivity_4', type: 'ACTIVITY', missionGroup: 'act51side', description: 'Clear PA-4', rewards: [{ type: 'CHAR', id: 'char_4223_botany', count: 1 }] },
        { id: '51sideActivity_5', type: 'ACTIVITY', missionGroup: 'act51side', description: 'Clear PA-5', rewards: [{ type: 'GOLD', id: '4001', count: 1000 }] }] },
    eventRewards: { events: {
      '[Side Story] People, A People': { activity: 'act51side', groups: [{ kind: 'missions', title: 'Event missions', items: [
        { name: 'Botani', count: 1, kind: 'operator', id: 'char_4223_botany' }, { name: 'LMD', count: 1000, kind: 'currency', id: '4001' }] }] },
      '[Crossover] CN only': { activity: 'act50side', region: 'CN', groups: [{ kind: 'missions', items: [{ name: 'Buddy', count: 1, kind: 'operator', id: 'char_4215_buddy' }] }] },
    } },
  });
  const welfare = result.rewards.filter((reward) => reward.group === 'Welfare operators');
  assert.deepEqual(welfare, [{ id: 'free:51sideActivity_4', group: 'Welfare operators', name: 'Botani · Event missions: Clear PA-4',
    rewards: [{ id: 'char_4223_botany', rarity: 5, name: 'Botani', count: 1 }], startAt: start * 1000, endAt: (end + 1) * 1000,
    event: 'People, A People', href: '/events/%5BSide%20Story%5D%20People%2C%20A%20People', forecast: false }]);

  const rows = welfare as FreeReward[];
  assert.deepEqual(freeOperatorsToClaim(rows, new Set(), start * 1000).map(({ operator }) => operator.name), ['Botani']);
  assert.deepEqual(freeOperatorsToClaim(rows, new Set([rows[0].id]), start * 1000), [], 'claimed');
  assert.deepEqual(freeOperatorsToClaim(rows, new Set(), (end + 1) * 1000), [], 'closed with the event stages');
});

test('a welfare operator row gets the operator\'s icon, as the page shows it', async () => {
  const { freeRewardIcons } = await import('../../lib/pulls/rewardIcons');
  const icons = freeRewardIcons([{ id: 'free:welfare:act_test:char_4196_reckpr', group: 'Welfare operators', name: 'Botani', forecast: false,
    rewards: [{ id: 'char_4196_reckpr', name: 'Botani', count: 1 }] } as never]);
  assert.equal(icons.char_4196_reckpr, '/five-star-icons/Botani - Base.webp');
});
