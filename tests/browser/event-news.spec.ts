import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import type { EventExtras } from '../../lib/events/tableRewards';

/*
 * The event page's News tab (build-event-rewards.mjs `news`): the rest of the official announcement.
 * The page's props come from the content release, which a release compiled before this tab carries
 * without news; the test gives the page the news the build makes of the real CPT post
 * (official-news/4814-news.json, which test-event-news.ts holds to the build's output) in its own
 * __NEXT_DATA__, so it checks the page and not the release.
 */
const CPT = '[Celebration] Critical Phase Transition';
const news = JSON.parse(fs.readFileSync('scripts/tests/fixtures/official-news/4814-news.json', 'utf8')) as EventExtras['news'];

for (const theme of ['dark', 'light'] as const) {
  test(`the CPT page has a News tab with the announcement's other changes (${theme})`, async ({ page }, info) => {
    await page.addInitScript((value) => { try { localStorage.setItem('theme', value); } catch { /* none */ } }, theme);
    // The page data given below is not what the server rendered, so a development server lays its
    // error overlay over the page, which takes the clicks; a production build has none.
    await page.addInitScript(() => {
      const hide = () => document.head?.append(Object.assign(document.createElement('style'), { textContent: 'nextjs-portal { display: none !important; }' }));
      if (document.head) hide(); else document.addEventListener('DOMContentLoaded', hide, { once: true });
    });
    await page.route(url => url.pathname === `/events/${encodeURIComponent(CPT)}` || decodeURIComponent(url.pathname) === `/events/${CPT}`, async route => {
      const html = await (await route.fetch()).text();
      const body = html.replace(/(<script id="__NEXT_DATA__" type="application\/json"[^>]*>)([\s\S]*?)(<\/script>)/, (_, open: string, json: string, close: string) => {
        const data = JSON.parse(json);
        data.props.pageProps.extras = { ...(data.props.pageProps.extras ?? { packs: [], furniture: [], notices: [] }), news };
        return open + JSON.stringify(data).replace(/</g, '\\u003c') + close;
      });
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
    });
    await page.goto(`/events/${encodeURIComponent(CPT)}#news`);
    const tab = page.getByRole('tab', { name: 'News', exact: true }).or(page.getByRole('button', { name: 'News', exact: true }));
    await expect(tab.first()).toBeVisible();
    await tab.first().click();
    const panel = page.locator('.event-news');
    await expect(panel.getByRole('heading', { name: 'SANITY LIMIT INCREASE', exact: true })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'KERNEL LOCATING OPEN', exact: true })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'RECRUIT OPERATORS UPDATE', exact: true })).toBeVisible();
    await expect(panel.getByText(/30-point increase to max Sanity/)).toBeVisible();
    const source = panel.getByRole('link', { name: 'Read it on arknights.global' });
    await expect(source).toHaveCount(1);
    await expect(source).toHaveAttribute('href', 'https://www.arknights.global/news/4814');
    // Nothing the other tabs show comes again.
    await expect(panel.getByRole('heading', { name: /HEADHUNTING OPEN|OUTFIT|FURNITURE|PACKS/ })).toHaveCount(0);
    // No sideways scroll at a phone's width.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: info.outputPath(`cpt-news-${theme}.png`), fullPage: false });
  });
}

test('an event whose announcement holds nothing new has no News tab', async ({ page }) => {
  // The same page with no news: a fixed answer, whatever a later content release gives an event.
  await page.route(url => decodeURIComponent(url.pathname) === `/events/${CPT}`, async route => {
    const html = await (await route.fetch()).text();
    const body = html.replace(/(<script id="__NEXT_DATA__" type="application\/json"[^>]*>)([\s\S]*?)(<\/script>)/, (_, open: string, json: string, close: string) => {
      const data = JSON.parse(json);
      data.props.pageProps.extras = { ...(data.props.pageProps.extras ?? { packs: [], furniture: [], notices: [] }), news: [] };
      return open + JSON.stringify(data).replace(/</g, '\\u003c') + close;
    });
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  });
  await page.goto(`/events/${encodeURIComponent(CPT)}`);
  await expect(page.getByRole('tab', { name: 'Rewards', exact: true }).or(page.getByRole('button', { name: 'Rewards', exact: true })).first()).toBeVisible();
  await expect(page.getByRole('tab', { name: 'News', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'News', exact: true })).toHaveCount(0);
});
