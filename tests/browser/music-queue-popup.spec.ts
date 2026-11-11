import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { openMusicMenu } from './music-navigation-helpers';
import { stubYouTube, youtube } from './youtube-stub';

const popup = (page: Page) => page.getByRole('dialog', { name: 'Playback queue', exact: true });
const bar = (page: Page) => page.getByRole('region', { name: 'Player', exact: true });
async function navigate(page: Page, path: string) {
  await page.evaluate(path => (window as unknown as { next: { router: { push: (path: string) => Promise<void> } } }).next.router.push(path), path);
}

for (const theme of ['dark', 'light']) {
  test(`every Queue entry opens the popup in place (${theme})`, async ({ page }, info) => {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 390, height: 844 });
    await stubYouTube(page);
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.goto('/music/discover?q=paper');
    await page.locator('[data-song-id="2Qul6EjQmYc"] .music-song-row-main').first().click();
    await expect.poll(async () => (await youtube(page))?.state).toBe(1);
    const initial = (await youtube(page))!;
    const loads = initial.calls.filter(([name]) => /loadVideoById|cueVideoById/.test(name)).length;
    for (const path of ['/music?view=player', '/music?view=library&scope=favorites&q=Paper', '/music/discover?q=paper', '/world?section=twitch', '/account?panel=friends']) {
      await navigate(page, path);
      await expect(bar(page)).toBeVisible();
      const before = new URL(page.url());
      const position = await page.evaluate(() => scrollY);
      const toggle = bar(page).locator('#music-transport-queue');
      await toggle.click();
      await expect(popup(page)).toBeVisible();
      await expect(page.locator('#music-queue-popup')).toHaveCount(1);
      const opened = new URL(page.url());
      expect(opened.pathname).toBe(before.pathname);
      for (const [key, value] of before.searchParams) expect(opened.searchParams.get(key)).toBe(value);
      // Check the resting geometry after the intentional upward entrance.
      await popup(page).evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))); });
      const bounds = (await popup(page).boundingBox())!;
      expect(bounds.y + bounds.height).toBeLessThanOrEqual((await bar(page).boundingBox())!.y + 1);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      expect(await page.evaluate(() => scrollY)).toBe(position);
      await popup(page).getByRole('link', { name: 'Close queue', exact: true }).click();
      await expect(popup(page)).toHaveCount(0);
      await expect(toggle).toBeFocused();
      expect(new URL(page.url()).searchParams.toString()).toBe(before.searchParams.toString());
      expect((await youtube(page))?.videoId).toBe(initial.videoId);
    }
    // More omits Queue because the player already has a dedicated control.
    await bar(page).getByRole('button', { name: 'More player actions' }).click();
    const extras = page.getByRole('dialog', { name: 'Player actions', exact: true });
    await expect(extras.getByRole('link', { name: 'Open queue', exact: true })).toHaveCount(0);
    await extras.getByRole('button', { name: 'Close player actions', exact: true }).click();
    await bar(page).getByRole('link', { name: 'Queue', exact: true }).click();
    await expect(popup(page)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/account');
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);
    await navigate(page, '/music?view=player');
    await openMusicMenu(page);
    await page.getByRole('navigation', { name: 'Music', exact: true }).getByRole('link', { name: /^Queue/ }).click();
    await expect(popup(page)).toBeVisible();
    await fs.mkdir('.cache/music-queue-popup-qa', { recursive: true });
    await page.screenshot({ path: `.cache/music-queue-popup-qa/${info.project.name}-${theme}.png`, scale: 'css' });
    await page.goBack();
    await expect(popup(page)).toHaveCount(0);
    await page.goForward();
    await expect(popup(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Minimize player' })).toHaveCount(0);
    await navigate(page, '/world?section=twitch&musicQueue=1');
    await expect(popup(page)).toBeVisible();
    await page.getByRole('button', { name: 'Minimize player' }).click();
    await expect(popup(page)).toHaveCount(0);
    await expect(bar(page)).toHaveCount(0);
    expect((await youtube(page))?.state).toBe(1);
    expect((await youtube(page))?.players).toBe(1);
    expect((await youtube(page))!.calls.filter(([name]) => /loadVideoById|cueVideoById/.test(name))).toHaveLength(loads);
  });
}

test('legacy queue URLs open the popup instead of a queue page', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/music?view=queue');
  await expect(popup(page)).toBeVisible();
  await expect(page).toHaveURL(/view=player&panel=queue/);
  await expect(page.locator('.music-view')).toHaveAttribute('data-music-view', 'player');
  await popup(page).getByRole('link', { name: 'Close queue', exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect(page).toHaveURL(/view=player$/);
});

for (const theme of ['dark', 'light']) test(`queue stays above sticky Operators controls (${theme})`, async ({ page }) => {
  const desktop = page.viewportSize()!.width >= 1000;
  if (desktop) await page.setViewportSize({ width: 1440, height: 720 });
  await stubYouTube(page);
  await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
  await page.goto('/music/discover?q=paper');
  await page.locator('[data-song-id="2Qul6EjQmYc"] .music-song-row-main').first().click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  await navigate(page, '/operators');
  const sticky = page.locator('.sticky-controls[data-sticky="true"]').first();
  await expect(sticky).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 850, behavior: 'instant' }));
  await expect.poll(() => sticky.evaluate(el => {
    const nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'));
    return Math.abs(el.getBoundingClientRect().top - nav);
  })).toBeLessThanOrEqual(1);
  const position = await page.evaluate(() => scrollY);
  await bar(page).getByRole('link', { name: 'Queue', exact: true }).click();
  await popup(page).getByRole('button', { name: 'Autoplay from library', exact: true }).click();
  await expect(popup(page).locator('.music-autoplay-row').first()).toBeVisible();
  const layers = await popup(page).evaluate(queue => {
    const sticky = document.querySelector('.sticky-controls[data-sticky="true"]')!;
    const q = queue.getBoundingClientRect(), s = sticky.getBoundingClientRect();
    const left = Math.max(q.left, s.left), right = Math.min(q.right, s.right);
    const top = Math.max(q.top, s.top), bottom = Math.min(q.bottom, s.bottom);
    const overlaps = right > left && bottom > top;
    return {
      overlaps,
      queueOnTop: overlaps && queue.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2)),
      queueLayer: Number(getComputedStyle(queue).zIndex), stickyLayer: Number(getComputedStyle(sticky).zIndex),
    };
  });
  if (desktop) {
    expect(layers.overlaps, 'Reproduce a real overlap with the pinned roster controls').toBe(true);
    expect(layers.queueOnTop, 'The queue receives input where it overlaps the sticky header').toBe(true);
  }
  expect(layers.queueLayer).toBeGreaterThan(layers.stickyLayer);
  expect(await page.evaluate(() => scrollY)).toBe(position);
  await page.screenshot({ path: test.info().outputPath('queue-above-sticky-controls.png'), scale: 'css' });
  await popup(page).getByRole('link', { name: 'Close queue', exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect(bar(page).getByRole('link', { name: 'Queue', exact: true })).toBeFocused();
});
