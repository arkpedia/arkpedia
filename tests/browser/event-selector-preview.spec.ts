import { test, expect } from './request-diagnostics';

test('selector operator preview closes back to the same ticket and pack', async ({ page }) => {
  const route = `/events/${encodeURIComponent('[Celebration] Critical Phase Transition')}#rewards/packs`;
  await page.goto(route);
  await page.getByRole('button', { name: /^Rhodes Island Headhunting Pack(?! -)/ }).click();
  await page.getByRole('button', { name: 'Top Operator Transfer Permit: selectable operators' }).click();
  const selector = page.locator('dialog.event-details-dialog');
  const operator = page.getByRole('button', { name: 'Mantra: operator preview', exact: true });
  await operator.scrollIntoViewIfNeeded();
  const scrollTop = await selector.evaluate(element => element.scrollTop);
  const eventUrl = page.url();
  await operator.click();
  const preview = page.getByRole('dialog', { name: 'Mantra', exact: true });
  await expect(preview).toBeVisible();
  await expect(page).toHaveURL(eventUrl);
  await expect(preview.getByRole('region', { name: 'Mantra operator details' })).toContainText('HP');
  await page.getByRole('button', { name: 'Close operator preview', exact: true }).press('Escape');
  await expect(preview).toHaveCount(0);
  await expect(operator).toBeFocused();
  expect(await selector.evaluate(element => element.scrollTop)).toBe(scrollTop);
  await page.getByRole('button', { name: '← Pack contents' }).click();
  await expect(page.getByRole('heading', { name: 'Rhodes Island Headhunting Pack', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close Rhodes Island Headhunting Pack', exact: true }).click();
  await expect(selector).not.toBeVisible();
});

test('the explicit operator-page link releases the selector scroll lock', async ({ page }) => {
  await page.goto(`/events/${encodeURIComponent('[Celebration] Critical Phase Transition')}#rewards/packs`);
  await page.getByRole('button', { name: /^Rhodes Island Headhunting Pack(?! -)/ }).click();
  await page.getByRole('button', { name: 'Top Operator Transfer Permit: selectable operators' }).click();
  await page.getByRole('button', { name: 'Mantra: operator preview', exact: true }).click();
  await page.getByRole('link', { name: 'View operator page ↗', exact: true }).click();
  await expect(page).toHaveURL(/\/operators\/Mantra$/);
  await expect.poll(() => page.locator('body').evaluate(element => element.style.overflow)).not.toBe('hidden');
});
