import bannersData from '@/data/headhunting_banners.json';
import { publishedArt } from '@/lib/art/publishedArt';
import { waitsForGlobal } from './bannerSchedule';
import { sortBannersByDate, type HeadhuntingBanner } from './headhuntingBanners';

/*
 * The banner list as this checkout's data/ holds it. SERVER AND SCRIPTS ONLY.
 *
 * getStaticProps runs this against the content release's own data (the export), and
 * the page reads the result from its props. A page's browser half must never import
 * it: the list would be compiled into that page's chunk, and publishedArt brings the
 * 453 KB asset index along with it.
 * scripts/tests/test-client-game-tables.ts fails if one does.
 */

// banner_image is resolved here, at the single point every consumer reads
// banners from: null while the image repository has not published the art (a
// banner can go out before it) -- see lib/art/publishedArt.ts. Safe at this
// layer: every banner_image consumer feeds it to <Image>, none resolves it on disk.
//
// A Joint Operation or an Orienteering Global has not dated is left out here, for every page
// at once (waitsForGlobal): its lineup, dates and art are CN's, and Global offers other
// operators. The record stays in the data, and appears once Global dates it -- with Global's
// lineup, as every Global-dated one so far has had (checked against Global's announcements).
const ALL_BANNERS = (bannersData as HeadhuntingBanner[]).filter((b) => !waitsForGlobal(b)).map((b) => ({
  ...b,
  banner_image: publishedArt(b.banner_image),
}));

export function getAllHeadhuntingBanners(): HeadhuntingBanner[] {
  return ALL_BANNERS;
}

/** Banners sorted newest-first by Global date start, for the Gacha
 * page's banner picker. */
export function getBannersSortedByDate(): HeadhuntingBanner[] {
  return sortBannersByDate(ALL_BANNERS);
}
