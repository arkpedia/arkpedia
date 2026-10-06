import { expect, test } from '@playwright/test';

/*
 * The story map's chapter pop-up (components/story/ChapterDialog.tsx): the chapter's cover whole,
 * at its own shape, centred on a line of its own, with the chapter's line under it (2026-10-06:
 * the maintainer chose the whole cover, centred, over a banner-shaped crop).
 */
test('a chapter pop-up shows its cover whole and centred, above the chapter line', async ({ page }) => {
  await page.goto('/story?chapter=main_3');
  const dialog = page.locator('.story-chapter-dialog');
  const art = dialog.locator('.story-chapter-art');
  await expect(art).toBeVisible();
  await expect.poll(() => art.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const [top, cover, head] = await Promise.all([dialog.locator('.story-chapter-top').boundingBox(), art.boundingBox(), dialog.locator('.story-chapter-head').boundingBox()]);
  expect(top && cover && head, 'all on screen').toBeTruthy();
  const left = cover!.x - top!.x, right = top!.x + top!.width - (cover!.x + cover!.width);
  expect(Math.abs(left - right), `the cover is centred (${left.toFixed(1)}px left, ${right.toFixed(1)}px right)`).toBeLessThanOrEqual(2);
  expect(head!.y, 'the chapter line is under the cover').toBeGreaterThanOrEqual(cover!.y + cover!.height - 1);
});
