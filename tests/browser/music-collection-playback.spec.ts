import { expect, test, type Page } from '@playwright/test';
import { stubYouTube, youtube } from './youtube-stub';

const album = '/music/discover?facet=album%3A5193';
const halo = '21P6C7lAb-Y', pilgrimage = 'cmA18BG0gks', detour = 'uBRNsCPG-yU';
const bar = (page: Page) => page.getByRole('region', { name: 'Player', exact: true });
async function heard(page: Page, id: string) {
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(id);
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
}

for (const theme of ['light', 'dark']) test('collection playback, queue and credits · ' + theme, async ({ page }, info) => {
  await stubYouTube(page);
  await page.addInitScript(theme => {
    localStorage.setItem('theme', theme);
    localStorage.setItem('arkpediaMusicAutoplay', 'false');
  }, theme);
  await page.goto(album);
  const songs = page.locator('.music-discover-song-list');
  await songs.locator('[data-song-id="' + halo + '"] .music-song-row-main').click();
  await heard(page, halo);
  const extra = songs.locator('[data-song-id="' + detour + '"]');
  const action = extra.getByRole('button', { name: /^Play next:/ });
  if (await action.isVisible()) await action.click();
  else {
    await extra.getByRole('button', { name: /^More actions/ }).click();
    await page.getByRole('dialog', { name: 'Song actions' }).getByRole('button', { name: 'Play next', exact: true }).click();
  }
  await bar(page).getByRole('link', { name: 'Queue', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Playback queue' });
  await expect(drawer.getByRole('heading', { name: /^Next from The Masses/ })).toBeVisible();
  await expect(drawer.locator('.music-queue-row').nth(1)).toHaveAttribute('data-song-id', detour);
  await expect(drawer.locator('.music-queue-row').nth(2)).toHaveAttribute('data-song-id', pilgrimage);
  await expect(drawer.getByRole('button', { name: /^History/ })).toHaveCount(0);
  expect(await page.locator('html').getAttribute('data-theme') ?? 'dark').toBe(theme);
  if (info.project.name === 'mobile') {
    const queueToggle = await bar(page).getByRole('link', { name: 'Close queue', exact: true }).boundingBox();
    const previous = await bar(page).getByRole('button', { name: 'Previous track' }).boundingBox();
    expect(queueToggle!.x + queueToggle!.width).toBeLessThanOrEqual(previous!.x);
    const text = await bar(page).locator('.music-transport-song-title').boundingBox();
    expect(text!.width).toBeGreaterThan(50);
  }
  await page.screenshot({ path: test.info().outputPath('album-queue-' + info.project.name + '-' + theme + '.png') });
  await bar(page).getByRole('button', { name: 'Next track' }).click();
  await heard(page, detour);
  await page.evaluate(() => (window as unknown as { __yt: { finish(): void } }).__yt.finish());
  await heard(page, pilgrimage);
  await bar(page).getByRole('button', { name: 'Previous track' }).click();
  await heard(page, detour);
  await bar(page).getByRole('button', { name: 'Next track' }).click();
  await heard(page, pilgrimage);
  await page.reload();
  await expect(drawer.getByRole('heading', { name: /^Next from The Masses/ })).toBeVisible();
  await drawer.getByRole('button', { name: /^History/ }).click();
  await expect(drawer.getByRole('region', { name: 'History' }).locator('[data-song-id]')).toHaveCount(2);
  await drawer.getByRole('link', { name: 'Close queue' }).click();
  await expect(drawer).toHaveCount(0);
  await bar(page).getByRole('link', { name: /Open Now playing/ }).click();
  await page.locator('.music-detail-reference').getByRole('link', { name: /Masses/ }).first().click();
  await page.getByRole('button', { name: 'Erik Castro', exact: true }).click();
  await expect(songs.locator('[data-song-id="' + halo + '"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Erik Castro', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Robert Wolf', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'All songs by Erik Castro' }).click();
  await expect(page).toHaveURL(/facet=artist%3AErik/);
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Erik Castro', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: /Back to Now playing/i }).click();
  await expect(page).toHaveURL(/view=player$/);
  await expect(bar(page)).toContainText('The Pilgrimage');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a saved playlist row starts at that position in its saved order', async ({ page }) => {
  await stubYouTube(page);
  await page.addInitScript(({ halo, pilgrimage, detour }) => {
    localStorage.setItem('arkpedia.music-playlists.v1', JSON.stringify([{ id: 'night', name: 'Night run', tracks: [detour, pilgrimage, halo] }]));
    localStorage.setItem('arkpediaMusicAutoplay', 'false');
  }, { halo, pilgrimage, detour });
  await page.goto('/music?view=library&playlist=night');
  await page.locator('.music-library-row[data-song-id="' + pilgrimage + '"] .music-song-row-main').click();
  await heard(page, pilgrimage);
  await bar(page).getByRole('link', { name: 'Queue', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Playback queue' });
  await expect(drawer.getByRole('heading', { name: 'Next from Night run' })).toBeVisible();
  await expect(drawer.locator('.music-queue-row').last()).toHaveAttribute('data-song-id', halo);
  await bar(page).getByRole('button', { name: 'Next track' }).click();
  await heard(page, halo);
  await expect(drawer.getByText('Nothing plays after this song.')).toBeVisible();
});


test('Now playing shows lyrics and the phone transport jumps to them', async ({ page }, info) => {
  await stubYouTube(page);
  await page.goto('/music/discover?facet=album%3A1030');
  await page.locator('.music-discover-song-row[data-song-id="d3jylNWjb3k"] .music-song-row-main').click();
  await heard(page, 'd3jylNWjb3k');
  const shortcut = bar(page).getByRole('link', { name: 'Lyrics', exact: true });
  if (info.project.name === 'mobile') {
    await shortcut.click();
    await expect(page.getByRole('region', { name: 'Lyrics' })).toBeFocused();
  } else {
    await expect(shortcut).toHaveCount(0);
    await bar(page).getByRole('link', { name: /Open Now playing/ }).click();
  }
  const lyrics = page.getByRole('region', { name: 'Lyrics' });
  await expect(lyrics).toBeVisible();
  const line = lyrics.getByRole('button', { name: /^Seek to/ }).nth(2);
  await line.click();
  await expect.poll(async () => (await youtube(page))?.calls.some(([op]) => op === 'seekTo')).toBe(true);
  await bar(page).getByRole('link', { name: /Open Now playing/ }).click();
  await expect(lyrics).toBeVisible();
  await expect(page.locator('.music-now-playing').getByRole('link', { name: /lyrics|open queue|youtube/i })).toHaveCount(0);
  await expect(page.locator('.music-wave-visualizer')).toBeVisible();
  const lyricsBox = (await lyrics.boundingBox())!;
  const waveBox = (await page.locator('.music-wave-visualizer').boundingBox())!;
  expect(Math.abs(waveBox.y - lyricsBox.y - lyricsBox.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(waveBox.x - lyricsBox.x)).toBeLessThanOrEqual(1);

  const switchToWaves = page.getByRole('button', { name: 'Switch to original waves' });
  await switchToWaves.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.music-original-waves')).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const waveSetting = page.getByRole('checkbox', { name: 'Use original visualizer waves' });
  await expect(waveSetting).toBeChecked();
  await waveSetting.uncheck();
  await page.keyboard.press('Escape');
  await expect(switchToWaves).toBeVisible();

  if (info.project.name === 'desktop') {
    const dislike = bar(page).getByRole('button', { name: 'Dislike: keep this song out of autoplay' });
    await dislike.click();
    await expect(dislike).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkpediaMusicNoAutoplay') || '[]'))).toContain('d3jylNWjb3k');
    await dislike.click();
    await expect(dislike).toHaveAttribute('aria-pressed', 'false');
  }
  const queueToggle = bar(page).locator('#music-transport-queue');
  await queueToggle.click();
  const popup = page.getByRole('dialog', { name: 'Playback queue' });
  await expect(popup).toBeVisible();
  await expect(queueToggle).toHaveAttribute('aria-expanded', 'true');
  const popupBox = (await popup.boundingBox())!;
  expect(popupBox.y + popupBox.height).toBeLessThanOrEqual((await bar(page).boundingBox())!.y + 1);
  expect((await lyrics.boundingBox())!.width).toBe(lyricsBox.width);
  if (info.project.name === 'desktop') {
    await page.locator('.music-section .section-title, .music-workspace-content h2').filter({ hasText: /^Now playing$/i }).first().click();
    await expect(popup).toHaveCount(0);
    await queueToggle.click();
  }
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
  await expect(queueToggle).toBeFocused();

  await page.goto(album);
  await page.locator('.music-discover-song-row[data-song-id="' + halo + '"] .music-song-row-main').click();
  await heard(page, halo);
  await bar(page).getByRole('link', { name: /Open Now playing/ }).click();
  await expect(lyrics).toHaveCount(0);
  await expect(shortcut).toHaveCount(0);
  await expect(page.locator('.music-now-playing').getByRole('heading', { name: 'Up next' })).toHaveCount(0);
});

test('shuffle, repeat and the queue preview agree', async ({ page }) => {
  await stubYouTube(page);
  await page.goto(album);
  await page.locator('.music-discover-song-row[data-song-id="' + halo + '"] .music-song-row-main').click();
  await heard(page, halo);
  await bar(page).getByRole('button', { name: 'Shuffle', exact: true }).click();
  await bar(page).getByRole('link', { name: /Open Now playing/ }).click();
  await bar(page).getByRole('link', { name: 'Queue', exact: true }).click();
  const predicted = await page.locator('.music-queue-row').nth(1).getAttribute('data-song-id');
  expect(predicted).toBeTruthy();
  await bar(page).getByRole('button', { name: 'Next track' }).click();
  await heard(page, predicted!);
  await page.getByRole('dialog', { name: 'Playback queue' }).getByRole('link', { name: 'Close queue' }).click();
  await bar(page).getByRole('button', { name: 'Repeat: off' }).click();
  const count = (await youtube(page))!.calls.filter(([op]) => op === 'loadVideoById').length;
  await page.evaluate(() => (window as unknown as { __yt: { finish(): void } }).__yt.finish());
  await expect.poll(async () => (await youtube(page))!.calls.filter(([op]) => op === 'loadVideoById').length).toBeGreaterThan(count);
  await heard(page, predicted!);
});
