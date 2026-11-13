import { expect, test } from '@playwright/test';

test('chibi playback, language and quiet volume apply to normal and roaming trust taps', async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    const heard: HTMLMediaElement[] = [];
    Object.defineProperty(window, '__chibiHeard', { value: heard });
    HTMLMediaElement.prototype.play = function () { heard.push(this); return Promise.resolve(); };
  });
  const heard = () => page.evaluate(() => (window as unknown as { __chibiHeard: HTMLMediaElement[] }).__chibiHeard.map(sound => ({ src: sound.src, volume: sound.volume })));
  await page.goto('/operators/Thorns');
  await page.getByRole('button', { name: 'Chibi viewer', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'Chibi viewer — Thorns — Base', exact: true });
  const canvas = viewer.locator('canvas');
  await expect(canvas).toHaveAttribute('data-framed', 'true');
  const volume = viewer.getByRole('slider', { name: 'Chibi volume' });
  await expect(volume).toHaveValue('20');
  await expect(viewer.locator('.chibi-controls > button')).toHaveCount(1);
  await viewer.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(viewer.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await viewer.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(viewer.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

  await canvas.click();
  await expect.poll(async () => (await heard()).some(sound => /cn_034/i.test(sound.src))).toBe(true);
  expect((await heard()).some(sound => /cn_036|chibi-trust/i.test(sound.src))).toBe(false);
  expect((await heard()).some(sound => /audio\/chibi-tap.mp3/.test(sound.src))).toBe(true);
  expect((await heard()).every(sound => sound.volume === .2)).toBe(true);

  await viewer.getByRole('combobox', { name: 'Tap voice language' }).click();
  await page.getByRole('option', { name: 'Japanese', exact: true }).click();
  await canvas.click();
  await expect.poll(async () => (await heard()).some(sound => /voice-japanese/.test(sound.src) && /cn_034/i.test(sound.src))).toBe(true);
  await volume.focus(); await volume.press('ArrowRight');
  await expect(volume).toHaveValue('21');
  await expect(page.locator('.volume-feedback')).toHaveText('21%');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('arkpedia.chibiVolume'))).toBe('0.21');
  await viewer.getByRole('button', { name: 'Walk on page', exact: true }).click();
  const pet = page.locator('.chibi-roaming').first();
  await expect(pet.locator('canvas')).toHaveAttribute('data-framed', 'true');
  await pet.focus(); await pet.press('Enter');
  await expect.poll(async () => (await heard()).some(sound => /voice-japanese/.test(sound.src) && /cn_036/i.test(sound.src) && sound.volume === .21)).toBe(true);
  expect((await heard()).some(sound => /audio\/chibi-trust.mp3/.test(sound.src) && sound.volume === .21)).toBe(true);
  await volume.focus(); await volume.press('Home');
  await expect(volume).toHaveValue('0');
  await canvas.click();
  const latest = (await heard()).slice(-2);
  expect(latest.every(sound => sound.volume === 0)).toBe(true);
});
