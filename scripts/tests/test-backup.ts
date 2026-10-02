import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BACKUP_KIND, BACKUP_STORES, formatBackup, parseBackup } from '../../lib/account/backup';
import { readImportFile } from '../../lib/account/importFile';

const memory = (entries: Record<string, string>) => ({ getItem: (key: string) => (key in entries ? entries[key] : null) });
const account = JSON.stringify({ version: 1, server: 'en', importedAt: '2026-10-02T12:00:00.000Z', doctor: 'D#1', operators: ['Amiya'], skins: [], cleared: ['main_00-01'] });
const pullPlan = { version: 1, orundum: '600', originite: '', permits: '', reservedOP: '', until: '2026-11-01', manualEventDate: '', bannerName: '', monthlyCard: false, includeBacklog: false, annihilationDone: false, doneEvents: [], doneKeys: [], clearedReruns: [], future: {}, goals: [] };
const stored = {
  arkpediaAccount: account,
  plannerRoster: JSON.stringify({ Amiya: { elite: 2, level: 50, skillLevel: 7, masteries: {} } }),
  plannerDepot: JSON.stringify({ 'Orirock Cube': 12 }),
  plannerCrafting: JSON.stringify(['Orirock Cluster']),
  plannerState: JSON.stringify({ selectedNames: ['Amiya'], builderStates: { Amiya: { elite: 2 } } }),
  'arkpedia.pull-plan.v1': JSON.stringify(pullPlan),
  arkpediaSkinPlan: JSON.stringify(['skin_a']),
  musicFavorites: JSON.stringify(['song']),
  theme: 'dark',
  arkpediaGameLogin: JSON.stringify({ token: 'secret' }),
};

test('a backup carries every store the site keeps for the reader, and nothing of this browser or a login', () => {
  const text = formatBackup(memory(stored), new Date('2026-10-02T15:00:00Z'));
  const file = JSON.parse(text);
  assert.equal(file.kind, BACKUP_KIND);
  assert.deepEqual(Object.keys(file.stores).sort(), ['arkpedia.pull-plan.v1', 'arkpediaAccount', 'arkpediaSkinPlan', 'musicFavorites', 'plannerCrafting', 'plannerDepot', 'plannerRoster', 'plannerState']);
  assert.ok(!text.includes('secret') && !('theme' in file.stores));
  // Every store round-trips to the text its page reads back.
  const back = parseBackup(text);
  assert.ok(back && back !== 'invalid');
  for (const store of back.stores) assert.deepEqual(JSON.parse(store.raw), JSON.parse(stored[store.key as keyof typeof stored]), store.key);
  assert.ok(BACKUP_STORES.every((store) => store.key !== 'arkpediaGameLogin' && store.key !== 'theme'));
});

test('a backup is read all or nothing, a store it lacks is left alone, and a newer version is refused', () => {
  const file = JSON.parse(formatBackup(memory(stored)));
  assert.equal(parseBackup(JSON.stringify({ ...file, stores: { ...file.stores, plannerDepot: { 'Orirock Cube': -4 } } })), 'invalid');
  assert.equal(parseBackup(JSON.stringify({ ...file, stores: { ...file.stores, arkpediaAccount: { version: 2 } } })), 'invalid');
  assert.equal(parseBackup(JSON.stringify({ ...file, version: 99 })), 'invalid');
  const partial = parseBackup(JSON.stringify({ ...file, stores: { musicFavorites: ['x'], unknownStore: 1 } }));
  assert.ok(partial && partial !== 'invalid');
  assert.deepEqual(partial.stores.map((store) => store.key), ['musicFavorites']);
  // Not a backup at all: for the next reader.
  assert.equal(parseBackup('{"kind":"arkpedia-planner"}'), null);
});

test('the dialog tells a backup, a pull plan and a planner file apart, and refuses a broken one with a reason', () => {
  const aliases = { aliases: {} } as never;
  assert.equal(readImportFile(formatBackup(memory(stored)), aliases).kind, 'backup');
  assert.equal(readImportFile(JSON.stringify(pullPlan), aliases).kind, 'pull-plan');
  const bundle = JSON.stringify({ kind: 'arkpedia-planner', version: 1, savedAt: '', depot: { 'Orirock Cube': 3 }, operators: {}, goals: { selectedNames: [], builderStates: {} }, crafting: [] });
  assert.equal(readImportFile(bundle, aliases).kind, 'planner');
  const broken = readImportFile(JSON.stringify({ kind: BACKUP_KIND, version: 1, stores: { plannerDepot: 'nope' } }), aliases);
  assert.equal(broken.kind, 'refused');
  assert.equal(readImportFile(JSON.stringify({ ...pullPlan, orundum: 'lots' }), aliases).kind, 'refused');
  assert.equal(readImportFile('hello', aliases).kind, 'refused');
});
