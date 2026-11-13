import { test, expect } from '@playwright/test';

for (const theme of ['dark', 'light']) test(`L2D volume controls real soundtrack (${theme})`, async ({ page }, info) => {
  test.setTimeout(180000);
  await page.addInitScript(theme => {
    localStorage.setItem('theme', theme);
    const sounds: HTMLMediaElement[] = [];
    Object.defineProperty(window, '__l2dSounds', { value: sounds });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { sounds.push(this); return play.call(this); };
  }, theme);
  await page.goto("/operators/Kal%27tsit");
  await page.getByRole('group', { name: 'Operator outfits', exact: true }).getByRole('button', { name: 'Remnant', exact: true }).click();
  await page.getByRole('button', { name: /Enlarge Kal.*Remnant/ }).click();
  const viewer = page.locator('.skin-zoom-overlay');
  await viewer.getByRole('button', { name: 'Animated', exact: true }).click();
  const volume = viewer.getByRole('slider', { name: 'Animation volume' });
  await expect(volume).toBeVisible({ timeout: 120000 });
  await expect(volume).toHaveValue('20');
  await volume.focus(); await volume.press('ArrowRight');
  await expect(page.locator('.volume-feedback')).toHaveText('21%');
  await expect(volume).toHaveAttribute('aria-valuetext', '21%');
  await page.screenshot({ path: info.outputPath('l2d-volume.png'), scale: 'css' });
  const intro = viewer.getByRole('button', { name: 'Intro', exact: true });
  if (await intro.count()) await intro.click();
  else await viewer.locator('.skin-zoom-canvas-surface').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __l2dSounds: HTMLMediaElement[] }).__l2dSounds.some(sound => sound.volume === .21 && sound.currentTime > .05 && !sound.error)), { timeout: 30000 }).toBe(true);
  await volume.focus(); await volume.press('Home');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __l2dSounds: HTMLMediaElement[] }).__l2dSounds.every(sound => sound.volume === 0))).toBe(true);
  await viewer.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(viewer).toHaveCount(0);
});
