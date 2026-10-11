import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountFromGame, parseAccount } from '../../lib/account/accountStore';
import { makeFriendFile, parseFriendFile } from '../../lib/account/friendFile';
import { medalsFromGame, parseMedalCollection, obtainedMedal, medalSetProgress, type Medal, type MedalSet } from '../../lib/account/medals';
import { loadMedalCatalogue } from '../../lib/account/medalCatalogue';
import { contentUrl } from '../../lib/content/urls';

test('medal metadata uses the page content release, with a local path for local previews', () => {
  assert.equal(contentUrl('/medal-catalogue.json'), '/medal-catalogue.json');
  assert.equal(contentUrl('/medal-catalogue.json', { release: 'test', baseUrl: 'https://content.example/releases/test', assets: {} }), 'https://content.example/releases/test/public/medal-catalogue.json');
});

test('sync medal progress is not ownership until a positive completion timestamp exists', () => {
  assert.equal(medalsFromGame(undefined), undefined);
  assert.deepEqual(medalsFromGame({}), []);
  assert.deepEqual(medalsFromGame({
    medal_pending: { id: 'medal_pending', val: [[21, 30]], fts: -1, rts: -1 },
    medal_owned: { id: 'medal_owned', fts: 1700000000, rts: 1700100000 },
    medal_rerun: { fts: -1, rts: 1700200000 },
    medal_bad: { fts: Infinity },
  }), [{ id: 'medal_owned', obtainedAt: new Date(1700000000000).toISOString() }, { id: 'medal_rerun', obtainedAt: new Date(1700200000000).toISOString() }]);
  assert.deepEqual(medalsFromGame([{ id: 'medal_owned', fts: 1700000000 }]), [{ id: 'medal_owned', obtainedAt: new Date(1700000000000).toISOString() }]);
});

test('account persistence and friend exports preserve full collections independently of the display board', () => {
  const account = accountFromGame({ status: { nickName: 'Medal Doctor' }, medal: { medals: { medal_owned: { fts: 1700000000 }, medal_unowned: { fts: -1, rts: -1 } } } }, { version: 1, chars: {} }, 'en');
  assert.deepEqual(account.profile?.medalCollection, [{ id: 'medal_owned', obtainedAt: new Date(1700000000000).toISOString() }]);
  assert.deepEqual(account.profile?.medals, []);
  assert.deepEqual(parseAccount(JSON.stringify(account))?.profile?.medalCollection, account.profile?.medalCollection);
  const shared = parseFriendFile(JSON.stringify(makeFriendFile(account, {})));
  assert.deepEqual(shared.account.profile?.medalCollection, account.profile?.medalCollection);
  assert.equal(shared.account.wallet, undefined);
  const legacy = { ...account, profile: { ...account.profile!, medalCollection: undefined } };
  assert.equal(parseFriendFile(JSON.stringify(makeFriendFile(legacy, {}))).account.profile?.medalCollection, undefined);
  assert.equal(parseMedalCollection([{ id: '../unsafe' }]), undefined);
  assert.deepEqual(parseMedalCollection([{ id: 'medal_owned', obtainedAt: 'bad' }]), [{ id: 'medal_owned', obtainedAt: null }]);
});

test('trimmed medals fulfil base membership and set completion requires every part, with known dates', () => {
  const medal: Medal = { id: 'base', advanced: 'trimmed', origin: null, name: 'Base', type: 'activityMedal', rarity: 'T1', description: '', requirement: '', icon: null };
  const other = { ...medal, id: 'other', advanced: null };
  const set: MedalSet = { id: 'set', name: 'Set', description: '', type: 'activityMedal', medals: ['base', 'other'], color: '#000000' };
  const map = new Map([['base', medal], ['other', other]]);
  const owned = new Map([['trimmed', { id: 'trimmed', obtainedAt: '2026-10-01T00:00:00.000Z' }]]);
  assert.equal(obtainedMedal(medal, owned)?.id, 'trimmed');
  assert.deepEqual(medalSetProgress(set, map, owned), { count: 1, complete: false, completedAt: null });
  owned.set('other', { id: 'other', obtainedAt: '2026-10-05T00:00:00.000Z' });
  assert.deepEqual(medalSetProgress(set, map, owned), { count: 2, complete: true, completedAt: '2026-10-05T00:00:00.000Z' });
  assert.equal(obtainedMedal({ ...medal, id: 'trimmed', advanced: null }, new Map([['base', { id: 'base', obtainedAt: null }]])), undefined);
  assert.equal(medalSetProgress(set, map, new Map([['base', { id: 'base', obtainedAt: null }], ['other', { id: 'other', obtainedAt: null }]])).completedAt, null);
});

test('catalogue follows the content release, falls back only for absent new files, and retries failures', async () => {
  const original = globalThis.fetch;
  const catalogue = { version: 1, medals: [{ id: 'a', name: 'A', type: 'playerMedal', description: '', requirement: '', icon: null }], sets: [], categories: [] };
  const calls: string[] = [];
  globalThis.fetch = async input => { calls.push(String(input)); return new Response(JSON.stringify(catalogue), { status: String(input).includes('old-release') ? 404 : 200 }); };
  try {
    assert.deepEqual(await loadMedalCatalogue('https://content.example/old-release/public/medal-catalogue.json'), catalogue);
    assert.deepEqual(calls, ['https://content.example/old-release/public/medal-catalogue.json', '/medal-catalogue.json']);
    await loadMedalCatalogue('https://content.example/old-release/public/medal-catalogue.json');
    assert.equal(calls.length, 2);
    globalThis.fetch = async () => new Response('unavailable', { status: 503 });
    await assert.rejects(loadMedalCatalogue('https://content.example/retry/medal-catalogue.json'));
    globalThis.fetch = async () => new Response(JSON.stringify(catalogue));
    assert.deepEqual(await loadMedalCatalogue('https://content.example/retry/medal-catalogue.json'), catalogue);
  } finally { globalThis.fetch = original; }
});
