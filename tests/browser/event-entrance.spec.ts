import { expect, test, type Page } from '@playwright/test';
import { stubYouTube } from './youtube-stub';

const eventPath = '/events/' + encodeURIComponent("[Rerun] The Masses' Travels Rerun");
const dialog = (page: Page) => page.getByRole('dialog', { name: "Opening The Masses' Travels" });
// A short, data-only native timeline keeps lifecycle tests independent of CDN availability.
// Real recovered shader/art packs are reviewed separately on the checked-source Preview.
const scene = { schemaVersion: 1, width: 1280, height: 720, duration: 4,
  clip: 'fixture', nodes: [], curves: [], textures: [], materials: [], shaders: [],
  sound: { file: 'entrance.wav', offset: .05, duration: .1 } };
async function media(page: Page, fail: boolean | 'slow' = false) {
  const requests: string[] = [];
  const wav = Buffer.alloc(44 + 9600);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(96000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(9600, 40);
  await page.route('**/event-transitions/players/**', async route => {
    const file = new URL(route.request().url()).pathname.split('/').at(-1)!;
    requests.push(file);
    if (file === 'menu.webp') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1cAAAAASUVORK5CYII=', 'base64') });
    if (fail === 'slow') await new Promise(resolve => setTimeout(resolve, 2500));
    if (fail) return route.fulfill({ status: 404, body: 'unavailable' });
    if (file === 'scene.json') return route.fulfill({ json: scene });
    return route.fulfill({ contentType: 'audio/wav', body: wav });
  });
  return requests;
}
async function open(page: Page) {
  await page.goto('/schedule');
  const link = page.locator(`a[href="${eventPath}"]`).first();
  await expect(link).toBeVisible();
  return link;
}
async function unlocked(page: Page) {
  await expect(dialog(page)).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).not.toBe('hidden');
}
for (const theme of ['dark', 'light']) {
  test(`native entrance uses the viewport, docks and leaves Back usable (${theme})`, async ({ page }) => {
    const requests = await media(page);
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    const link = await open(page); await link.click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toHaveAttribute('data-phase', 'playing');
    const bounds = await dialog(page).boundingBox();
    const viewport = page.viewportSize()!;
    expect(Math.abs(bounds!.width - viewport.width)).toBeLessThan(2);
    expect(Math.abs(bounds!.height - viewport.height)).toBeLessThan(2);
    await expect(dialog(page)).toHaveAttribute('data-phase', 'docking');
    await unlocked(page);
    await expect(page.locator('[data-event-entrance-art="act42sre"] img')).toHaveAttribute('src', /menu.webp/);
    expect(requests).not.toContain('entrance.wav'); // Audio is opt-in.
    await page.goBack(); await expect(page).toHaveURL(/\/schedule$/); await unlocked(page);
    await page.goForward(); await expect(page).toHaveURL(/\/events\//); await unlocked(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
test('skip and Escape release the modal, focus and scroll lock', async ({ page }) => {
  await media(page);
  let link = await open(page); await link.focus(); await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeVisible(); await page.keyboard.press('Escape'); await unlocked(page);
  await expect(page.locator('#page-content')).toBeFocused();
  await expect(page).toHaveURL(/\/events\//); await page.goBack(); await expect(page).toHaveURL(/\/schedule$/); link = page.locator(`a[href="${eventPath}"]`).first(); await link.click();
  await expect(dialog(page)).toBeVisible(); await page.getByRole('button', { name: 'Skip intro', exact: true }).click();
  await unlocked(page); await expect(page.locator('#page-content')).toBeFocused();
});
test('reduced motion avoids the entrance and its downloads', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const requests = await media(page); const link = await open(page); await link.click();
  await expect(page).toHaveURL(/\/events\//); await unlocked(page);
  expect(requests).not.toContain('scene.json');
});
test('missing entrance assets leave a usable event page', async ({ page }) => {
  await media(page, true); const link = await open(page); await link.click();
  await expect(page).toHaveURL(/\/events\//); await unlocked(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText("Masses' Travels");
});
test('Back and a reduced-motion change cancel an active entrance', async ({ page }) => {
  await media(page); const link = await open(page); await link.click();
  await expect(dialog(page)).toHaveAttribute('data-phase', 'playing');
  await expect(page).toHaveURL(/\/events\//); await page.goBack(); await expect(page).toHaveURL(/\/schedule$/); await unlocked(page);
  await page.locator(`a[href="${eventPath}"]`).first().click();
  await expect(dialog(page)).toHaveAttribute('data-phase', 'playing');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await unlocked(page);
});
test('native SFX uses its cue and event music waits for the animation', async ({ page }) => {
  await stubYouTube(page, 'allow', { mediaConsent: true, dataSaver: true });
  await page.addInitScript(() => {
    localStorage.setItem('arkpedia:settings', JSON.stringify({ version: 1, values: { eventMusic: true } }));
    const starts: number[] = []; Object.assign(window, { __entranceStarts: starts });
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(when = 0, ...rest) {
      starts.push(when - this.context.currentTime); return original.call(this, when, ...rest);
    };
  });
  const requests = await media(page); const link = await open(page); await link.click();
  await expect(dialog(page)).toHaveAttribute('data-phase', 'playing');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __entranceStarts: number[] }).__entranceStarts.length)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { __entranceStarts: number[] }).__entranceStarts[0])).toBeCloseTo(.05, 2);
  expect(requests).toContain('entrance.wav');
  expect(await page.evaluate(() => (window as unknown as { __pageYt?: { state: number } }).__pageYt?.state)).not.toBe(1);
  await unlocked(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __pageYt?: { state: number } }).__pageYt?.state)).toBe(1);
});

test('a slow pack cannot leave a blocking black screen', async ({ page }) => {
  await media(page, 'slow'); const link = await open(page); await link.click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toBeHidden({ timeout: 2300 });
  await expect(page).toHaveURL(/\/events\//); await unlocked(page);
});
test('modified event links keep ordinary new-tab navigation', async ({ page }) => {
  await media(page); const link = await open(page);
  const popup = page.waitForEvent('popup'); await link.click({ modifiers: ['Control'] });
  const other = await popup; await other.close();
  await expect(page).toHaveURL(/\/schedule$/); await unlocked(page);
});
