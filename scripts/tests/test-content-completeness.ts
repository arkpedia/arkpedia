import test from 'node:test';
import { getOperatorIconPath } from '../../lib/operators/operatorIcon';
import farmingFixture from './fixtures/people-farming.json';
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
test('publication rejects a stage enemy with no record or grid row, and never withholds a release for its icon', () => {
  const slug = [...input.stageEnemies.keys()].find((s: string) => input.enemyRecords.get(s)?.icon);
  assert.ok(slug, 'a listed stage fields an enemy with an icon');
  const records = new Map(input.enemyRecords);
  records.delete(slug);
  assert.match(checkCompleteness({ ...input, enemyRecords: records }).join('\n'), new RegExp(`Stage enemy has no record: ${slug} `));
  const index = new Set(input.enemyIndex);
  index.delete(slug);
  assert.match(checkCompleteness({ ...input, enemyIndex: index }).join('\n'), new RegExp(`Stage enemy missing from enemies-index.json: ${slug} `));
  const icon = input.enemyRecords.get(slug).icon.slice(1);
  const assets = new Set(input.assets);
  assets.delete(icon);
  assert.deepEqual(checkCompleteness({ ...input, assets }), []);
  assert.deepEqual(missingEnemyIcons({ ...input, assets }), [icon]);
});
test('publication rejects nested or malformed material cost lists', () => {
  const withOperator = (name: string, edit: (op: any) => void) => {
    const op = structuredClone(input.operators.find((row: any) => row.name === name));
    edit(op);
    return checkCompleteness({ ...input, operators: input.operators.map((row: any) => row.name === name ? op : row) }).join('\n');
  };
  // The hand-written Persona shape that crashed the image sync.
  assert.match(withOperator('Aegis', op => { op.potential.totalCost = [[{ name: "Aegis's Token", quantity: 5 }]]; }),
    /Aegis: potential\.totalCost is not a flat/);
  for (const [edit, expected] of [
    [(op: any) => { op.promotion[0].cost = [op.promotion[0].cost]; }, /Surtr: promotion\[0\]\.cost is not a flat/],
    [(op: any) => { op.skills.skillCost['2'] = [op.skills.skillCost['2']]; }, /Surtr: skillCost\.2 is not a flat/],
    [(op: any) => { op.skills.skillList[0].cost.m1 = [op.skills.skillList[0].cost.m1]; }, /Surtr: skills\[0\]\.cost\.m1 is not a flat/],
    [(op: any) => { op.modules[1].stages[0].cost = [op.modules[1].stages[0].cost]; }, /Surtr: modules\[1\]\.stages\[0\]\.cost is not a flat/],
    [(op: any) => { op.potential.totalCost = { name: "Surtr's Token", quantity: 5 }; }, /Surtr: potential\.totalCost is not a flat/],
    [(op: any) => { op.potential.totalCost = [{ name: "Surtr's Token", quantity: '5' }]; }, /Surtr: potential\.totalCost is not a flat/],
  ] as const) assert.match(withOperator('Surtr', edit), expected);
  assert.equal(withOperator('Surtr', op => { op.potential.totalCost = []; }), '');
});
test('a CN record without a release date must be marked as future', () => {
  const withMechanist = (edit: (op: any) => void) => {
    const op = structuredClone(input.operators.find((row: any) => row.name === 'Mechanist'));
    edit(op);
    return checkCompleteness({ ...input, operators: input.operators.map((row: any) => row.name === 'Mechanist' ? op : row) }).join('\n');
  };
  const released = /Mechanist: CN record has no release date and is not marked isFuture/;
  assert.match(withMechanist(op => { delete op.isFuture; op.characterInfo['Release Date'] = null; }), released);
  assert.match(withMechanist(op => { op.isFuture = false; op.characterInfo['Release Date'] = ''; }), released);
  assert.match(withMechanist(op => { delete op.isFuture; op.characterInfo['Release Date'] = 'TBA'; }), released);
  assert.equal(withMechanist(op => { op.isFuture = true; op.characterInfo['Release Date'] = null; }), '');
  // A dated record follows its date. Once Global launches it reads as released even
  // while the EN mirror still lags, so the guard must not block that release.
  assert.equal(withMechanist(op => { delete op.isFuture; op.characterInfo['Release Date'] = '2026/09/01'; }), '');
  assert.equal(withMechanist(op => { delete op.isFuture; delete op.sourceRegion; op.characterInfo['Release Date'] = null; }), '');
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
