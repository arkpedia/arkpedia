import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getOperatorIconPath } from '../../lib/operators/operatorIcon';
import farmingFixture from './fixtures/people-farming.json';
import operatorFixture from './fixtures/operator-costs.json';
import { emptyCatalogue } from './fixtures/catalogue';
import assert from 'node:assert/strict';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { checkCompleteness, hasRecordedRelease, missingEnemyIcons, readCompletenessInputs } from '../content/check-completeness.mjs';
// @ts-expect-error Node import scripts are plain JavaScript.
import { buildEventFarming } from '../sync/sync-event-farming.mjs';
import { activeEventFarming, getEventFarmingMaterials } from '../../lib/farming/eventFarming';
import { operatorRelease } from '../../lib/operators/operatorAvailability';

const input = readCompletenessInputs();
test('the published catalogue covers CN source identities and every release bundle', () => {
  assert.deepEqual(checkCompleteness(input), []);
});
test('publication rejects missing operators, outfits, banners, event records and artwork', () => {
  for (const [field, remove, expected] of [
    ['operators', (row: any) => row.internalName === 'char_4217_makoto', /CN operator missing: char_4217_makoto/],
    ['skins', (row: any) => row.skinId === 'char_4217_makoto@p3r#1', /CN outfit missing: char_4217_makoto/],
    ['banners', (row: any) => input.bundles[0].bannerIds.includes(row.cnPoolId), /Bundle banner missing/],
    ['events', (row: any) => row.activityId === input.bundles[0].eventId, /Bundle event missing/],
  ] as const) {
    const broken = { ...input, [field]: input[field].filter((row: any) => !remove(row)) };
    assert.match(checkCompleteness(broken).join('\n'), expected);
  }
  const assets = new Set(input.assets);
  assets.delete('one-star-icons/Koromaru - Base.webp');
  assert.match(checkCompleteness({ ...input, assets }).join('\n'), /missing asset one-star-icons\/Koromaru/);
  const newer = { ...input.inventory, operators: [...input.inventory.operators, { id: 'char_new', name: 'New CN operator' }] };
  assert.match(checkCompleteness({ ...input, inventory: newer }).join('\n'), /CN operator missing: char_new/);
});
/* A data tree holding only what the enemy checks read: a listed stage fielding two
   enemies, and an unlisted stage fielding a third that nothing needs. `edit` takes away
   whatever a case is about before the release gate runs on the tree. */
function enemyGate(edit: (tree: { records: { slug: string; name: string; icon: string }[]; index: string[]; icons: string[] }) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-completeness-'));
  try {
    const tree = {
      records: [{ slug: 'slug-a', name: 'Slug A', icon: '/enemies-icons/Slug A.webp' }, { slug: 'slug-b', name: 'Slug B', icon: '/enemies-icons/Slug B.webp' }],
      index: ['slug-a', 'slug-b'],
      icons: ['enemies-icons/Slug A.webp', 'enemies-icons/Slug B.webp'],
    };
    edit(tree);
    const write = (file: string, data: unknown) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), JSON.stringify(data));
    };
    for (const file of ['data/skins.json', 'data/headhunting_banners.json', 'data/content-bundles.json', 'data/events/events_2026.json']) write(file, []);
    write('data/content-inventory.json', { operators: [], skins: [] });
    write('data/assets/external-asset-index.json', { files: tree.icons });
    write('data/stages/test-1.json', { slug: 'test-1', enemies: { by_rank: { normal: [{ slug: 'slug-a' }] }, conditional: { by_rank: { elite: [{ slug: 'slug-b' }] } } } });
    write('data/stages/unlisted.json', { slug: 'unlisted', enemies: { by_rank: { normal: [{ slug: 'slug-unlisted' }] } } });
    write('data/enemies/Test Event.json', { enemies: tree.records });
    write('public/stages-index.json', [{ slug: 'test-1' }]);
    write('public/enemies-index.json', tree.index.map(slug => ({ slug })));
    const run = spawnSync(process.execPath, ['scripts/content/check-completeness.mjs', root], { encoding: 'utf8' });
    return { status: run.status, output: run.stdout + run.stderr };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
test('publication rejects a stage enemy with no record or grid row, and never withholds a release for its icon', () => {
  const complete = enemyGate(() => {});
  assert.equal(complete.status, 0, complete.output);
  assert.match(complete.output, /and 2 stage enemies/);
  assert.doesNotMatch(complete.output, /not published yet/);
  // A new enemy whose icon the image sync has not published yet is reported and released:
  // the sync finds new icons in the published records, so blocking here would deadlock.
  const iconless = enemyGate(tree => { tree.icons = ['enemies-icons/Slug A.webp']; });
  assert.equal(iconless.status, 0, iconless.output);
  assert.match(iconless.output, /1 enemy icon\(s\) not published yet.*\n {2}enemies-icons\/Slug B\.webp\n/);
  // With no record or no grid row, its stage links 404, so the release is blocked.
  const unrecorded = enemyGate(tree => { tree.records = tree.records.filter(record => record.slug !== 'slug-b'); });
  assert.equal(unrecorded.status, 1);
  assert.match(unrecorded.output, /Stage enemy has no record: slug-b \(fielded in test-1\)/);
  const unindexed = enemyGate(tree => { tree.index = ['slug-b']; });
  assert.equal(unindexed.status, 1);
  assert.match(unindexed.output, /Stage enemy missing from enemies-index\.json: slug-a \(fielded in test-1\)/);
});
test('unpublished enemy icons are listed once each and in order, and never count as errors', () => {
  const icon = (name: string) => `/enemies-icons/${name}.webp`;
  const enemyRecords = new Map([['b', { name: 'B', icon: icon('B') }], ['b-elite', { name: 'B', icon: icon('B') }],
    ['a', { name: 'A', icon: icon('A') }], ['no-icon', { name: 'No icon yet' }], ['published', { name: 'P', icon: icon('P') }]]);
  const catalogue = emptyCatalogue({ stageEnemies: new Map([...enemyRecords.keys()].map(slug => [slug, 'test-1'])), enemyRecords,
    enemyIndex: new Set(enemyRecords.keys()), assets: new Set(['enemies-icons/P.webp']) });
  assert.deepEqual(missingEnemyIcons(catalogue), ['enemies-icons/A.webp', 'enemies-icons/B.webp']);
  assert.deepEqual(checkCompleteness(catalogue), []);
});
// Surtr's cost lists, frozen in a fixture: the live record may change with any refresh.
const costRecord = () => structuredClone(operatorFixture.operator);
const withOperator = (edit: (op: any) => void, op: any = costRecord()) => {
  edit(op);
  return checkCompleteness(emptyCatalogue({ operators: [op] })).join('\n');
};
test('publication rejects nested or malformed material cost lists', () => {
  assert.equal(withOperator(() => {}), '');
  // The hand-written Persona shape that crashed the image sync.
  assert.match(withOperator(op => { op.potential.totalCost = [[{ name: "Surtr's Token", quantity: 5 }]]; }),
    /Surtr: potential\.totalCost is not a flat/);
  for (const [edit, expected] of [
    [(op: any) => { op.promotion[0].cost = [op.promotion[0].cost]; }, /Surtr: promotion\[0\]\.cost is not a flat/],
    [(op: any) => { op.skills.skillCost['2'] = [op.skills.skillCost['2']]; }, /Surtr: skillCost\.2 is not a flat/],
    [(op: any) => { op.skills.skillList[0].cost.m1 = [op.skills.skillList[0].cost.m1]; }, /Surtr: skills\[0\]\.cost\.m1 is not a flat/],
    [(op: any) => { op.modules[1].stages[0].cost = [op.modules[1].stages[0].cost]; }, /Surtr: modules\[1\]\.stages\[0\]\.cost is not a flat/],
    [(op: any) => { op.potential.totalCost = { name: "Surtr's Token", quantity: 5 }; }, /Surtr: potential\.totalCost is not a flat/],
    [(op: any) => { op.potential.totalCost = [{ name: "Surtr's Token", quantity: '5' }]; }, /Surtr: potential\.totalCost is not a flat/],
  ] as const) assert.match(withOperator(edit), expected);
  assert.equal(withOperator(op => { op.potential.totalCost = []; }), '');
});
test('a CN record without a release date must be marked as future', () => {
  // A made-up CN-only record, so the case does not end when a real one reaches Global.
  const cnRecord = () => Object.assign(costRecord(), { name: 'Unreleased CN operator', internalName: 'char_9999_cnonly', sourceRegion: 'CN', isFuture: true });
  const withCnRecord = (edit: (op: any) => void) => withOperator(edit, cnRecord());
  const released = /Unreleased CN operator: CN record has no release date and is not marked isFuture/;
  assert.match(withCnRecord(op => { delete op.isFuture; op.characterInfo['Release Date'] = null; }), released);
  assert.match(withCnRecord(op => { op.isFuture = false; op.characterInfo['Release Date'] = ''; }), released);
  assert.match(withCnRecord(op => { delete op.isFuture; op.characterInfo['Release Date'] = 'TBA'; }), released);
  assert.equal(withCnRecord(op => { op.isFuture = true; op.characterInfo['Release Date'] = null; }), '');
  // A dated record follows its date. Once Global launches it reads as released even
  // while the EN mirror still lags, so the guard must not block that release.
  assert.equal(withCnRecord(op => { delete op.isFuture; op.characterInfo['Release Date'] = '2026/09/01'; }), '');
  assert.equal(withCnRecord(op => { delete op.isFuture; delete op.sourceRegion; op.characterInfo['Release Date'] = null; }), '');
});
test('the release-date guard makes the same call as the site', () => {
  const edges = [null, '', '  ', 'TBA', '2026/10/04', '2026-2-30', '2026/13/01', 'October 4, 2026']
    .map(date => ({ characterInfo: { 'Release Date': date } }));
  const exact = ['2026-10-14T03:00:00Z', '2026-10-14T10:00:00+08:00', '2026-10-14T03:00:00', 'soon']
    .map(releaseAt => ({ releaseAt, characterInfo: { 'Release Date': null } }));
  for (const op of [...input.operators, ...edges, ...exact, { characterInfo: null }]) {
    assert.equal(hasRecordedRelease(op), operatorRelease(op) !== null, JSON.stringify({ releaseAt: op.releaseAt, date: op.characterInfo?.['Release Date'] }));
  }
});
test('home farming is limited to battle windows, independently of shop closing times', () => {
  const materials = getEventFarmingMaterials(farmingFixture.drops);
  const now = Date.parse('2026-09-22T12:00:00Z');
  const pairs = activeEventFarming(materials, now).map(m => [m.name, m.stages.map(s => s.label).join(',')]);
  assert.deepEqual(pairs.sort(), [['Aketon', 'PA-7'], ['Crystalline Component', 'PA-8'], ['Sugar Pack', 'PA-6']]);
  const sample = materials.flatMap(m => m.stages.map(s => ({ ...m, stages: [s] }))).find(m => m.stages[0].label === 'PA-6')!;
  const { startAt, endAt } = sample.stages[0];
  assert.equal(activeEventFarming([sample], Date.parse(startAt!) - 1).length, 0);
  assert.equal(activeEventFarming([sample], Date.parse(startAt!)).length, 1);
  assert.equal(activeEventFarming([sample], Date.parse(endAt!) - 1).length, 1);
  assert.equal(activeEventFarming([sample], Date.parse(endAt!)).length, 0);
});
test('farming importer ignores shop currency, first clears, CN guesses and non-repeatable stages', () => {
  const stage = { stageType: 'ACTIVITY', difficulty: 'NORMAL', canBattleReplay: true, code: 'TEST-8',
    stageDropInfo: { displayRewards: [{ type: 'MATERIAL', id: 'material', dropType: 'NORMAL' },
      { type: 'MATERIAL', id: 'first', dropType: 'COMPLETE' }, { type: 'ACTIVITY_ITEM', id: 'currency', dropType: 'NORMAL' }] } };
  const items = { items: Object.fromEntries(['material', 'first', 'currency'].map(id => [id, { name: id, rarity: 'TIER_3', classifyType: 'MATERIAL' }])) };
  const tables = { stages: { valid: stage, unknown: stage, firstOnly: { ...stage, canBattleReplay: false } },
    stageValidInfo: { valid: { startTs: 100, endTs: 200 }, firstOnly: { startTs: 100, endTs: 200 } } };
  assert.deepEqual(buildEventFarming(tables, items), [{ stageId: 'valid', stage: 'TEST-8', itemId: 'material', material: 'material', startAt: '1970-01-01T00:01:40.000Z', endAt: '1970-01-01T00:03:21.000Z' }]);
});

test('a new runtime CN record can use published portrait art without a website rebuild',()=>{
  assert.equal(getOperatorIconPath({name:'Future imported operator',rarity:6,isFuture:true,sourceRegion:'CN'}),'/six-star-icons/Future%20imported%20operator%20-%20Base.webp');
  assert.equal(getOperatorIconPath({name:'Unverified placeholder',rarity:6,isFuture:true}),'/future_operator_icons/Unverified%20placeholder.webp');
});
