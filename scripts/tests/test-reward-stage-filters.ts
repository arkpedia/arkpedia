import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { excludeStageKinds, NO_STAGE_EXCLUSIONS, stageKindsOf, type StageKind, type StageKindRecord } from '../../lib/pulls/stageKinds';
import { backlogFromAccount, fillFromDeployment, remainingBacklog, unclaimedBacklog, type BacklogSources } from '../../lib/pulls/pulls';
import { parseRewardFilters } from '../../lib/pulls/rewardTrackerFilters';
import { excludedParadox, paradoxExclusionKnown } from '../../lib/pulls/paradoxExclusion';
import { freeOperatorsToClaim, type FreeReward } from '../../lib/pulls/freeRewards';

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
  // Since Episode 15 the main story's harder variant is the six-star stage (main_15-09#s, shown
  // "15-10 Adverse Combat"): stage_table difficulty SIX_STAR, diffGroup NONE. Adverse Environment.
  assert.deepEqual(kinds('main_15-02#s'), ['adverse'], 'a six-star stage is Adverse Environment');
  assert.deepEqual(kinds('main_16-01#s'), ['adverse']);
  assert.deepEqual(kinds('main_15-02'), [], 'its normal stage is not');
});

test('the classification covers every H and Adverse Environment stage the game ships, and nothing else', () => {
  const ids = (kind: StageKind) => [...records.values()].filter((rec) => stageKindsOf(rec).includes(kind)).map((rec) => rec.id);
  const h = ids('h'); const adverse = ids('adverse');
  assert.ok(h.length >= 49 && h.every((id) => id.startsWith('hard_')));
  assert.deepEqual(h.length, [...records.keys()].filter((id) => id.startsWith('hard_')).length);
  const sixStar = [...records.values()].filter((rec) => rec.difficulty?.tier === 'six_star').map((rec) => rec.id);
  assert.ok(sixStar.length >= 31 && sixStar.every((id) => /^main_1[5-9]-\d+#s$/.test(id)), 'every six-star stage is a main_NN-NN#s of Episode 15 on');
  assert.ok(adverse.length >= 85 + 31 && adverse.every((id) => id.startsWith('tough_') || sixStar.includes(id)));
  assert.deepEqual(adverse.length, [...records.keys()].filter((id) => id.startsWith('tough_')).length + sixStar.length);
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

test('a release compiled before six-star stages were Adverse leaves them out by their label', () => {
  const episode = { id: 'act4mainss_zone1', label: 'Episode 17', name: 'Critical Phase Transition', op: 3,
    stages: ['main_17-09', 'main_17-09#s', 'main_17-10'], stageCodes: ['17-10', '17-10 Adverse Combat', '17-11'], stageKinds: [[], [], []] as StageKind[][] };
  const old: BacklogSources = { ...backlog, chapters: [episode], playable: [] };
  const { backlog: left, dropped } = excludeStageKinds(old, new Set<StageKind>(['adverse']), null);
  assert.deepEqual(dropped, { act4mainss_zone1: 1 });
  assert.deepEqual(left.chapters[0].stageCodes, ['17-10', '17-11']);
  assert.deepEqual(excludeStageKinds(old, new Set<StageKind>(['challenge']), null).dropped, {}, 'only the Adverse toggle');
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
  assert.deepEqual(parseRewardFilters('{"exclude":[],"paradox":"below-e2"}'), { exclude: [], paradox: 'below-e2' });
  assert.deepEqual(parseRewardFilters('{"exclude":["h"],"paradox":"bogus"}'), { exclude: ['h'] }, 'an unknown Paradox mode counts every simulation');
});

test('Paradox Simulations are left out all, by ownership, or below Elite 2, judged on the imported roster', () => {
  const stages = [
    { id: 'paradox:mem_haak_1', name: 'Aak · Just Take Your Medicine', amount: 200, operatorId: 'char_225_haak', unlock: { elite: 2, level: 1 } },
    { id: 'paradox:mem_12fce_1', name: '12F · Survivor', amount: 200, operatorId: 'char_009_12fce', unlock: { elite: 0, level: 30 } },
    { id: 'paradox:mem_ela_1', name: 'Ela · Mine', amount: 200, operatorId: 'char_4123_ela', unlock: { elite: 2, level: 1 } },
  ];
  const build = (elite: number) => ({ elite, level: 1, skillLevel: 1, masteries: {} });
  const roster = { Aak: build(2), '12F': build(1) };
  assert.deepEqual([...excludedParadox(stages, null, roster)], []);
  assert.deepEqual([...excludedParadox(stages, 'all', undefined)], stages.map((stage) => stage.id), 'all needs no import');
  assert.deepEqual([...excludedParadox(stages, 'unowned', roster)], ['paradox:mem_ela_1']);
  assert.deepEqual([...excludedParadox(stages, 'below-e2', roster)], ['paradox:mem_12fce_1', 'paradox:mem_ela_1'], 'Elite 2 literally, whatever the unlock');
  assert.deepEqual([...excludedParadox(stages, 'unowned', undefined)], [], 'no roster, nothing judged');
  assert.equal(paradoxExclusionKnown('below-e2', undefined), false);
  assert.equal(paradoxExclusionKnown('all', undefined), true);
});

test('a welfare operator is listed while its event\'s stages are open, and not once claimed', () => {
  // The row as arkpedia-data's importer builds it from act51side's missions (its
  // scripts/tests/test-reward-welfare-imports.ts); here it only has to be listed and ticked.
  const start = Date.parse('2026-09-16T08:00:00Z'); const end = Date.parse('2026-09-30T04:00:00Z');
  const rows: FreeReward[] = [{ id: 'free:51sideActivity_4', group: 'Welfare operators', name: 'Botani · Event missions: Clear PA-4',
    rewards: [{ id: 'char_4223_botany', rarity: 5, name: 'Botani', count: 1 }], startAt: start, endAt: end,
    event: 'People, A People', href: '/events/%5BSide%20Story%5D%20People%2C%20A%20People', source: 'event', forecast: false }];
  assert.deepEqual(freeOperatorsToClaim(rows, new Set(), start).map(({ operator }) => operator.name), ['Botani']);
  assert.deepEqual(freeOperatorsToClaim(rows, new Set([rows[0].id]), start), [], 'claimed');
  assert.deepEqual(freeOperatorsToClaim(rows, new Set(), end), [], 'closed with the event stages');
});

test('a welfare operator row gets the operator\'s icon, as the page shows it', async () => {
  const { freeRewardIcons } = await import('../../lib/pulls/rewardIcons');
  const icons = freeRewardIcons([{ id: 'free:welfare:act_test:char_4196_reckpr', group: 'Welfare operators', name: 'Botani', forecast: false,
    rewards: [{ id: 'char_4196_reckpr', name: 'Botani', count: 1 }] } as never]);
  assert.equal(icons.char_4196_reckpr, '/five-star-icons/Botani - Base.webp');
});
