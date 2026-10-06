import assert from 'node:assert/strict';
import { test } from 'node:test';

/* One account per server (lib/account/accountStore.ts, lib/account/importAccount.ts): a reader
   with Global and Japanese accounts keeps both, each with its own pull history, and switches
   which one the pages read. Run against an in-memory browser storage. */
const storage = new Map<string, string>();
(globalThis as any).window = {
  localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); } },
  dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {},
};

const tables = { map: { version: 1 as const, chars: { char_002_amiya: { name: 'Amiya', modules: {} } } }, aliases: { byItemId: {}, byArkgraph: {} }, depotNames: [] };
const user = (uid: string, name: string) => ({ status: { uid, nickName: name, nickNumber: '1' }, troop: { chars: { 1: { charId: 'char_002_amiya', level: 1, evolvePhase: 0 } } } });
const pulls = (at: number) => ({ rows: [{ at, poolId: 'POOL', poolName: 'Pool', charId: 'char_002_amiya', charName: 'Amiya', star: 5 }], error: null });

test('importing another server keeps the first one\'s account and pulls; importing it again joins its own history', async () => {
  storage.clear();
  const { importGameAccount } = await import('../../lib/account/importAccount');
  const { storedAccount, storedOtherAccounts, showAccount, forgetShownAccount, parseOtherAccounts, OTHER_ACCOUNTS_KEY } = await import('../../lib/account/accountStore');
  const at = (day: number) => new Date(`2026-10-0${day}T12:00:00Z`);

  importGameAccount(user('100', 'Global Doctor'), tables, pulls(1_790_000_000), 'en', at(1));
  importGameAccount(user('200', 'Japan Doctor'), tables, pulls(1_790_100_000), 'jp', at(2));
  // The Japanese account is shown; the Global one waits, its pulls with it, never mixed in.
  assert.deepEqual([storedAccount()?.server, storedAccount()?.doctor, storedAccount()?.pulls?.rows.map((row) => row.at)], ['jp', 'Japan Doctor#1', [1_790_100_000]]);
  assert.deepEqual(Object.keys(storedOtherAccounts()), ['en']);
  assert.deepEqual(storedOtherAccounts().en?.pulls?.rows.map((row) => row.at), [1_790_000_000]);

  // Global again: shown, its history joined with what it kept; Japan waits.
  importGameAccount(user('100', 'Global Doctor'), tables, pulls(1_790_200_000), 'en', at(3));
  assert.deepEqual([storedAccount()?.server, storedAccount()?.pulls?.rows.map((row) => row.at)], ['en', [1_790_200_000, 1_790_000_000]]);
  assert.deepEqual(Object.keys(storedOtherAccounts()), ['jp']);

  // The switch swaps which one the pages read; each record is in one place only.
  showAccount('jp');
  assert.equal(storedAccount()?.server, 'jp');
  assert.deepEqual(Object.keys(storedOtherAccounts()), ['en']);
  showAccount('kr');
  assert.equal(storedAccount()?.server, 'jp', 'a server with no record changes nothing');

  // Forgetting the shown one shows the other.
  forgetShownAccount();
  assert.equal(storedAccount()?.server, 'en');
  assert.deepEqual(storedOtherAccounts(), {});
  assert.equal(storage.has(OTHER_ACCOUNTS_KEY), false);
  forgetShownAccount();
  assert.equal(storedAccount(), null);

  // A stored map keeps only records filed under their own server.
  const record = { version: 1, server: 'jp', importedAt: at(1).toISOString(), doctor: null, operators: [], skins: [], cleared: [] };
  assert.deepEqual(Object.keys(parseOtherAccounts(JSON.stringify({ jp: record, kr: record, cn: record, en: 'x' }))), ['jp']);
  assert.deepEqual(parseOtherAccounts('not json'), {});
});

test('a backup carries every server\'s account, and refuses a mislabelled one', async () => {
  storage.clear();
  const { formatBackup, BACKUP_STORES } = await import('../../lib/account/backup');
  const { OTHER_ACCOUNTS_KEY } = await import('../../lib/account/accountStore');
  const record = (server: string) => ({ version: 1, server, importedAt: '2026-10-01T12:00:00.000Z', doctor: null, operators: [], skins: [], cleared: [] });
  storage.set(OTHER_ACCOUNTS_KEY, JSON.stringify({ jp: record('jp'), kr: record('kr') }));
  assert.deepEqual(Object.keys(JSON.parse(formatBackup(window.localStorage)).stores[OTHER_ACCOUNTS_KEY]), ['jp', 'kr']);
  const store = BACKUP_STORES.find((entry) => entry.key === OTHER_ACCOUNTS_KEY)!;
  const mislabelled = JSON.stringify({ kr: record('jp') });
  assert.equal(store.valid(mislabelled, JSON.parse(mislabelled)), false);
});
