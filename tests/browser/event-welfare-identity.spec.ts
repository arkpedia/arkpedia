import { test, expect } from './request-diagnostics';

for (const theme of ['dark', 'light']) test(`collaboration welfare operators have one working portrait and preserve their mission (${theme})`, async ({ page }) => {
  await page.addInitScript(value => localStorage.setItem('theme', value), theme);
  await page.goto(`/events/${encodeURIComponent('[Side Story – Crossover] Somniloquium Serenum')}#banner`);
  const list = page.getByRole('list', { name: 'Operators the event gives' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  for (const [name, task] of [['Yūtenji Nyamu', 'Clear SS-4'], ['Yahata Umiri', 'Clear SS-5']]) {
    const operator = list.getByRole('button', { name: `${name}: operator preview`, exact: true });
    await operator.scrollIntoViewIfNeeded();
    await expect(operator).toContainText(task);
    await expect.poll(() => operator.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await operator.click();
    await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close operator preview', exact: true }).press('Escape');
    await expect(operator).toBeFocused();
  }
});
