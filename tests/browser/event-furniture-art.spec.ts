import { test, expect } from '@playwright/test';

test('rerun furniture shows official shop artwork without losing the checklist or tab state', async ({ page }) => {
  const route = `/events/${encodeURIComponent("[Rerun] The Masses' Travels Rerun")}#rewards/furniture`;
  await page.goto(route);
  const art = page.getByRole('img', { name: "Paganini's Firearms Workshop in-game shop artwork", exact: true });
  await art.scrollIntoViewIfNeeded();
  await expect(art).toBeVisible();
  await expect.poll(() => art.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(art).toHaveAttribute('src', /content-art\/furni_set_gunworkshop-en.webp/);
  await expect(page.getByText('Storage Rack', { exact: true })).toBeVisible();
  const box = await art.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(226);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('tab', { name: 'Missions', exact: true }).click();
  await expect(art).toHaveCount(0);
  await page.getByRole('tab', { name: 'Furniture', exact: true }).click();
  await expect(art).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Furniture', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(art).toBeVisible();
});
