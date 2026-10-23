import assert from 'node:assert/strict';
import test from 'node:test';
import { createSettingsStore, exportSettings, getSetting, importSettings, parseSettings, setSetting, SETTINGS_DEFAULTS, SETTINGS_KEY, SETTINGS_VERSION } from '../../lib/settings/siteSettings';

/*
 * The site's preferences in one versioned place (lib/settings/siteSettings.ts), the store a
 * saved account will carry. It has to keep working where storage is refused, ignore what it
 * does not know, and hand the whole set over as one object.
 */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (key) => { map.delete(key); },
    setItem: (key, value) => { map.set(key, String(value)); },
  };
}

test('defaults until set, then the set value, stored under one versioned key', () => {
  const storage = memoryStorage();
  const store = createSettingsStore(() => storage);
  assert.equal(store.get().techniqueDetail, SETTINGS_DEFAULTS.techniqueDetail);
  let heard = 0;
  const stop = store.subscribe(() => { heard += 1; });
  store.set('techniqueDetail', true);
  assert.equal(store.get().techniqueDetail, true);
  assert.equal(heard, 1);
  assert.deepEqual(JSON.parse(storage.getItem(SETTINGS_KEY)!), { version: SETTINGS_VERSION, values: { techniqueDetail: true } });
  // The snapshot is the same object until something changes (useSyncExternalStore needs it).
  assert.equal(store.get(), store.get());
  stop();
});

test('refused storage keeps the change for this visit', () => {
  const refusing = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); } } as unknown as Storage;
  const store = createSettingsStore(() => refusing);
  assert.equal(store.get().techniqueDetail, false);
  store.set('techniqueDetail', true);
  assert.equal(store.get().techniqueDetail, true);
  const none = createSettingsStore(() => null);
  none.set('techniqueDetail', true);
  assert.equal(none.get().techniqueDetail, true);
});

test('a blob it cannot trust falls back to the defaults, setting by setting', () => {
  assert.deepEqual(parseSettings('not json').values, {});
  assert.deepEqual(parseSettings({ version: 1, values: { techniqueDetail: 'yes', unknown: 1 } }).values, {});
  assert.deepEqual(parseSettings(JSON.stringify({ version: 1, values: { techniqueDetail: true } })).values, { techniqueDetail: true });
  const storage = memoryStorage();
  storage.setItem(SETTINGS_KEY, '{"version":1,"values":{"techniqueDetail":42}}');
  assert.equal(createSettingsStore(() => storage).get().techniqueDetail, false);
});

test('exports the chosen settings as one object, and imports one back', () => {
  const aStorage = memoryStorage();
  const a = createSettingsStore(() => aStorage);
  assert.deepEqual(a.exportAll(), { version: SETTINGS_VERSION, values: {} });
  a.set('techniqueDetail', true);
  const exported = a.exportAll();
  assert.deepEqual(exported, { version: SETTINGS_VERSION, values: { techniqueDetail: true } });
  const bStorage = memoryStorage();
  const b = createSettingsStore(() => bStorage);
  b.importAll(JSON.parse(JSON.stringify(exported)));
  assert.equal(b.get().techniqueDetail, true);
  b.importAll({ values: { techniqueDetail: 'no' } });
  assert.equal(b.get().techniqueDetail, true, 'an invalid import changes nothing');
});

test('the site-wide store: what pages and an account will call', () => {
  // No window here, as on the server: the store keeps changes in memory for the visit.
  assert.equal(getSetting('techniqueDetail'), SETTINGS_DEFAULTS.techniqueDetail);
  setSetting('techniqueDetail', true);
  assert.equal(getSetting('techniqueDetail'), true);
  assert.deepEqual(exportSettings(), { version: SETTINGS_VERSION, values: { techniqueDetail: true } });
  importSettings({ version: SETTINGS_VERSION, values: { techniqueDetail: false } });
  assert.equal(getSetting('techniqueDetail'), false);
});
