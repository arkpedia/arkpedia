import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({ version: 1, analytics: false, externalMedia: false, externalMediaChosen: true, savedAt: Date.now() })));
});

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

test('chapters outside the story canvas show their reader covers in the list and popup', async ({ page }) => {
  await page.goto('/story?view=list&category=main');
  for (const chapter of [16, 17]) {
    const card = page.locator('.story-list-card').filter({ hasText: `Chapter ${chapter}:` });
    const cover = new RegExp(`^https://assets\\.arkpedia\\.net/arkpedia/arkpedia-image-assets/[a-f0-9]{40}/story-map/timo-main_${chapter}-[a-f0-9]+\\.webp$`);
    await expect(card.locator('img')).toHaveAttribute('src', cover);
    await card.click();
    const dialog = page.locator('.story-chapter-dialog');
    const image = dialog.locator('.story-chapter-art');
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute('src', cover);
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    expect(await image.evaluate(img => getComputedStyle(img).objectFit)).toBe('contain');
    await expect(dialog.getByRole('link', { name: /Continue reading/ })).toHaveAttribute('href', new RegExp(`#main&main_${chapter}&\\d+$`));
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  }
});
