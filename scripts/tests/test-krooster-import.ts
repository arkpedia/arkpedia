import test from 'node:test';
import assert from 'node:assert/strict';
import { KROOSTER_USER, accountFromKrooster, parseKroosterPage, profileFromData } from '../../lib/account-import/krooster';
import type { GameAccountMap } from '../../lib/planner/gameAccount';

// A Krooster lookup page carries its profile in the page's embedded data (Pages Router __NEXT_DATA__).
const page = (data: unknown) => `<!doctype html><html><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { data, username: 'tester' } }, page: '/network/lookup/[[...user]]' })}</script></body></html>`;
const data = {
  roster: {
    char_002_amiya: { elite: 2, level: 40, op_id: 'char_002_amiya', modules: { uniequip_002_amiya: 0 }, masteries: [0, 0, 0], potential: 6, skill_level: 7, user_id: 'secret', favorite: false },
    char_1001_amiya2: { elite: 2, level: 40, op_id: 'char_1001_amiya2', modules: {}, masteries: [0, 2], potential: 6, skill_level: 7 },
    char_289_gyuki: { elite: 2, level: 90, modules: { uniequip_002_gyuki: 3, uniequip_003_gyuki: 1 }, masteries: [0, 3], potential: 1, skill_level: 7 },
    char_502_nblade: { elite: 0, level: 30, modules: {}, masteries: [], potential: 6, skill_level: 1 },
    char_9999_future: { elite: 1, level: 55, modules: {}, masteries: [1], potential: 2, skill_level: 4 },
    'not a char id': { elite: 2, level: 90 },
  },
  account: { user_id: 'secret', username: 'tester', display_name: 'Tester', private: false, server: 'EN', assistant: 'char_289_gyuki', friendcode: { tag: '0000', username: 'secret' }, level: 120 },
  supports: [],
};
const map: GameAccountMap = { version: 1, chars: {
  char_002_amiya: { name: 'Amiya', modules: { uniequip_002_amiya: 0 } },
  char_1001_amiya2: { name: 'Amiya (Guard)', modules: {}, formOf: 'char_002_amiya' },
  char_289_gyuki: { name: 'Hoshiguma', modules: { uniequip_002_gyuki: 0, uniequip_003_gyuki: 1 } },
  char_502_nblade: { name: 'Nightmare', modules: {} },
} };

test('a lookup page parses to the roster and a few profile fields, nothing private', () => {
  const profile = parseKroosterPage(page(data))!;
  assert.ok(profile);
  assert.equal(profile.username, 'tester');
  assert.equal(profile.displayName, 'Tester');
  assert.equal(profile.server, 'EN');
  assert.equal(profile.level, 120);
  assert.equal(profile.assistant, 'char_289_gyuki');
  assert.deepEqual(Object.keys(profile.roster).sort(), ['char_002_amiya', 'char_1001_amiya2', 'char_289_gyuki', 'char_502_nblade', 'char_9999_future']);
  assert.deepEqual(profile.roster.char_289_gyuki, { elite: 2, level: 90, potential: 1, skillLevel: 7, masteries: [0, 3], modules: { uniequip_002_gyuki: 3, uniequip_003_gyuki: 1 } });
  assert.ok(!JSON.stringify(profile).includes('secret'), 'user ids and friend codes are left behind');
});

test('no page data, a private profile or a page without the script is no profile', () => {
  assert.equal(parseKroosterPage('<html><body>nothing</body></html>'), null);
  assert.equal(parseKroosterPage(page(null)), null);
  assert.equal(parseKroosterPage(page({ roster: {}, account: { ...data.account, private: true } })), null);
  assert.equal(profileFromData({ roster: {} }), null);
});

test('the profile becomes an account record and planner roster by the map, unknown ids listed', () => {
  const now = new Date('2026-11-04T00:00:00Z');
  const { record, roster, unknown } = accountFromKrooster(parseKroosterPage(page(data))!, map, now);
  assert.equal(record.version, 1);
  assert.equal(record.server, 'en');
  assert.equal(record.importedAt, now.toISOString());
  assert.equal(record.doctor, 'Tester (Krooster)');
  assert.deepEqual(record.operators, ['Amiya', 'Amiya (Guard)', 'Hoshiguma', 'Nightmare']);
  assert.deepEqual(record.operatorIds, ['char_002_amiya', 'char_1001_amiya2', 'char_289_gyuki', 'char_502_nblade', 'char_9999_future']);
  assert.deepEqual(record.profile?.secretary, 'Hoshiguma');
  assert.equal(record.profile?.level, 120);
  assert.equal(record.base, undefined);
  assert.deepEqual(unknown, ['char_9999_future']);
  // Modules: 0 is not unlocked, a stage n is the planner's 0-based index n - 1; masteries by skill index.
  assert.deepEqual(roster.Hoshiguma, { elite: 2, level: 90, skillLevel: 7, masteries: { 1: 3 }, potential: 1, modules: { 0: 2, 1: 0 } });
  assert.deepEqual(roster.Amiya, { elite: 2, level: 40, skillLevel: 7, masteries: {}, potential: 6 });
  assert.deepEqual(roster['Amiya (Guard)'], { elite: 2, level: 40, skillLevel: 7, masteries: { 1: 2 }, potential: 6 });
  assert.equal(record.operatorBuilds, roster);
});

test('usernames are the characters a Krooster handle may hold', () => {
  for (const ok of ['tester', 'a.b-c_d', 'Mocchi123']) assert.ok(KROOSTER_USER.test(ok), ok);
  for (const bad of ['', 'with space', 'a/b', 'x'.repeat(33), '../etc']) assert.ok(!KROOSTER_USER.test(bad), bad);
});
