import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import type { EventExtras } from '../../lib/events/tableRewards';
// @ts-expect-error Node scripts are plain JavaScript.
import { withBoardArt } from '../../scripts/sync/regional-board.mjs';

/*
 * The site in JP mode shows JP's own material on an event page (scripts/sync/regional-board.mjs):
 * its in-game board's items in the News tab, in English, and its board's key art for the event and
 * its banner, in place of Global's. The page's data comes from the fixtures below, given to the page
 * in its own __NEXT_DATA__ (as event-news.spec.ts does), and the board's pictures from a stub, so
 * the test checks the page and not a content release or the live boards.
 */
const CPT = '[Celebration] Critical Phase Transition';
const SWT = '[Celebration] Sealed With Time';
const JP_HOST = 'https://ark-jp-static-online.yo-star.com';
const GLOBAL_HOST = 'https://ark-us-static-online.yo-star.com';
const JP_EVENT_ART = `${JP_HOST}/announce/images/20260923/0d4ade920ccb4638dd7a4db8debb365b.png`;
const JP_BANNER_ART = `${JP_HOST}/announce/images/20260923/962dcf6a97e61897ddbff7a68877b55c.png`;
// KR's, as the regional schedule's join gives them from the fixture's KR board and official site
// headline (scripts/tests/fixtures/regional-board.json): the site's key visual for the event, and
// the board's banner picture.
const fixture = JSON.parse(fs.readFileSync('scripts/tests/fixtures/regional-board.json', 'utf8'));
const krArt = withBoardArt(fixture.schedules.kr, fixture.boards.kr);
const KR_EVENT = krArt.events[CPT].art as { url: string; sha1: string };
const KR_BANNER = krArt.banners[SWT].art as { url: string; sha1: string };
const KR_EVENT_ART = 'https://webusstatic.yo-star.com/web-cms-test/upload/content/2026/10/12/n74WatYI.png';
const KR_BANNER_ART = 'https://ark-kr-static-online-1300509597.yo-star.com/announce/images/20261013/2503c5194d4999c585e78056d5223d60.jpg';
const board: EventExtras['board'] = [
  { server: 'en', name: null, title: 'Sealed With Time', source: `${GLOBAL_HOST}/announce/Android/announcement/1634.html`, shown: '2026-10-14',
    image: `${GLOBAL_HOST}/announce/images/20261009/8aebe82a214826a0ed47455f8b70a821.jpg` },
  { server: 'jp', name: SWT, title: 'スカウト 約諾', source: `${JP_HOST}/announce/Android/announcement/1431.html`, shown: '2026-10-14', image: JP_BANNER_ART },
  { server: 'jp', name: CPT, title: '10月14日 新章公開！', source: `${JP_HOST}/announce/Android/announcement/1427.html`, shown: '2026-10-09', image: JP_EVENT_ART },
];
// A 1x1 PNG for every picture on the boards' hosts.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

async function serve(page: Page, server: 'jp' | 'kr' | 'en', { withKrArt = false } = {}) {
  await page.addInitScript((value) => { try { localStorage.setItem('arkpedia-site-server', value); } catch { /* none */ } }, server);
  // The page data given below is not what the server rendered, so a development server lays its
  // error overlay over the page, which takes the clicks; a production build has none.
  await page.addInitScript(() => {
    const hide = () => document.head?.append(Object.assign(document.createElement('style'), { textContent: 'nextjs-portal { display: none !important; }' }));
    if (document.head) hide(); else document.addEventListener('DOMContentLoaded', hide, { once: true });
  });
  await page.route(/^https:\/\/(?:ark-(?:jp|us|kr)-static-online[^/]*|webusstatic)\.yo-star\.com\//, route => route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));
  await page.route(url => decodeURIComponent(url.pathname) === `/events/${CPT}`, async route => {
    const html = await (await route.fetch()).text();
    const body = html.replace(/(<script id="__NEXT_DATA__" type="application\/json"[^>]*>)([\s\S]*?)(<\/script>)/, (_, open: string, json: string, close: string) => {
      const data = JSON.parse(json);
      const props = data.props.pageProps;
      props.extras = { ...(props.extras ?? { packs: [], furniture: [], notices: [], news: [] }), board };
      const jp = props.__contentTables['regional-schedules'].servers.jp;
      jp.events[CPT] = { ...jp.events[CPT], art: { url: JP_EVENT_ART, sha1: '0'.repeat(40) } };
      jp.banners[SWT] = { ...jp.banners[SWT], art: { url: JP_BANNER_ART, sha1: '1'.repeat(40) } };
      if (withKrArt) {
        const kr = props.__contentTables['regional-schedules'].servers.kr;
        kr.events[CPT] = { ...kr.events[CPT], art: KR_EVENT };
        kr.banners[SWT] = { ...kr.banners[SWT], art: KR_BANNER };
      }
      return open + JSON.stringify(data).replace(/</g, '\\u003c') + close;
    });
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  });
}

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).or(page.getByRole('button', { name, exact: true })).first();

test("in JP mode an event's News, key art and banner art are JP's own", async ({ page }, info) => {
  await serve(page, 'jp');
  await page.goto(`/events/${encodeURIComponent(CPT)}`);
  await expect(page.locator('html')).toHaveAttribute('data-site-server', 'jp');
  // The event's key art: JP's board picture, in the poster's box.
  await expect(page.locator('.event-detail-image-wrap img')).toHaveAttribute('src', JP_EVENT_ART);
  // The banner's.
  await tab(page, 'Banner').click();
  await expect(page.locator('.event-detail-banner-art-wrap img')).toHaveAttribute('src', JP_BANNER_ART);
  // News: JP's board, in English, and not Global's.
  await tab(page, 'News').click();
  const jp = page.locator('.event-news-server[data-server="jp"]');
  await expect(jp).toBeVisible();
  await expect(jp.getByText('On the JP in-game notice board.')).toBeVisible();
  await expect(jp.getByRole('heading', { name: SWT, exact: true })).toBeVisible();
  await expect(jp.getByRole('heading', { name: CPT, exact: true })).toBeVisible();
  await expect(jp.getByRole('link', { name: 'Official JP notice' }).first()).toHaveAttribute('href', `${JP_HOST}/announce/Android/announcement/1431.html`);
  await expect(page.locator('.event-news-server[data-server="en"]')).toBeHidden();
  await expect(page.locator('.event-news-server[data-server="kr"]')).toBeHidden();
  await expect(page.locator('.event-news')).not.toContainText('スカウト');
  // No sideways scroll at a phone's width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: info.outputPath('cpt-news-jp.png'), fullPage: false });

  // Back to Global from the nav's store: Global's art and board again, in place.
  await page.evaluate(() => { localStorage.setItem('arkpedia-site-server', 'en'); window.dispatchEvent(new Event('arkpediaSiteServerChanged')); });
  await expect(page.locator('html')).not.toHaveAttribute('data-site-server', /./);
  await expect(page.locator('.event-news-server[data-server="en"]')).toBeVisible();
  await expect(jp).toBeHidden();
  await expect(page.locator('.event-news-server[data-server="en"]').getByRole('heading', { name: 'Sealed With Time', exact: true })).toBeVisible();
  await tab(page, 'Banner').click();
  await expect(page.locator('.event-detail-banner-art-wrap img')).not.toHaveAttribute('src', JP_BANNER_ART);
});

test('in KR mode with nothing on the KR board, the News tab says so and keeps Global\'s', async ({ page }) => {
  await serve(page, 'en');
  await page.addInitScript(() => { try { localStorage.setItem('arkpedia-site-server', 'kr'); } catch { /* none */ } });
  await page.goto(`/events/${encodeURIComponent(CPT)}#news`);
  await tab(page, 'News').click();
  await expect(page.locator('.event-news-server[data-server="kr"]')).toContainText('The KR in-game notice board has shown nothing for this event yet.');
  await expect(page.locator('.event-news-server[data-server="en"]')).toBeVisible();
  await expect(page.locator('.event-news-server[data-server="jp"]')).toBeHidden();
  // KR has no art of its own here: Global's stays.
  await expect(page.locator('.event-detail-image-wrap img')).not.toHaveAttribute('src', JP_EVENT_ART);
});

test("in KR mode an event's key art is KR's official site headline, and its banner's KR's board picture", async ({ page }, info) => {
  expect(KR_EVENT.url).toBe(KR_EVENT_ART);
  expect(KR_BANNER.url).toBe(KR_BANNER_ART);
  await serve(page, 'kr', { withKrArt: true });
  await page.goto(`/events/${encodeURIComponent(CPT)}`);
  await expect(page.locator('html')).toHaveAttribute('data-site-server', 'kr');
  await expect(page.locator('.event-detail-image-wrap img')).toHaveAttribute('src', KR_EVENT_ART);
  await expect(page.locator('.event-detail-image-wrap img')).toBeVisible();
  await tab(page, 'Banner').click();
  await expect(page.locator('.event-detail-banner-art-wrap img')).toHaveAttribute('src', KR_BANNER_ART);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: info.outputPath('cpt-kr-art.png'), fullPage: false });

  // JP mode on the same page: JP's art, not KR's.
  await page.evaluate(() => { localStorage.setItem('arkpedia-site-server', 'jp'); window.dispatchEvent(new Event('arkpediaSiteServerChanged')); });
  await expect(page.locator('html')).toHaveAttribute('data-site-server', 'jp');
  await expect(page.locator('.event-detail-banner-art-wrap img')).toHaveAttribute('src', JP_BANNER_ART);
});
