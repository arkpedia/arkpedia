import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFriendFile, parseFriendFile, shareableRoster } from '../../lib/account/friendFile';
import { parseAccount, type AccountRecord } from '../../lib/account/accountStore';
import { parseRosterExport, type Roster } from '../../lib/planner/roster';

const account: AccountRecord = {
  version:1, server:'en', importedAt:'2026-10-09T00:00:00Z', doctor:'Friend#1234', operators:['Angelina','Amiya'], skins:['char_291_agl@summer#1'], cleared:['main_01-01'],
  wallet:{orundum:6000,originitePrime:30,permits:10,yellowCerts:180,monthlyCardUntil:null},
  profile:{level:120,registeredAt:'2020-01-16T00:00:00Z',secretary:'Angelina',bio:'Hello!',uid:'123456', supports:[{name:'Angelina',rarity:6,elite:2,level:90,potential:6,skill:3}]},
};
const roster: Roster = {Angelina:{elite:2,level:90,skillLevel:7,masteries:{1:3,2:3},modules:{0:2},potential:6}, Amiya:{elite:1,level:70,skillLevel:7,masteries:{}}, SilverAsh:{elite:2,level:90,skillLevel:7,masteries:{2:3}}};

test('friend round trip preserves collection, profile, potential, skill and module stages', () => {
  const file = makeFriendFile(account,roster,new Date('2026-10-09T00:00:00Z'));
  const read = parseFriendFile(JSON.stringify(file));
  assert.deepEqual(read,file);
  assert.deepEqual(read.roster.Angelina,roster.Angelina);
  assert.equal(read.account.profile?.supports?.[0].potential,6);
});
test('shares only owned builds and explicit profile fields, without account resources or unrelated data', () => {
  const dirty = structuredClone(account) as AccountRecord & { token?: string };
  dirty.token='private';
  Object.assign(dirty.profile!.supports![0],{token:'support-private'});
  Object.assign(dirty.profile!,{email:'private@example.com'});
  const raw=JSON.stringify(makeFriendFile(dirty,roster));
  assert(!raw.includes('private'));
  const read=parseFriendFile(raw);
  assert.equal(read.account.wallet,undefined);
  assert.equal(read.account.pulls,undefined);
  assert.equal(read.roster.SilverAsh,undefined);
  assert.deepEqual(Object.keys(read.roster),['Angelina','Amiya']);
});
test('refuses wrong version, malformed builds, invalid dates, arrays, oversized and non-JSON files', () => {
  const file=makeFriendFile(account,roster);
  for (const raw of ['[]','{',JSON.stringify({...file,version:2}),JSON.stringify({...file,roster:{Angelina:{elite:99}}}),JSON.stringify({...file,exportedAt:'bad'}),'x'.repeat(4*1024*1024+1)]) {
    assert.throws(()=>parseFriendFile(raw));
  }
});
test('untrusted imported extras are stripped again, and proto keys never become operators', () => {
  const file=makeFriendFile(account,roster);
  const read=parseFriendFile(JSON.stringify({...file,account:{...file.account,wallet:account.wallet,token:'secret'},roster:JSON.parse('{"__proto__":{"elite":2,"level":90,"skillLevel":7,"masteries":{}}}')}));
  assert.equal(read.account.wallet,undefined);
  assert.equal(Object.getPrototypeOf(read.roster),Object.prototype);
  assert.deepEqual(Object.keys(read.roster),[]);
});
test('older accounts never borrow a more recent different-server planner roster', () => {
  const jp={...account,server:'jp' as const,importedAt:'2026-10-10T00:00:00Z'};
  assert.deepEqual(shareableRoster(account,[jp],roster),{});
  assert.equal(shareableRoster(account,[],roster),roster);
  assert.equal(shareableRoster({...account,operatorBuilds:roster},[jp],{}),roster);
});
test('per-server snapshots and optional potential survive account and roster storage readers', () => {
  assert.deepEqual(parseAccount(JSON.stringify({...account,operatorBuilds:roster}))?.operatorBuilds,roster);
  assert.equal(parseRosterExport(JSON.stringify(roster))?.Angelina.potential,6);
});
