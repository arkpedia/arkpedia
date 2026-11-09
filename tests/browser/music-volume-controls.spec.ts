import fs from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { stubYouTube, youtube } from './youtube-stub';
import { chooseMusicView, expandMusicPlayer } from './music-navigation-helpers';

async function adjustVolume(page: Page, slider: Locator, touch: boolean, capturePath: string) {
  const bounds = (await slider.boundingBox())!;
  const y = bounds.y + bounds.height / 2;
  const x = bounds.x + bounds.width * 0.75;
  const output = page.locator('.music-volume-percent');
  const before = await page.getByRole('region', { name: 'Player', exact: true }).boundingBox();
  const session = touch ? await page.context().newCDPSession(page) : null;
  try {
    if (session) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + bounds.width / 2, y, radiusX: 18, radiusY: 18 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, radiusX: 18, radiusY: 18 }] });
    } else {
      await page.mouse.move(bounds.x + bounds.width / 2, y);
      await page.mouse.down();
      await page.mouse.move(x, y, { steps: 4 });
    }
    await expect(output).toBeVisible();
    await expect.poll(() => slider.inputValue().then(Number)).toBeGreaterThan(60);
    const value = await slider.inputValue();
    await expect(output).toHaveText(`${value}%`);
    await expect(slider).toHaveAttribute('aria-valuetext', `${value}%`);
    expect(await page.evaluate(() => localStorage.getItem('musicVolume'))).toBe(value);
    await expect(slider.locator('..').locator('..').locator('.music-volume-icon')).toBeVisible();
    await expect(output.locator('svg')).toBeVisible();
    expect(await output.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(22);
    expect(await output.evaluate(el => getComputedStyle(el).backgroundColor)).toMatch(/0\.65/);
    await page.screenshot({ path: capturePath, scale: 'css' });
    const readout = (await output.boundingBox())!;
    expect(readout.y + readout.height, 'percentage stays above the finger').toBeLessThanOrEqual(y - 40);
    // A stable, reserved scrollbar gutter can differ from both innerWidth and
    // clientWidth. Measure the fixed-position viewport itself as the reference.
    const center = await page.evaluate(() => {
      const frame = document.createElement('div');
      frame.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none';
      document.body.appendChild(frame);
      const box = frame.getBoundingClientRect();
      frame.remove();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    });
    expect(Math.abs(readout.x + readout.width / 2 - center.x)).toBeLessThan(1);
    expect(Math.abs(readout.y + readout.height / 2 - center.y)).toBeLessThan(1);
    expect(readout.x).toBeGreaterThanOrEqual(0);
    expect(readout.x + readout.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    const after = await page.getByRole('region', { name: 'Player', exact: true }).boundingBox();
    expect(after).toEqual(before);
  } finally {
    if (session) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await session.detach();
    } else await page.mouse.up();
  }
}

async function checkActionRow(page: Page, player: Locator) {
  const like = player.getByRole('button', { name: 'Favourite', exact: true });
  const block = player.getByRole('button', { name: "Don't autoplay this song", exact: true });
  const safe = player.getByRole('button', { name: 'Stream-safe: hide copyrighted songs', exact: true });
  const slider = player.getByRole('slider', { name: 'Volume', exact: true });
  await page.mouse.move(0, 0);
  const shuffle = player.getByRole('button', { name: 'Shuffle', exact: true });
  const repeat = player.getByRole('button', { name: /^Repeat:/ });
  for (const button of [like, block, safe, shuffle, repeat]) {
    await button.evaluate(el => (el as HTMLElement).blur());
    await expect.poll(() => button.evaluate(el => getComputedStyle(el).borderTopColor)).toBe('rgba(0, 0, 0, 0)');
    await expect.poll(() => button.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  }
  const boxes = await Promise.all([like, block, slider, safe].map(el => el.boundingBox()));
  expect(boxes[3]!.x).toBeGreaterThanOrEqual(boxes[2]!.x + boxes[2]!.width);
  if (page.viewportSize()!.width < 1000) {
    await expect(player.locator('.music-transport-song-row .music-fav-btn')).toHaveCount(0);
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i]!.x).toBeGreaterThanOrEqual(boxes[i - 1]!.x + boxes[i - 1]!.width);
      expect(Math.abs(boxes[i]!.y + boxes[i]!.height / 2 - boxes[0]!.y - boxes[0]!.height / 2)).toBeLessThan(1);
    }
  }
  const collapse = page.getByRole('button', { name: 'Minimize player', exact: true });
  if (await collapse.count()) {
    await collapse.evaluate(el => (el as HTMLElement).blur());
    expect(await collapse.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px');
    expect(await collapse.evaluate(el => getComputedStyle(el).boxShadow)).toBe('none');
    const arrow = (await collapse.boundingBox())!;
    expect(arrow.x).toBeGreaterThanOrEqual(boxes[3]!.x + boxes[3]!.width);
    if (page.viewportSize()!.width < 1000) expect(Math.abs(arrow.y + arrow.height / 2 - boxes[0]!.y - boxes[0]!.height / 2)).toBeLessThan(3);
  }
}

for (const theme of ['dark', 'light']) {
  test(`miniplayer tools and both volume readouts work (${theme})`, async ({ page }, info) => {
    const mobile = info.project.name === 'mobile';
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await stubYouTube(page);
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.goto('/music/discover?q=paper');
    await page.locator('[data-song-id="2Qul6EjQmYc"] .music-song-row-main').first().click();
    await expect.poll(async () => (await youtube(page))?.state).toBe(1);
    await chooseMusicView(page, 'Now playing');
    const full = page.getByRole('region', { name: 'Player', exact: true });
    await full.getByRole('button', { name: 'Favourite', exact: true }).click();
    await full.getByRole('button', { name: 'Shuffle', exact: true }).click();
    await fs.mkdir('.cache/music-controls-qa', { recursive: true });
    await checkActionRow(page, full);
    await adjustVolume(page, full.getByRole('slider', { name: 'Volume', exact: true }), mobile, `.cache/music-controls-qa/${info.project.name}-${theme}-full-volume.png`);
    const fullVolume = await full.getByRole('slider', { name: 'Volume', exact: true }).inputValue();
    await page.goto('/pull-planner');
    const mini = await expandMusicPlayer(page);
    const block = mini.getByRole('button', { name: "Don't autoplay this song", exact: true });
    await expect(block).toBeEnabled();
    await block.click();
    await expect(block).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkpediaMusicNoAutoplay') || '[]'))).toContain('2Qul6EjQmYc');
    const safe = mini.getByRole('button', { name: 'Stream-safe: hide copyrighted songs' });
    await safe.click();
    await expect(safe).toHaveAttribute('aria-pressed', 'true');
    await checkActionRow(page, mini);
    const slider = mini.getByRole('slider', { name: 'Volume', exact: true });
    await expect(slider).toHaveValue(fullVolume);
    await adjustVolume(page, slider, mobile, `.cache/music-controls-qa/${info.project.name}-${theme}-external-volume.png`);
    // Keyboard changes expose the same percentage without moving the panel.
    await slider.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.music-volume-percent')).toBeVisible();
    await expect(page.locator('.music-volume-percent')).toHaveText('1%');
    await expect(page.locator('.music-volume-percent')).toHaveCount(0);
    if (mobile) {
      await page.setViewportSize({ width: 360, height: 800 });
      const card = (await mini.boundingBox())!;
      for (const control of [block, safe, slider]) {
        const box = (await control.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(card.x);
        expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width);
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await fs.mkdir('.cache/music-controls-qa', { recursive: true });
    await mini.screenshot({ path: `.cache/music-controls-qa/${info.project.name}-${theme}.png` });
    await mini.getByRole('link', { name: /Open Now playing/ }).click();
    await expect(full.getByRole('slider', { name: 'Volume', exact: true })).toHaveValue('1');
    if (!mobile) await expect(full.getByRole('button', { name: "Don't autoplay this song", exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: `.cache/music-controls-qa/${info.project.name}-${theme}-full.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('speaker mute restores the last audible volume across player views and reloads', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/music/discover?q=paper');
  await page.locator('[data-song-id="2Qul6EjQmYc"] .music-song-row-main').first().click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  const initial = (await youtube(page))!;
  const player = page.getByRole('region', { name: 'Player', exact: true });
  const volume = player.getByRole('slider', { name: 'Volume', exact: true });
  await volume.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 27; i++) await page.keyboard.press('ArrowRight');
  await expect(volume).toHaveValue('27');
  await player.getByRole('button', { name: 'Mute', exact: true }).click();
  await expect(volume).toHaveValue('0');
  await expect(player.getByRole('button', { name: 'Unmute', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => (window as unknown as { next: { router: { push: (path: string) => Promise<void> } } }).next.router.push('/operators'));
  await player.getByRole('button', { name: 'Unmute', exact: true }).click();
  await expect(volume).toHaveValue('27');
  expect((await youtube(page))?.videoId).toBe(initial.videoId);
  expect((await youtube(page))?.state).toBe(1);
  await player.getByRole('button', { name: 'Mute', exact: true }).click();
  await page.reload();
  await expandMusicPlayer(page);
  await expect(volume).toHaveValue('0');
  await player.getByRole('button', { name: 'Unmute', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(volume).toHaveValue('27');
  // Dragging/typing the slider down to zero also retains its last audible level.
  await volume.focus();
  await page.keyboard.press('Home');
  await player.getByRole('button', { name: 'Unmute', exact: true }).click();
  await expect(volume).toHaveValue('27');
});
