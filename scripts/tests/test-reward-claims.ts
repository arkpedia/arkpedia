import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rewardClaimsFromGame, mergeRewardClaims, parseRewardClaims } from '../../lib/account/rewardClaims';
import { accountFromGame, parseAccount } from '../../lib/account/accountStore';
import { chibiDimensions } from '../../lib/operators/chibiSize';

test('imported claims distinguish collected from eligible, survive backup and replace known manual ticks', () => {
  const user = { mission: { missions: { MAIN: { main_1: { state: 3 }, main_2: { state: 2 }, bad: { state: '3' } }, OPENSERVER: { starter: { state: 3 } } }, missionGroups: { guide_g_1: 1, guide_g_2: 0 } }, checkIn: { longTermRecvRecord: { signin_1: 1, signin_2: 0 } } };
  const claims = rewardClaimsFromGame(user);
  assert.deepEqual(claims.claimed, ['free:guide_g_1', 'free:main_1', 'free:signin_1', 'free:starter']);
  assert.ok(!claims.known.includes('free:bad'));
  assert.deepEqual(mergeRewardClaims(['free:main_2', 'free:welcome-mail'], claims).sort(), [...claims.claimed, 'free:welcome-mail'].sort());
  const account = accountFromGame(user, { chars: {}, items: {} } as any, 'en');
  assert.deepEqual(parseAccount(JSON.stringify(account))?.rewardClaims, claims);
  assert.deepEqual(mergeRewardClaims(['free:welcome-mail']), ['free:welcome-mail']);
  assert.equal(parseRewardClaims({ known: ['invalid'], claimed: [] }), undefined);
});

test('chibis fit small viewports at every supported size', () => {
  for (const size of [50, 100, 125, 200]) for (const [w, h] of [[320, 568], [1200, 800], [200, 200]]) {
    const box = chibiDimensions(size, w, h);
    assert.ok(box.width <= w - 16 && box.height <= h - 16);
    assert.ok(Math.abs(box.width / box.height - 8 / 9) < .001);
  }
});
