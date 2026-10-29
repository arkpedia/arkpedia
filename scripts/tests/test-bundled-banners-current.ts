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
 * pull-data.mjs), so this fails only if the live data itself runs out, three days ahead.
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
      + 'This is the live release\'s list (npm run data:pull), and Check\'s browser specs start failing once it runs out. '
      + 'Check the banner importers in the content release.');
  }
});
