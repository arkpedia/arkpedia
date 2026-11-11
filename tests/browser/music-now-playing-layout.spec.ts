import { expect, test, type Page } from '@playwright/test';
import { stubYouTube, youtube } from './youtube-stub';

const player = (page: Page) => page.getByRole('region', { name: 'Player', exact: true });
async function geometry(page: Page) {
  return page.locator('.music-now-playing').evaluate(root => {
    const rect = (selector: string) => {
      const r = root.querySelector(selector)!.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const info = rect('.music-now-playing-song-info');
    return { art: rect('.music-now-playing-cover'), info: { x: info.x, y: info.y }, lyrics: rect('.music-lyrics-space'), wave: rect('.music-wave-visualizer') };
  });
}

for (const theme of ['dark', 'light']) test(`lyrics and instrumental tracks share one Now Playing layout (${theme})`, async ({ page }, info) => {
  await stubYouTube(page);
  await page.addInitScript(theme => {
    localStorage.setItem('theme', theme);
    localStorage.setItem('arkpedia.music-playlists.v1', JSON.stringify([{ id: 'layout', name: 'Layout test', tracks: ['2Qul6EjQmYc', '21P6C7lAb-Y'] }]));
  }, theme);
  await page.goto('/music?view=library&playlist=layout');
  await page.locator('[data-song-id="2Qul6EjQmYc"] .music-song-row-main').first().click();
  await expect.poll(async () => (await youtube(page))?.videoId).toBe('2Qul6EjQmYc');
  await player(page).getByRole('link', { name: /Open Now playing/ }).click();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('region', { name: 'Lyrics', exact: true })).toBeVisible();
  const withLyrics = await geometry(page);
  await page.screenshot({ path: test.info().outputPath('with-lyrics.png'), scale: 'css' });
  await player(page).getByRole('button', { name: 'Next track', exact: true }).click();
  await expect.poll(async () => (await youtube(page))?.videoId).toBe('21P6C7lAb-Y');
  await expect(page.getByRole('region', { name: 'Lyrics', exact: true })).toHaveCount(0);
  const withoutLyrics = await geometry(page);
  for (const key of ['art', 'info', 'lyrics', 'wave'] as const) {
    for (const [field, value] of Object.entries(withLyrics[key])) {
      expect(Math.abs(withoutLyrics[key][field as keyof typeof withoutLyrics[typeof key]] - value), `${info.project.name}: ${key}.${field} stays anchored`).toBeLessThanOrEqual(1);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('without-lyrics.png'), scale: 'css' });
});

for (const theme of ['dark', 'light']) test(`phone lyrics expand above the visualizer and collapse to the default (${theme})`, async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 1000, 'The lyrics expansion belongs to the phone layout.');
  await stubYouTube(page);
  await page.addInitScript(theme => {
    localStorage.setItem('theme', theme);
    localStorage.setItem('arkpedia.music-playlists.v1', JSON.stringify([{ id: 'lyrics', name: 'Lyrics test', tracks: ['2Qul6EjQmYc', '21P6C7lAb-Y'] }]));
  }, theme);
  await page.route(/\/lyrics\/2Qul6EjQmYc\.json/, route => route.fulfill({ json: Array.from({ length: 50 }, (_, i) => ({ time: i * 4, text: `Lyric line ${i}` })) }));
  await page.goto('/music?view=library&playlist=lyrics');
  await page.locator('[data-song-id="2Qul6EjQmYc"] .music-song-row-main').first().click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  await player(page).getByRole('link', { name: /Open Now playing/ }).click();
  await page.evaluate(() => document.fonts.ready);
  const lyrics = page.getByRole('region', { name: 'Lyrics', exact: true });
  await expect(lyrics.getByRole('button').last()).toBeAttached();
  const button = player(page).getByRole('button', { name: 'Lyrics', exact: true });
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  const initial = await geometry(page);
  const initialScroll = await page.evaluate(() => window.scrollY);
  const checkExpanded = async () => {
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => {
      const wave = (await page.locator('.music-wave-visualizer').boundingBox())!;
      const bar = (await player(page).boundingBox())!;
      return Math.abs(wave.y + wave.height - bar.y);
    }).toBeLessThanOrEqual(2);
    const navHeight = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')));
    const bounds = (await lyrics.boundingBox())!;
    expect(Math.abs(bounds.y - navHeight)).toBeLessThanOrEqual(2);
    const details = (await page.locator('.music-now-playing-details').boundingBox())!;
    expect(details.y + details.height).toBeLessThanOrEqual(navHeight);
    const wave = (await page.locator('.music-wave-visualizer').boundingBox())!;
    expect(Math.abs(bounds.y + bounds.height - wave.y)).toBeLessThanOrEqual(2);
    expect(await button.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  };
  await button.click();
  await checkExpanded();
  expect((await lyrics.boundingBox())!.height).toBeGreaterThan(initial.lyrics.height + 100);
  await page.screenshot({ path: test.info().outputPath('expanded-lyrics.png'), scale: 'css' });
  // Reading ahead scrolls the lyrics only, leaving the visualizer and player anchored.
  const scroll = await page.evaluate(() => window.scrollY);
  await lyrics.focus();
  await page.keyboard.press('End');
  await expect.poll(() => lyrics.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
  expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
  await checkExpanded();
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(initialScroll);
  expect(await geometry(page)).toEqual(initial);
  await expect(button).toBeFocused();
  await page.screenshot({ path: test.info().outputPath('collapsed-lyrics.png'), scale: 'css' });
  // The shortcut from Library opens the same expanded view, including short screens.
  await page.goto('/music?view=library');
  await player(page).getByRole('link', { name: 'Lyrics', exact: true }).click();
  await checkExpanded();
  await page.setViewportSize({ width: 360, height: 640 });
  await checkExpanded();
  await player(page).getByRole('button', { name: 'Next track', exact: true }).click();
  await expect.poll(async () => (await youtube(page))?.videoId).toBe('21P6C7lAb-Y');
  await expect(button).toHaveCount(0);
  await expect(page.locator('main[data-lyrics-expanded]')).toHaveCount(0);
});
