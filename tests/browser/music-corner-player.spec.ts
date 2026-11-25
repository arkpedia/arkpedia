import { expect, test } from '@playwright/test';
import { stubYouTube } from './youtube-stub';
import { expandMusicPlayer, waitForMusicOverlays } from './music-navigation-helpers';

for (const theme of ['dark', 'light']) {
  test(`the music button opens the shared player and minimizing restores it (${theme})`, async ({ page }, info) => {
    await stubYouTube(page);
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.goto('/pull-planner');
    const player = page.getByRole('region', { name: 'Player', exact: true });
    const opener = page.getByRole('button', { name: 'Expand player', exact: true });
    await expect(player).toHaveCount(0);
    await expect(opener).toBeVisible();
    await waitForMusicOverlays(page);
    const floatingPosition = await opener.boundingBox();
    await opener.click();
    const minimize = page.getByRole('button', { name: 'Minimize player', exact: true });
    await expect(minimize).toBeFocused();
    await waitForMusicOverlays(page);
    expect(await minimize.boundingBox()).toEqual(floatingPosition);
    const box = (await player.boundingBox())!;
    const outside = await player.evaluate(bar => {
      const bounds = bar.getBoundingClientRect();
      return [...bar.querySelectorAll('button, input, a')].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.left < bounds.left - .5 || r.right > bounds.right + .5);
      }).map(el => el.getAttribute('aria-label'));
    });
    expect(outside).toEqual([]);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    const volume = player.getByRole('slider', { name: 'Volume', exact: true });
    await expect(volume).toBeVisible();
    expect((await volume.boundingBox())!.width).toBeGreaterThanOrEqual(56);
    await expect(player.getByRole('button', { name: "Don't autoplay this song", exact: true })).toBeVisible();
    await expect(player.getByRole('button', { name: 'Stream-safe: hide copyrighted songs' })).toBeVisible();
    // Ordinary page interaction leaves the transport available until manually minimized.
    await page.getByRole('heading', { name: 'Pull Planner', exact: true }).click();
    await expect(player).toBeVisible();
    await minimize.click();
    await expect(opener).toBeFocused();
    await expect(player).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(minimize).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
    await opener.click();
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/${info.project.name}-${theme}-shared-player.png` });
    await player.getByRole('link', { name: 'Queue', exact: true }).click();
    await expect(page).toHaveURL(/\/pull-planner\?musicQueue=1/);
    await expect(page.getByRole('dialog', { name: 'Playback queue', exact: true })).toBeVisible();
  });

  test(`the expanded player stays above the Account tabs as they scroll past (${theme})`, async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'the taller phone player overlaps the tabs on a short screen');
    await page.setViewportSize({ width: 390, height: 500 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await stubYouTube(page);
    await page.route('**/api/cloud-account', route => route.fulfill({ status: 401, json: { providers: ['google'] } }));
    await page.addInitScript(theme => {
      localStorage.setItem('theme', theme);
      localStorage.setItem('arkpediaAccount', JSON.stringify({
        version: 1, server: 'en', importedAt: '2026-10-01T12:00:00.000Z', doctor: null,
        operators: ['Amiya', 'Surtr', 'Eyjafjalla', 'Nian', 'Exusiai', 'Saria', 'Ifrit', 'Bagpipe', 'SilverAsh'],
        skins: [], cleared: [],
      }));
    }, theme);
    await page.goto('/account?panel=operators');
    await expect(page.getByRole('tab', { name: 'Operators', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('searchbox', { name: 'Search your operators' })).toBeVisible();
    await expect(page.getByText('Keep your settings and plans across devices.', { exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const player = await expandMusicPlayer(page);
    const tabs = page.locator('.sticky-controls').filter({ has: page.getByRole('tablist', { name: 'Account content' }) });
    await expect(tabs).toHaveAttribute('data-sticky', 'true');
    const overlap = await player.evaluate(bar => {
      const tabBar = document.querySelector('.sticky-controls')!;
      const playerBounds = bar.getBoundingClientRect();
      const tabBounds = tabBar.getBoundingClientRect();
      const top = Math.max(playerBounds.top, tabBounds.top);
      const bottom = Math.min(playerBounds.bottom, tabBounds.bottom);
      const overlaps = bottom > top;
      return {
        overlaps,
        playerOnTop: overlaps && bar.contains(document.elementFromPoint(innerWidth / 2, (top + bottom) / 2)),
      };
    });
    await page.screenshot({ path: info.outputPath('account-player-overlap.png'), scale: 'css' });
    expect(overlap).toEqual({ overlaps: true, playerOnTop: true });

    await page.evaluate(() => scrollTo({ top: 500, behavior: 'instant' }));
    await expect.poll(() => tabs.evaluate(el =>
      Math.abs(el.getBoundingClientRect().top - parseFloat(getComputedStyle(el).top))
    )).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Minimize player', exact: true }).click();
    await expect(player).toHaveCount(0);
  });
}
