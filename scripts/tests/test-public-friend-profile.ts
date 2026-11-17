import assert from 'node:assert/strict';
import test from 'node:test';
import { makeFriendFile } from '../../lib/account/friendFile';
import { publicFriendFile, parseFriendLinks } from '../../lib/friends/sharedProfile';

test('public links exclude private fields and unowned planner entries while preserving recorded builds', () => {
  const file = makeFriendFile({ version: 1, server: 'en', importedAt: '2026-11-17T00:00:00Z', doctor: 'Doctor#1234',
    operators: ['Thorns'], skins: ['skin@thorns#1'], cleared: ['main_01-01'],
    profile: { level: 120, registeredAt: '2020-01-01', secretary: 'Thorns', bio: 'PRIVATE BIO', uid: 'PRIVATE UID',
      medals: [{id:'private-medal',x:0,y:0}], supports: [] },
    wallet: {orundum:123,originitePrime:1,permits:0,yellowCerts:0,monthlyCardUntil:null},
  }, {Thorns:{elite:2,level:60,skillLevel:7,masteries:{2:3},modules:{0:2},potential:5},Unowned:{elite:2,level:90,skillLevel:7,masteries:{}}});
  const shared = publicFriendFile(file), text = JSON.stringify(shared);
  for (const privateValue of ['PRIVATE','orundum','Unowned','main_01-01','private-medal']) assert.ok(!text.includes(privateValue), privateValue);
  assert.deepEqual(shared.account.cleared, []);
  assert.equal(shared.account.profile?.uid, null);
  assert.deepEqual(shared.roster.Thorns, file.roster.Thorns);
  assert.equal(file.account.profile?.uid, 'PRIVATE UID', 'manual files retain their existing projection');
});

test('stored public friends are bounded opaque references, not embedded snapshots', () => {
  const id='550e8400-e29b-41d4-a716-446655440000';
  assert.deepEqual(parseFriendLinks(JSON.stringify([id,id,'__proto__',{id,profile:'PRIVATE'}])),[id]);
  assert.deepEqual(parseFriendLinks('{broken'),[]);
  assert.deepEqual(parseFriendLinks(' '.repeat(2501)),[]);
});
