import { expect, test } from '@playwright/test';
import { stubYouTube, youtube } from './youtube-stub';

for (const theme of ['dark', 'light']) {
  test(`saved playlists export and import without interrupting music (${theme})`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    await stubYouTube(page);
    await page.goto('/music');
    await expect(page.locator('.music-queue-row').first()).toBeVisible();
    await page.locator('.music-queue-row').first().getByRole('button', { name: 'Play now', exact: true }).click();
    await expect.poll(async () => (await youtube(page))?.state).toBe(1);
    const before = (await youtube(page))!;
    await page.getByRole('button', { name: 'Favorite', exact: true }).click();
    await page.getByRole('button', { name: 'Playlists', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Music playlists' });
    await dialog.getByRole('textbox', { name: 'New playlist name' }).fill('Night music');
    await dialog.getByRole('button', { name: 'Save favorites', exact: true }).click();
    await expect(dialog.getByRole('combobox', { name: 'Saved playlist' })).toContainText('Night music');
    await expect(dialog.locator('li')).toHaveCount(1);
    const downloaded = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export playlist', exact: true }).click();
    const download = await downloaded;
    const fs = await import('node:fs/promises');
    const data = JSON.parse(await fs.readFile((await download.path())!, 'utf8'));
    expect(data.playlists[0]).toMatchObject({ name: 'Night music', tracks: [before.videoId] });
    await dialog.locator('input[type=file]').setInputFiles({ name: 'playlist.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
    await expect(dialog.getByRole('status')).toContainText('already saved');
    expect((await youtube(page))!).toMatchObject({ state: 1, videoId: before.videoId, players: 1 });
    await dialog.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
    await expect(dialog.getByRole('status')).toContainText('Choose an Arkpedia');
    // After deleting a local copy the same exported file imports back, rather than replacing other playlists.
    await dialog.getByRole('button', { name: 'Delete playlist' }).click();
    await dialog.locator('input[type=file]').setInputFiles({ name: 'playlist.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
    await expect(dialog.getByRole('status')).toContainText('Imported 1 playlist');
    await dialog.getByRole('button', { name: 'Play playlist', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Playing Night music');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Playlists', exact: true })).toBeFocused();
    await expect(page.locator('.music-queue-row')).toHaveCount(1);
    await page.reload();
    await page.getByRole('button', { name: 'Playlists', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Saved playlist' })).toContainText('Night music');
    expect(await page.locator('body').evaluate(el => el.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('an imported playlist plays in its saved order and stream-safe does not add unrelated songs after reload', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/music');
  await expect(page.locator('.music-queue-row').first()).toBeVisible();
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Music playlists' });
  await dialog.getByRole('textbox', { name: 'New playlist name' }).fill('Whole queue');
  await dialog.getByRole('button', { name: 'Save queue', exact: true }).click();
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export playlist', exact: true }).click();
  const fs = await import('node:fs/promises');
  const data = JSON.parse(await fs.readFile((await (await pending).path())!, 'utf8'));
  const ids = data.playlists[0].tracks.slice(0, 2).reverse();
  data.playlists = [{ id: 'ordered', name: 'Two tracks', tracks: ids }];
  await dialog.locator('input[type=file]').setInputFiles({ name: 'two.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await dialog.getByRole('combobox', { name: 'Saved playlist' }).click();
  await page.getByRole('option', { name: 'Two tracks', exact: true }).click();
  await dialog.getByRole('button', { name: 'Play playlist', exact: true }).click();
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(ids[0]);
  await page.keyboard.press('Escape');
  await expect(page.locator('.music-queue-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Next track', exact: true }).click();
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(ids[1]);
  await page.reload();
  await expect(page.locator('.music-queue-row')).toHaveCount(2);
  const safe = page.getByRole('button', { name: 'Stream-safe: hide copyrighted songs', exact: true });
  // The compact phone transport hides this optional control; exercise it where it is exposed.
  if (await safe.isVisible()) { await safe.click(); await safe.click(); }
  await expect(page.locator('.music-queue-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await page.getByRole('button', { name: 'Play all songs', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.locator('.music-queue-row').count()).toBeGreaterThan(2);
});
