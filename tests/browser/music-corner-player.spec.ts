import { expect, test } from '@playwright/test';
import { stubYouTube } from './youtube-stub';

/*
 * The corner player keeps every control inside its card. On a desktop its buttons and volume
 * slider shared one row that could not wrap, and the slider ran out of the card's right edge,
 * cut off (2026-10-14). Edges only, so it holds for any arrangement of the controls.
 */
test('the corner player keeps every control inside its card', async ({ page }) => {
  await stubYouTube(page);
  await page.goto("/pull-planner");
  const shell = page.locator('.music-player');
  await shell.getByRole('button', { name: 'Expand player' }).click();
  await expect(shell.locator('.music-play-btn')).toBeVisible();
  const out = await shell.evaluate((card) => {
    const box = card.getBoundingClientRect();
    return Array.from(card.querySelectorAll('button, input, a'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0)
      .filter(({ r }) => r.left < box.left - 0.5 || r.right > box.right + 0.5)
      .map(({ el, r }) => `${el.getAttribute('aria-label') ?? el.textContent?.trim()}: ${Math.round(r.left)}-${Math.round(r.right)} in ${Math.round(box.left)}-${Math.round(box.right)}`);
  });
  expect(out, 'controls outside the card').toEqual([]);
  // The volume is there on a desktop (it was dropped once, 2026-10-14), not on a touch screen.
  const volume = shell.getByRole('slider', { name: 'Volume', exact: true });
  if (await page.evaluate(() => matchMedia('(pointer: fine)').matches)) {
    await expect(volume).toBeVisible();
    expect((await volume.boundingBox())!.width, 'the volume has room to set').toBeGreaterThanOrEqual(56);
  } else {
    await expect(volume).toBeHidden();
  }
});
