import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { STORY_PROGRESS_KEY } from '../../lib/story/storyProgress';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({ version: 1, analytics: false, externalMedia: false, savedAt: Date.now() }));
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true });
  });
});

test('opening and toggling parts persists progress; complete stages and stories grey out', async ({ page }) => {
  await page.goto('/story?chapter=main_0');
  const dialog = page.locator('.story-chapter-dialog');
  const collapse = dialog.locator('.story-chapter-row').filter({ has: page.getByText('Collapse', { exact: true }) });
  const before = collapse.getByRole('button', { name: 'Mark 0-1 Collapse, before the operation as read', exact: true });
  await expect(before).toHaveAttribute('aria-pressed', 'false');
  const popup = page.waitForEvent('popup');
  await collapse.getByRole('link', { name: /before the operation/ }).click();
  await (await popup).close();
  await expect(collapse.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(collapse).not.toHaveClass(/is-read/);
  await collapse.getByRole('button', { name: /after the operation as read/ }).click();
  await expect(collapse).toHaveClass(/is-read/);
  await page.reload();
  await expect(collapse).toHaveClass(/is-read/);
  await expect(collapse.getByRole('button', { name: /as unread/ })).toHaveCount(2);
  await collapse.getByRole('button', { name: /before the operation as unread/ }).click();
  await expect(collapse).not.toHaveClass(/is-read/);
  // Bulk completion includes prologues and single-part stages, preserving other chapters.
  await page.evaluate(() => {
    const progress = JSON.parse(localStorage.getItem('arkpedia.story-progress.v1')!);
    localStorage.setItem('arkpedia.story-progress.v1', JSON.stringify({ ...progress, main_1: [2] }));
    window.dispatchEvent(new Event('arkpediaStoryProgressChanged'));
  });
  await dialog.getByRole('button', { name: 'Mark as read', exact: true }).click();
  await expect(dialog.locator('.story-read-check[aria-pressed="false"]')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkpedia.story-progress.v1')!).main_1)).toEqual([2]);
  await page.reload();
  await expect(dialog.locator('.story-read-check[aria-pressed="false"]')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  const picture = page.locator('.story-map-picture[href="/story?chapter=main_0"]');
  await expect(picture).toHaveClass(/is-read/);
  await expect(picture.locator('.story-map-read-mark')).toHaveCount(1);
  await page.goto('/story?chapter=main_0');
  await dialog.getByRole('button', { name: 'Mark as unread', exact: true }).click();
  await expect(dialog.locator('.story-read-check[aria-pressed="true"]')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(picture).not.toHaveClass(/is-read/);
});

test('story export/import restores only story progress, and rejects account files', async ({ page }) => {
  await page.goto('/story?chapter=main_0');
  await page.evaluate(() => {
    localStorage.setItem('arkpediaAccount', 'account-unchanged');
    localStorage.setItem('arkpedia.music-playlists.v1', '[]');
    localStorage.setItem('arkpedia.story-progress.v1', '{"main_0":[2,3]}');
    window.dispatchEvent(new Event('arkpediaStoryProgressChanged'));
  });
  await page.locator('.story-chapter-dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Import / export', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export story JSON', exact: true }).click();
  const saved = await download;
  const text = fs.readFileSync((await saved.path())!, 'utf8');
  expect(JSON.parse(text).progress).toEqual({ main_0: [2, 3] });
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => { localStorage.removeItem('arkpedia.story-progress.v1'); window.dispatchEvent(new Event('arkpediaStoryProgressChanged')); });
  await page.getByRole('button', { name: 'Import / export', exact: true }).click();
  await page.getByRole('dialog').locator('input[type=file]').setInputFiles({ name: 'story.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.getByRole('status')).toHaveText('Story progress imported.');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('arkpedia.story-progress.v1'))).toBe('{"main_0":[2,3]}');
  await page.getByRole('dialog').locator('input[type=file]').setInputFiles({ name: 'account.json', mimeType: 'application/json', buffer: Buffer.from('{"kind":"arkpedia-backup","version":1,"stores":{}}') });
  await expect(page.getByRole('status')).toContainText('Choose an Arkpedia story progress');
  expect(await page.evaluate(() => [localStorage.getItem('arkpediaAccount'), localStorage.getItem('arkpedia.music-playlists.v1')])).toEqual(['account-unchanged', '[]']);
});

test('manual progress changes stay synchronized across tabs', async ({ page, context }) => {
  await page.goto('/story?chapter=main_0');
  const other = await context.newPage();
  await other.goto('/story?chapter=main_0');
  const row = page.locator('.story-chapter-row').filter({ hasText: 'Collapse' });
  const otherRow = other.locator('.story-chapter-row').filter({ hasText: 'Collapse' });
  await row.getByRole('button', { name: /before the operation as read/ }).click();
  await expect(otherRow.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
  await otherRow.getByRole('button', { name: /after the operation as read/ }).click();
  await expect(row).toHaveClass(/is-read/);
  await row.getByRole('button', { name: /before the operation as unread/ }).click();
  await expect(otherRow.getByRole('button').first()).toHaveAttribute('aria-pressed', 'false');
  await expect(otherRow.getByRole('button').last()).toHaveAttribute('aria-pressed', 'true');
  await other.close();
});

test('Export everything downloads exactly three files and the ZIP restores them together', async ({ page }) => {
  await page.goto('/account');
  await page.evaluate(() => {
    localStorage.setItem('arkpedia.story-progress.v1', '{"main_0":[2,3]}');
    localStorage.setItem('arkpedia.music-playlists.v1', '[{"id":"songs","name":"Songs","tracks":["abcdefghijk"]}]');
    localStorage.setItem('musicFavorites', '["abcdefghijk"]');
  });
  await page.getByRole('button', { name: 'Import / export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import / export', exact: true });
  await dialog.getByRole('tab', { name: 'Backups', exact: true }).click();
  await expect(dialog.getByRole('tab', { name: 'Backups', exact: true })).toHaveAttribute('aria-selected', 'true');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export everything', exact: true }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toMatch(/\.zip$/);
  const buffer = fs.readFileSync((await saved.path())!);
  const files = unzipSync(buffer);
  expect(Object.keys(files).sort()).toEqual(['arkpedia-music-playlists.json', 'arkpedia-player-data.json', 'arkpedia-story-progress.json']);
  expect(JSON.parse(strFromU8(files['arkpedia-story-progress.json'])).progress).toEqual({ main_0: [2, 3] });
  expect(JSON.parse(strFromU8(files['arkpedia-music-playlists.json'])).favorites).toEqual(['abcdefghijk']);
  expect(JSON.parse(strFromU8(files['arkpedia-player-data.json'])).stores[STORY_PROGRESS_KEY]).toBeUndefined();
  await page.evaluate(() => { localStorage.removeItem('arkpedia.story-progress.v1'); localStorage.removeItem('arkpedia.music-playlists.v1'); });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import file', exact: true }).click();
  await (await chooser).setFiles({ name: 'arkpedia.zip', mimeType: 'application/zip', buffer });
  await expect(page.getByRole('status')).toContainText('story progress');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('arkpedia.story-progress.v1')!))).toEqual({ main_0: [2, 3] });
});
