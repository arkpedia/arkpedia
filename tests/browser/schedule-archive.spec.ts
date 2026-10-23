import { expect, test } from '@playwright/test';

test('past events are newest first, shareable, and link to their event pages', async ({ page }) => {
  await page.goto('/schedule');
  await expect(page.getByRole('heading', { name: 'Upcoming events', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Events', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('button', { name: /See (past|upcoming) events/ })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Events', exact: true }).click();
  const upcomingSwitch = page.getByRole('button', { name: 'See past events', exact: true });
  await page.evaluate(() => document.fonts.ready);
  const switchPosition = await upcomingSwitch.boundingBox();
  await upcomingSwitch.click();
  await expect(page).toHaveURL(/past=1/);
  await expect(page.getByRole('heading', { name: 'Past events', exact: true })).toBeVisible();
  const pastSwitch = page.getByRole('button', { name: 'See upcoming events', exact: true });
  expect(await pastSwitch.boundingBox()).toEqual(switchPosition);
  const rows = page.locator('#schedule-view-panel-events .events-row');
  await expect(rows.first()).toBeVisible();
  const dates = await rows.locator('time').evaluateAll(nodes => nodes.map(node => Date.parse(node.getAttribute('datetime')!)));
  expect(dates.length).toBeGreaterThan(1);
  expect(dates).toEqual([...dates].sort((a, b) => b - a));
  await expect(rows.locator('.badge-live')).toHaveCount(0);
  const first = rows.first().locator('a.events-row-main');
  const href = await first.getAttribute('href');
  const name = await rows.first().locator('.events-row-name').innerText();
  await first.click();
  await expect(page).toHaveURL(new URL(href!, 'http://127.0.0.1:3192').href);
  await expect(page.locator('h1')).toHaveText(name);
  await page.goto('/schedule?past=1');
  await expect(page.getByRole('heading', { name: 'Past events', exact: true })).toBeVisible();
  await expect(rows.first().locator('a.events-row-main')).toHaveAttribute('href', href!);
  await page.getByRole('button', { name: 'See upcoming events', exact: true }).click();
  await expect(page).not.toHaveURL(/past=1/);
  await expect(page.getByRole('heading', { name: 'Past events', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('page Back and browser Back restore a deep archive position and loaded batches', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/schedule?past=1');
  await expect(page.getByRole('heading', { name: 'Past events', exact: true })).toBeVisible();
  const grani = page.locator('.events-row-main').filter({ hasText: "Grani and the Knights' Treasure" }).filter({ hasNotText: 'Rerun' }).first();
  for (let batch = 0; batch < 10 && await grani.count() === 0; batch++) {
    const count = await page.locator('#schedule-view-panel-events .events-row').count();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(() => page.locator('#schedule-view-panel-events .events-row').count()).toBeGreaterThan(count);
  }
  await grani.scrollIntoViewIfNeeded();
  const position = await page.evaluate(() => scrollY);
  expect(position).toBeGreaterThan(1000);
  for (const back of ['page', 'browser']) {
    await grani.click();
    await expect(page.locator('h1')).toContainText('Grani');
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(100);
    if (back === 'page') await page.getByRole('link', { name: '‹ Back', exact: true }).click();
    else await page.goBack();
    await expect(page).toHaveURL(/schedule\?past=1/);
    await expect.poll(() => page.evaluate(() => scrollY), { timeout: 15000, message: `${back} Back restores the archive position` }).toBeCloseTo(position, -1);
    await expect(grani).toBeInViewport();
  }
});
