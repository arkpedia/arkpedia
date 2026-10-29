import { expect, test } from './request-diagnostics';

/* These run against data/ (the web server sets ARKPEDIA_CONTENT_DISABLED=1), which is the
   live release's records, pulled by scripts/content/pull-data.mjs. A test about content a
   release just added passes as soon as that release is live. */
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
  // The rail's filter is the site's one dropdown (components/ui/StyledSelect): a
  // combobox whose list is portalled to <body> and fixed, so the rail cannot clip it.
  await page.getByRole('combobox', { name: 'Chapter or event' }).click();
  const picker = page.getByRole('listbox', { name: 'Chapter or event' });
  await expect(picker).toBeVisible();
  const pop = (await picker.boundingBox())!;
  const map = (await page.locator('.stage-map-area').boundingBox())!;
  const x = Math.max(pop.x, map.x) + 12;
  const y = Math.max(pop.y, map.y) + 12;
  if (x < Math.min(pop.x + pop.width, map.x + map.width) && y < Math.min(pop.y + pop.height, map.y + map.height)) {
    expect(await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('[role="listbox"]')), { x, y })).toBe(true);
  }
  await page.getByRole('combobox', { name: 'Chapter or event' }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.locator('.stage-map-area svg image').first().getAttribute('href'))
    .toMatch(/arkpedia-image-assets\/[a-f0-9]{40}\/enemies-icons\//);
});
