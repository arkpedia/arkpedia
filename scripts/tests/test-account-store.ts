import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountFromGame, ownedFilter, parseAccount } from '../../lib/account/accountStore';

const MAP = { version: 1 as const, chars: {
  char_300_phenxi: { name: 'Fiammetta', modules: {} },
  char_002_amiya: { name: 'Amiya', modules: {} },
  char_1001_amiya2: { name: 'Amiya (Guard)', modules: {} },
} };

test('an account gives the operators it owns by name, its outfits by skin id and the stages it cleared', () => {
  const record = accountFromGame({
    status: { nickName: 'Doctor', nickNumber: '1234', level: 120, registerTs: 1580712160, secretary: 'char_002_amiya', resume: ' yes ' },
    troop: { chars: {
      1: { charId: 'char_300_phenxi' },
      2: { charId: 'char_002_amiya', tmpl: { char_002_amiya: {}, char_1001_amiya2: {} } },
      3: { charId: 'char_9999_brandnew' },
    } },
    skin: { characterSkins: { 'char_300_phenxi@summer#1': 1, 'char_002_amiya@winter#1': 1 } },
    // The game's stage states: 0 opened, 1 played, 2 cleared, 3 cleared with every star.
    dungeon: { stages: { main_00: { state: 0 }, main_01: { state: 1 }, main_02: { state: 2 }, main_03: { state: 3 } } },
  }, MAP, new Date('2026-10-01T12:00:00Z'));
  assert.deepEqual(record, {
    version: 1, server: 'en', importedAt: '2026-10-01T12:00:00.000Z', doctor: 'Doctor#1234',
    // Amiya's forms each by their own name; one with no record yet is left out.
    operators: ['Amiya', 'Amiya (Guard)', 'Fiammetta'],
    skins: ['char_002_amiya@winter#1', 'char_300_phenxi@summer#1'],
    cleared: ['main_02', 'main_03'],
    profile: { level: 120, registeredAt: '2020-02-03T06:42:40.000Z', secretary: 'Amiya', bio: 'yes' },
  });
  assert.deepEqual(parseAccount(JSON.stringify(record)), record);
});

test('a stored record is read back only when it is a whole one', () => {
  const good = { version: 1, server: 'en', importedAt: '2026-10-01T12:00:00.000Z', doctor: null, operators: [], skins: [], cleared: [] };
  assert.deepEqual(parseAccount(JSON.stringify(good)), good);
  for (const broken of [null, '', '{', '[]', JSON.stringify({ ...good, version: 2 }), JSON.stringify({ ...good, operators: 'Amiya' }), JSON.stringify({ ...good, skins: [1] })]) {
    assert.equal(parseAccount(broken), null, String(broken));
  }
  assert.deepEqual(['owned', 'missing', 'banana', ''].map(ownedFilter), ['owned', 'missing', 'all', 'all']);
});
