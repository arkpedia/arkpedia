import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { BACKUP_KIND, BACKUP_STORES, applyBackup, formatBackup, parseBackup } from '../../lib/account/backup';
import { readImportFile } from '../../lib/account/importFile';
import { MUSIC_FAVORITES_EVENT, MUSIC_FAVORITES_KEY } from '../../lib/music/musicFavorites';

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

/*
 * A restore happens in place (components/account/DataDialog.tsx): it used to reload the page so
 * every part of it read the restored stores, and the reload ended the music. Now each store tells
 * whatever holds it while the Account page is open, through its event, and the stores nothing
 * holds there are read by their pages when they open. tests/browser/music-resume.spec.ts restores
 * one on the page and checks the player keeps playing with the restored favourites.
 */
test('a restore tells each store\'s readers, each event once, the music player\'s favourites included', () => {
  const file = parseBackup(formatBackup(memory({ ...stored, plannerDepotTouched: '1759400000000' })));
  assert.ok(file && file !== 'invalid');
  const written: Record<string, string> = {};
  const told: string[] = [];
  applyBackup(file, { setItem: (key, value) => { written[key] = value; } }, { dispatchEvent: (event) => { told.push(event.type); return true; } });
  assert.deepEqual(Object.keys(written).sort(), file.stores.map((store) => store.key).sort());
  assert.deepEqual(told, [...new Set(told)], 'each event once');
  const events = new Set(file.stores.flatMap((store) => (store.event ? [store.event] : [])));
  assert.deepEqual(new Set(told), events);
  assert.ok(told.includes(MUSIC_FAVORITES_EVENT), 'the player holds the favourites on every page: it is told');
  assert.equal(BACKUP_STORES.find((store) => store.key === MUSIC_FAVORITES_KEY)?.event, MUSIC_FAVORITES_EVENT);
});

/** The app shell: what is mounted on every page, the Account page included, for the whole visit. */
const SHELL = ['pages/_app.tsx', 'components/layout', 'components/music', 'lib/music', 'lib/nav'];

test('a store no event tells is held by nothing of the app shell', () => {
  const files = SHELL.flatMap((entry) => (entry.endsWith('.tsx') ? [entry]
    : (fs.readdirSync(entry, { recursive: true }) as string[]).filter((rel) => /\.(tsx?|mjs)$/.test(rel)).map((rel) => path.join(entry, rel))));
  // Each key, and the name of any constant lib/ exports it as.
  const constants = new Map<string, string[]>();
  for (const rel of fs.readdirSync('lib', { recursive: true }) as string[]) {
    if (!/\.(tsx?|mjs)$/.test(rel)) continue;
    for (const m of fs.readFileSync(path.join('lib', rel), 'utf8').matchAll(/export const (\w+) = '([^']+)'/g)) constants.set(m[2], [...(constants.get(m[2]) ?? []), m[1]]);
  }
  const silent = BACKUP_STORES.filter((store) => store.event === null);
  assert.ok(silent.length > 0 && silent.length < BACKUP_STORES.length);
  const held: string[] = [];
  for (const store of silent) {
    const names = [store.key, ...(constants.get(store.key) ?? [])];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const name of names) if (text.includes(name)) held.push(`${file} reads ${store.key} (${name})`);
    }
  }
  assert.deepEqual(held, [], 'give the store an event its readers listen for (BACKUP_STORES)');
  // Not vacuous: the favourites are held by the shell, under their constant.
  assert.ok(files.some((file) => /\bMUSIC_FAVORITES_KEY\b/.test(fs.readFileSync(file, 'utf8'))));
});
