import { expect, test } from '@playwright/test';

/*
 * Phone navigation that worked with a mouse and failed with a finger (2026-10-07).
 */

test('a suggestion picked by touch opens it, even when the browser sends no click (iPhone Safari)', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'touch');
  await page.goto('/operators/Amiya');
  await page.getByRole('combobox', { name: 'Search operators' }).fill('Skadi');
  const option = page.getByRole('option', { name: 'Skadi', exact: true });
  await expect(option).toBeVisible();
  const box = (await option.boundingBox())!;
  const at = { clientX: box.x + 12, clientY: box.y + 12, pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true };
  // The row holds the press back (preventDefault) so the field keeps focus; Safari then sends no
  // click for the tap, only pointerdown and pointerup. That alone must open the operator.
  await option.dispatchEvent('pointerdown', at);
  await option.dispatchEvent('pointerup', at);
  await expect(page).toHaveURL(/\/operators\/Skadi(\?|#|$)/);
});

test('scrolling the suggestion list with a finger picks nothing', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'touch');
  await page.goto('/operators/Amiya');
  await page.getByRole('combobox', { name: 'Search operators' }).fill('Skadi');
  const option = page.getByRole('option', { name: 'Skadi', exact: true });
  await expect(option).toBeVisible();
  const box = (await option.boundingBox())!;
  const touch = { pointerId: 8, pointerType: 'touch', isPrimary: true, bubbles: true };
  await option.dispatchEvent('pointerdown', { ...touch, clientX: box.x + 12, clientY: box.y + 12 });
  await option.dispatchEvent('pointerup', { ...touch, clientX: box.x + 12, clientY: box.y + 42 });
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/operators\/Amiya(\?|#|$)/);
});

test('the menu opens one section at a time, and the pressed heading stays under the finger', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'the phone drawer');
  // A short screen (a phone on its side), where the menu is longer than the drawer and scrolls.
  await page.setViewportSize({ width: 412, height: 480 });
  await page.goto('/operators');
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  const drawer = page.getByRole('dialog', { name: 'Site navigation' });
  const heads = drawer.locator('.mobile-nav-group-head');
  await expect(heads.first()).toBeVisible();
  const expanded = () => heads.evaluateAll((els) => els.map((el) => el.getAttribute('aria-expanded') === 'true'));
  // The section holding the page is the one open.
  expect((await expanded()).filter(Boolean)).toHaveLength(1);
  const before = await expanded();
  const target = before.findIndex((open, i) => !open && i > before.indexOf(true));
  test.skip(target < 0, 'no closed section below the open one');
  const head = heads.nth(target);
  // Scrolled to its end, so the drawer has scroll to give back when the open section folds away.
  await drawer.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(100);
  const scrollTopBefore = await drawer.evaluate((el) => el.scrollTop);
  const top = (await head.boundingBox())!.y;
  await head.click();
  await page.waitForTimeout(300);
  const after = await expanded();
  expect(after.filter(Boolean), 'one section open').toHaveLength(1);
  expect(after[target], 'the pressed section is the open one').toBe(true);
  // The heading stays under the finger unless the drawer ran out of scroll (back at its top).
  const moved = Math.abs((await head.boundingBox())!.y - top);
  const scrollTop = await drawer.evaluate((el) => el.scrollTop);
  expect(moved <= 2 || scrollTop === 0, `the pressed heading moved ${moved}px with scroll left (${scrollTop})`).toBe(true);
  expect(scrollTopBefore, 'the drawer scrolled, so the hold was tested').toBeGreaterThan(0);
});
