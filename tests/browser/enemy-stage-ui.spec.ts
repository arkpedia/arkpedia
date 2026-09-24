import { expect, test } from '@playwright/test';

test('enemy filters stay usable without covering the page title', async ({ page }) => {
  await page.goto('/enemies');
  const stat = page.locator('.enemy-stat').first();
  await expect(stat).toBeVisible();
  expect(await stat.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(4);

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect.poll(async () => Number((await page.locator('.enemy-filters-head .hint').innerText()).replace(/[^0-9]/g, ''))).toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Appears in', exact: true }).click();
  const search = page.getByRole('combobox', { name: 'Find event' });
  await search.fill('Here A People Sows');
  const option = page.getByRole('option', { name: /Here A People Sows/ });
  await expect(option).toBeVisible();
  await expect(page.locator('.enemy-appear-option-count')).toHaveCount(0);
  const list = (await page.locator('.enemy-appear-list').boundingBox())!;
  const header = (await page.locator('.enemy-frame-head').boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(list.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
  expect(list.x).toBeGreaterThanOrEqual(0);
  expect(list.x + list.width).toBeLessThanOrEqual(viewport.width + 1);
  await option.click();
  await expect(page.getByRole('button', { name: 'Clear', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Filter', exact: true })).toBeVisible();
});

test('stage picker overlays the map and moving enemies use pinned asset URLs', async ({ page }) => {
  await page.goto('/stages/browse?s=1-7');
  await page.getByRole('button', { name: 'Chapter or event' }).click();
  const picker = page.locator('.stage-picker-pop');
  await expect(picker).toBeVisible();
  await expect(page.locator('.stage-picker-count')).toHaveCount(0);
  const pop = (await picker.boundingBox())!;
  const map = (await page.locator('.stage-map-area').boundingBox())!;
  const x = Math.max(pop.x, map.x) + 12;
  const y = Math.max(pop.y, map.y) + 12;
  if (x < Math.min(pop.x + pop.width, map.x + map.width) && y < Math.min(pop.y + pop.height, map.y + map.height)) {
    expect(await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('.stage-picker-pop')), { x, y })).toBe(true);
  }
  await page.getByRole('button', { name: 'Chapter or event' }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.locator('.stage-map-area svg image').first().getAttribute('href'))
    .toMatch(/arkpedia-image-assets\/[a-f0-9]{40}\/enemies-icons\//);
});
