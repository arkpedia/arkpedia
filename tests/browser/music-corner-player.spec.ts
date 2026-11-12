import { expect, test } from '@playwright/test';
import { stubYouTube } from './youtube-stub';
import { waitForMusicOverlays } from './music-navigation-helpers';

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
}
