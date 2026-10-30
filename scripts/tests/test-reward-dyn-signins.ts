import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rewardClaimsFromGame } from '../../lib/account/rewardClaims';

/* The owner's save for activity_table's dynActs (2026-10-22): the Recommended Monthly Card's
   30 days, counted claimed (13), and a three-day video login, its history 0 per claimed day.
   The rows themselves are built in arkpedia-data's importer (its
   scripts/tests/test-reward-dyn-signins.ts). */

test("the owner's save ticks 13 Monthly Card days and all three video days, and nothing past them", () => {
  const claims = rewardClaimsFromGame({ activity: {
    CHECKIN_ACCESS: { act3access: { rewardsCount: 13, currentStatus: 0, lastTs: 1792580400 } },
    CHECKIN_VIDEO: { act3video: { lastTs: 1791630000, history: [0, 0, 0] } },
  } });
  const access = claims.claimed.filter(id => id.startsWith('free:act3access:'));
  assert.equal(access.length, 13);
  assert.ok(access.includes('free:act3access:13') && !claims.known.includes('free:act3access:14'));
  assert.deepEqual(claims.claimed.filter(id => id.startsWith('free:act3video:')), ['free:act3video:1', 'free:act3video:2', 'free:act3video:3']);
});
