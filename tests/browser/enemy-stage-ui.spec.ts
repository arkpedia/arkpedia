import { expect, test } from './request-diagnostics';

/* These run against the app's BUNDLED data/ (the web server sets
   ARKPEDIA_CONTENT_DISABLED=1), not the published release. The daily release updates
   arkpedia-data and never this repository, so content it added -- such as the event the
   first test searches for -- is not here until the bundle is brought in line:
     node scripts/content/sync-bundled-data.mjs <arkpedia-data checkout> data/enemies \
       data/enemy_appearances.json data/enemy-stage-appearances.json public/enemies-index.json \
       data/stages data/stage-geometry data/stage-conditional public/stages-index.json
   plus the stage catalogue files the refresh writes beside them (data/stages-content.json,
   content-windows, stage-devices, story-groups, excluded-contents, item-icons). --check
   lists what differs without writing. When the new records name art published after the
   bundled pin, move data/assets/external-asset-index.json, revisions.json and
   public-asset-index.json with them (the three go together), then
   `npm run check:published-assets`. */
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
