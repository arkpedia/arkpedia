import { test } from 'node:test';
import assert from 'node:assert/strict';
import banners from '../../data/headhunting_banners.json';

/*
 * The bundled banner list must still have a running Kernel and Standard pool for a few days.
 *
 * Check's browser specs read data/ (ARKPEDIA_CONTENT_DISABLED=1) at the real clock. Until
 * 2026-10-29 that was a copy kept in this repository, which no release refreshed: on
 * 2026-10-06 its last Global Kernel closed at 11:00Z with nothing after it, and every open PR
 * failed far from the cause. data/ is now the live release's records (scripts/content/
 * pull-data.mjs), so an approaching expiry checks the latest client as well: a client that has not
 * shipped its next pool yet must not block unrelated editorial releases.
 */

const MARGIN_DAYS = 3;
const KINDS = ['kernel', 'standard_pool'] as const;

interface BannerRecord { name: string; category?: string; globalPoolId?: string; global_window?: { endAt?: string } | null }
interface ClientPool { gachaPoolId: string; gachaRuleType: string; openTime: number; endTime: number }
const endAt = (pool: ClientPool) => (pool.endTime + (pool.endTime % 60 === 59 ? 1 : 0)) * 1000;
function latestClientConfirmsCurrent(kind: string, banner: BannerRecord, pools: ClientPool[], now: number): boolean {
  const kinds = kind === 'kernel' ? ['CLASSIC_DOUBLE', 'FESCLASSIC'] : ['DOUBLE'];
  const matching = pools.filter(pool => kinds.includes(pool.gachaRuleType));
  const end = Date.parse(banner.global_window?.endAt ?? '');
  return matching.length > 0 && end > now && Math.max(...matching.map(endAt)) === end
    && matching.some(pool => pool.gachaPoolId === banner.globalPoolId && pool.openTime * 1000 <= now && endAt(pool) === end);
}

test('a near-ending banner requires exact current-client proof, never an expired or missing newer pool', () => {
  const now = Date.UTC(2026, 10, 14, 14), end = Date.UTC(2026, 10, 17, 11);
  const banner = { name: 'Kernel', globalPoolId: 'current', global_window: { endAt: new Date(end).toISOString() } };
  const pool = { gachaPoolId: 'current', gachaRuleType: 'CLASSIC_DOUBLE', openTime: (now - 86400000) / 1000, endTime: end / 1000 - 1 };
  assert.equal(latestClientConfirmsCurrent('kernel', banner, [pool], now), true);
  assert.equal(latestClientConfirmsCurrent('kernel', banner, [pool], end), false);
  assert.equal(latestClientConfirmsCurrent('kernel', { ...banner, globalPoolId: 'other' }, [pool], now), false);
  assert.equal(latestClientConfirmsCurrent('kernel', banner, [pool, { ...pool, gachaPoolId: 'next', openTime: end / 1000, endTime: end / 1000 + 14 * 86400 - 1 }], now), false);
  assert.equal(latestClientConfirmsCurrent('kernel', banner, [], now), false);
});

test(`the bundled banner list has current Global pools and checks ${MARGIN_DAYS} days ahead`, async () => {
  const now = Date.now(), due = now + MARGIN_DAYS * 86_400_000;
  let latest: Promise<{ gachaPoolClient: ClientPool[] }> | undefined;
  for (const kind of KINDS) {
    const ends = (banners as BannerRecord[])
      .filter((banner) => banner.category === kind && banner.global_window?.endAt)
      .map((banner) => ({ ...banner, end: Date.parse(banner.global_window!.endAt!) }))
      .sort((a, b) => b.end - a.end);
    const last = ends[0];
    assert.ok(last, `data/headhunting_banners.json has no Global ${kind} banner with a window`);
    if (last.end > now && last.end <= due) {
      // EN maintenance can ship the next pool inside this warning margin. Do
      // not block unrelated releases when our exact active pool is still the
      // newest one the client provides. A newer upstream pool, expiry, missing
      // identity or failed lookup still fails closed under the original guard.
      latest ??= fetch('https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/en/gamedata/excel/gacha_table.json', { signal: AbortSignal.timeout(10000), cache: 'no-store' })
        .then(async response => { assert.ok(response.ok, 'Cannot verify latest EN pool windows'); return response.json(); });
      const client = await latest;
      if (latestClientConfirmsCurrent(kind, last, client.gachaPoolClient, now)) {
        console.warn(`${last.name} ends within ${MARGIN_DAYS} days; verified its ID/window against the latest EN client, which has no later pool yet.`);
        continue;
      }
    }
    assert.ok(last.end > due,
      `data/headhunting_banners.json runs out: its last Global ${kind}, ${last.name}, closes ${new Date(last.end).toISOString()}. `
      + 'This is the live release\'s list (npm run data:pull), and Check\'s browser specs start failing once it runs out. '
      + 'Check the banner importers in the content release.');
  }
});
