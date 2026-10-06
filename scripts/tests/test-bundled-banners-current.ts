import { test } from 'node:test';
import assert from 'node:assert/strict';
import banners from '../../data/headhunting_banners.json';

/*
 * The bundled banner list must still have a running Kernel and Standard pool for a few days.
 *
 * Check's browser specs read the bundled data/ (ARKPEDIA_CONTENT_DISABLED=1) at the real
 * clock, and the daily release never refreshes it. On 2026-10-06 the snapshot's last Global
 * Kernel closed at 11:00Z with nothing after it: /gacha's first banner changed under the
 * layout census, the home page lost a kind of picture card, and every open PR failed with
 * errors that pointed nowhere near the cause. This fails first, three days ahead, and says
 * what to run.
 */

const MARGIN_DAYS = 3;
const KINDS = ['kernel', 'standard_pool'] as const;

interface BannerRecord { name: string; category?: string; global_window?: { endAt?: string } | null }

test(`the bundled banner list has a Global Kernel and Standard pool running for ${MARGIN_DAYS} more days`, () => {
  const due = Date.now() + MARGIN_DAYS * 86_400_000;
  for (const kind of KINDS) {
    const ends = (banners as BannerRecord[])
      .filter((banner) => banner.category === kind && banner.global_window?.endAt)
      .map((banner) => ({ name: banner.name, end: Date.parse(banner.global_window!.endAt!) }))
      .sort((a, b) => b.end - a.end);
    const last = ends[0];
    assert.ok(last, `data/headhunting_banners.json has no Global ${kind} banner with a window`);
    assert.ok(last.end > due,
      `data/headhunting_banners.json runs out: its last Global ${kind}, ${last.name}, closes ${new Date(last.end).toISOString()}. `
      + 'Check\'s browser specs read this snapshot at the real clock and start failing once it does. Refresh it: '
      + 'node scripts/content/sync-bundled-data.mjs <arkpedia-data checkout> --ref origin/main data/headhunting_banners.json');
  }
});
