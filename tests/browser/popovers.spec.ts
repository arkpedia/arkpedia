import { expect, test, Page, Locator } from '@playwright/test';

async function anchored(page: Page, trigger: Locator, menu: Locator) {
  const t = (await trigger.boundingBox())!;
  const m = (await menu.boundingBox())!;
  const v = page.viewportSize()!;
  expect(m.x).toBeGreaterThanOrEqual(0);
  expect(m.x + m.width).toBeLessThanOrEqual(v.width);
  const bounds = await trigger.evaluate(el => { const r = el.closest('main')!.getBoundingClientRect(); return { left: r.left, right: r.right }; });
  expect(m.x).toBeGreaterThanOrEqual(bounds.left);
  expect(m.x + m.width).toBeLessThanOrEqual(bounds.right);
  expect(m.y).toBeGreaterThanOrEqual(0);
  expect(m.y + m.height).toBeLessThanOrEqual(v.height + 1);
  expect(Math.min(Math.abs(m.y - t.y - t.height), Math.abs(t.y - m.y - m.height))).toBeLessThanOrEqual(8);
}

test('operator relation menus anchor to their trigger and close on navigation', async ({ page }) => {
  await page.goto('/operators/Botani#overview');
  const trigger = page.getByRole('button', { name: 'Ritualist: show related operators' });
  await trigger.click();
  const menu = page.getByRole('dialog');
  await expect(menu).toBeVisible();
  await anchored(page, trigger, menu);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  const voice = page.getByRole('button', { name: 'Yixuan Hu: show related operators' });
  await voice.click();
  await anchored(page, voice, menu);
  await page.mouse.click(2, 100);
  await expect(menu).toHaveCount(0);
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  const artist = page.getByRole('button', { name: 'Yukuso: show related operators' });
  await artist.click();
  await anchored(page, artist, menu);
  await page.screenshot({ path: test.info().outputPath('operator-popover.png') });
  await menu.getByRole('link').first().click();
  await expect(page).not.toHaveURL(/\/Botani/);
  await expect(menu).toHaveCount(0);
});

test('enemy status menus only open on click and show applicable sources', async ({ page }, testInfo) => {
  await page.goto('/enemies');
  const trigger = page.getByRole('button', { name: /Levitate Vulnerable/i });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.hover();
  const menu = page.getByRole('dialog', { name: 'Operators who apply Levitate' });
  await expect(menu).toHaveCount(0);
  await trigger.click();
  await expect(menu).toBeVisible();
  await anchored(page, trigger, menu);
  await expect(menu.getByText('Module ISW-α (Stage 3) · Integrated Strategies', { exact: true })).toBeVisible();
  await menu.locator('img').evaluateAll(async images => { await Promise.all(images.map(image => (image as HTMLImageElement).decode().catch(() => {}))); });
  await page.screenshot({ path: testInfo.outputPath('enemy-popover.png') });
  await trigger.click();
  await expect(menu).toHaveCount(0);
  const sleep = page.getByRole('button', { name: /Sleep Vulnerable/i });
  await sleep.click();
  await expect(page.getByRole('dialog').getByTitle('Deterring Radiance')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
