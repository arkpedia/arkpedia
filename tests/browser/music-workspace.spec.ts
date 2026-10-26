import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { stubYouTube, youtube } from './youtube-stub';

for (const theme of ['dark', 'light']) {
  test(`music workspace keeps favourites, lyrics and playback connected (${theme})`, async ({ page }, info) => {
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    await stubYouTube(page);
    await page.goto('/music?view=library');
    const nav = page.getByRole('navigation', { name: 'Music', exact: true });
    const bar = page.getByRole('region', { name: 'Player', exact: true });
    const first = page.locator('.music-library-row').first();
    await expect(first).toBeVisible();
    await first.locator('.music-song-row-main').click();
    await expect.poll(async () => (await youtube(page))?.state).toBe(1);
    const playing = (await youtube(page))!;
    await bar.getByRole('button', { name: 'Favourite', exact: true }).click();
    await nav.getByRole('link', { name: 'Favourites', exact: true }).click();
    await expect(page).toHaveURL(/scope=favorites/);
    await expect(page.locator('.music-library-row')).toHaveCount(1);
    await expect(nav.getByRole('link', { name: 'Favourites', exact: true })).toHaveAttribute('aria-current', 'page');
    await nav.getByRole('link', { name: 'Library', exact: true }).click();
    await page.goBack();
    await expect(page).toHaveURL(/scope=favorites/);
    await expect(page.locator('.music-library-row')).toHaveCount(1);
    await bar.getByRole('link', { name: 'Lyrics', exact: true }).click();
    await expect(page).toHaveURL(/view=player&lyrics=1/);
    await expect(page.locator('#music-lyrics')).toBeVisible();
    expect((await youtube(page))!).toMatchObject({ players: 1, state: 1, videoId: playing.videoId });
    expect((await youtube(page))!.calls.filter(([name]) => name === 'loadVideoById')).toHaveLength(playing.calls.filter(([name]) => name === 'loadVideoById').length);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Playlists', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Music playlists', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: 'New playlist name' }).fill('Workspace playlist');
    await dialog.getByRole('button', { name: 'Save queue', exact: true }).click();
    await expect(dialog.getByRole('combobox', { name: 'Saved playlist' })).toContainText('Workspace playlist');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Workspace playlist', exact: true })).toBeAttached();
    if (info.project.name === 'desktop') {
      await page.setViewportSize({ width: 1280, height: 480 });
      await page.getByRole('button', { name: 'Workspace playlist', exact: true }).click();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('combobox', { name: 'Saved playlist' })).toContainText('Workspace playlist');
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    if (process.env.ARKPEDIA_QA_CAPTURE) {
      await fs.mkdir(process.env.ARKPEDIA_QA_CAPTURE, { recursive: true });
      await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/music-now-playing-${info.project.name}-${theme}.png` });
      await nav.getByRole('link', { name: 'Discover', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Recently added', exact: true })).toBeVisible();
      await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/music-discover-${info.project.name}-${theme}.png` });
    }
  });
}

for (const theme of ['dark', 'light']) {
  test(`autoplay queue uses an artwork card and grouped controls (${theme})`, async ({ page }, info) => {
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    await stubYouTube(page);
    await page.goto('/music?view=queue');
    const bar = page.getByRole('region', { name: 'Player', exact: true });
    await expect(page.getByRole('heading', { name: 'Your queue is empty', exact: true })).toBeVisible();
    await bar.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(async () => (await youtube(page))?.state).toBe(1);
    await expect(page.locator('.music-queue-now')).toBeVisible();
    await expect(page.locator('.music-queue-now-art')).toBeVisible();
    const automatic = page.getByRole('region', { name: 'Autoplay from library', exact: true });
    await automatic.getByRole('button', { name: 'About autoplay', exact: true }).click();
    await expect(page.getByRole('region', { name: 'About autoplay', exact: true })).toContainText('Plays after your queue ends.');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await fs.mkdir('.cache/music-workspace-qa', { recursive: true });
    await page.screenshot({ path: `.cache/music-workspace-qa/queue-${info.project.name}-${theme}.png` });
  });
}
