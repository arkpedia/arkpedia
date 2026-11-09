import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';

const stream = {
  userLogin: 'arkpedia_test', displayName: 'Arkpedia test streamer', title: 'Arknights live fixture',
  gameName: 'Arknights', viewerCount: 12, thumbnailUrl: '/essential-icons/M3.webp',
  startedAt: '2026-10-26T10:00:00Z', url: 'https://www.twitch.tv/arkpedia_test',
};

for (const theme of ['dark', 'light']) {
  for (const route of ['/', '/world/twitch', '/world?section=twitch']) {
    test(`Twitch refresh removes ended/category-switched streams on ${route} (${theme})`, async ({ page }) => {
      await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.clock.install();
      let live = true;
      let calls = 0;
      let fail = false;
      await page.route('**/api/twitch-streams', async route => {
        calls++;
        if (fail) return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
        await route.fulfill({ json: { streams: live ? [stream] : [], available: true, checkedAt: Date.now() } });
      });
      await page.goto(route);
      const link = page.locator(`a[href="${stream.url}"]`);
      await expect(link).toHaveCount(1);
      if (route === '/') await page.locator('.front-community-dot').first().click();
      await expect.poll(() => link.locator('img').evaluate(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)).toBe(true);
      await fs.mkdir('.cache/twitch-freshness-qa', { recursive: true });
      await (route === '/' ? page.locator('.front-community-panel') : page.locator(route.includes('?') ? '.world-gallery' : '.video-grid')).screenshot({ path: `.cache/twitch-freshness-qa/${route === '/' ? 'home' : route.includes('?') ? 'world' : 'directory'}-${theme}-${test.info().project.name}.png` });
      // A streamer who goes offline or switches games is absent from the next category snapshot.
      live = false;
      await page.clock.fastForward(30001);
      await expect(link).toHaveCount(0);
      expect(calls).toBeGreaterThanOrEqual(2);
      live = true;
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(link).toHaveCount(1);
      fail = true;
      await page.clock.fastForward(30001);
      await expect(link).toHaveCount(0);
      // A later successful refresh recovers without reloading the page.
      fail = false;
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(link).toHaveCount(1);
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await expect(link).toHaveCount(0);
      live = false;
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await expect.poll(() => calls).toBeGreaterThanOrEqual(6);
      await expect(link).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    });
  }
}

test('More Twitch streams checks the live feed on client navigation without reloading', async ({ page }) => {
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  await page.route('**/api/twitch-streams', async route => {
    if (++calls > 1) await ready;
    await route.fulfill({ json: { streams: [stream], available: true } });
  });
  await page.goto('/');
  await page.locator('.front-community-dot').first().click();
  await page.evaluate(() => Reflect.set(window, 'twitchNavigationDocument', true));
  await page.getByRole('link', { name: 'More Twitch streams' }).click();
  await expect(page).toHaveURL(/\/world\?section=twitch/);
  await expect(page.getByRole('status').filter({ hasText: 'Checking live streams' })).toBeVisible();
  await expect(page.getByText('No one’s live on Twitch right now.')).toHaveCount(0);
  release();
  await expect(page.locator(`.world-gallery a[href="${stream.url}"]`)).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, 'twitchNavigationDocument'))).toBe(true);
  await page.goBack();
  await expect(page.getByRole('link', { name: 'More Twitch streams' })).toBeVisible();
  await page.goForward();
  await expect(page.locator(`.world-gallery a[href="${stream.url}"]`)).toBeVisible();
});
