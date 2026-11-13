import { expect, test } from '@playwright/test';

for (const theme of ['dark', 'light']) test(`outside collaborations are opt-in and independent of events in ${theme}`, async ({ page }) => {
  await page.goto('/schedule?view=calendar');
  await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
  for (const [label, value] of [['Year', '2026'], ['Month', 'November']]) {
    await page.getByRole('combobox', { name: label, exact: true }).click();
    await page.getByRole('option', { name: value, exact: true }).click();
  }
  const controls = page.getByRole('group', { name: 'Calendar controls', exact: true });
  const otherGames = controls.getByRole('button', { name: 'Other games', exact: true });
  const events = controls.getByRole('button', { name: 'Events', exact: true });
  const collabs = page.locator('.schedule-bar').filter({ hasText: 'Arcaea' });
  await expect(otherGames).toHaveAttribute('aria-pressed', 'false');
  await expect(collabs).toHaveCount(0);
  await expect(page.locator('.schedule-bar').first()).toBeVisible();
  await otherGames.focus();
  await page.keyboard.press('Space');
  await expect(otherGames).toHaveAttribute('aria-pressed', 'true');
  await expect(collabs.first()).toBeVisible();
  await events.click();
  await expect(collabs.first()).toBeVisible();
  await expect(page.locator('.schedule-bar').filter({ hasNotText: 'Arcaea' })).toHaveCount(0);
  await otherGames.click();
  await expect(page.locator('.schedule-bar')).toHaveCount(0);
  await events.click();
  await expect(page.locator('.schedule-bar').first()).toBeVisible();
  await expect(collabs).toHaveCount(0);
  await controls.getByRole('button', { name: 'Sync calendar / .ics', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Include collaborations in other games', exact: true })).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const theme of ['dark', 'light']) test(`calendar keeps its frame and page scroll across dense and sparse months in ${theme}`, async ({ page }) => {
  await page.goto('/schedule?view=calendar');
  await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
  const pick = async (label: string, value: string) => {
    await page.getByRole('combobox', { name: label, exact: true }).click();
    await page.getByRole('option', { name: value, exact: true }).click();
  };
  await pick('Year', '2027');
  await pick('Month', 'January');
  const frame = page.locator('.timeline-month-large');
  const height = await frame.evaluate(el => el.getBoundingClientRect().height);
  expect(await page.locator('.schedule-bar').count()).toBeGreaterThan(5);
  await page.evaluate(() => document.fonts.ready);
  // Activate the month step without Playwright scrolling the toolbar into view:
  // the regression is browser scroll clamping when the document shrinks underneath it.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const position = await page.evaluate(() => scrollY);
  expect(position).toBeGreaterThan(0);
  for (const month of ['February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']) {
    await page.getByRole('button', { name: 'Next month', exact: true }).dispatchEvent('click');
    await expect(page.getByRole('region', { name: `${month} 2027 calendar weeks` })).toBeVisible();
  }
  expect(await frame.evaluate(el => el.getBoundingClientRect().height)).toBe(height);
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(position, 0);
  await expect(page.locator('.schedule-bar')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('past events are newest first, shareable, and link to their event pages', async ({ page }) => {
  await page.goto('/schedule');
  await expect(page.getByRole('button', { name: 'Upcoming', exact: true, pressed: true })).toBeVisible();
  await expect(page.locator('.schedule-events-controls .hint')).toHaveText(/\d+ events · soonest first/);
  // The view is the address's (the header's Schedule menu links to both): the calendar has
  // no period switch, and the list keeps its own after a round trip.
  await page.goto('/schedule?view=calendar');
  await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Event period' })).toHaveCount(0);
  await page.goto('/schedule');
  await expect(page.getByRole('heading', { name: 'Events', level: 1 })).toBeVisible();
  const upcomingSwitch = page.getByRole('button', { name: 'Past', exact: true });
  await page.evaluate(() => document.fonts.ready);
  const period = page.getByRole('group', { name: 'Event period' });
  await expect(period).toBeVisible();
  await expect(period.getByRole('button')).toHaveCount(2);
  const switchPositions = await period.getByRole('button').evaluateAll(buttons => buttons.map(button => {
    const { x, y, width, height } = button.getBoundingClientRect();
    return { x, y, width, height };
  }));
  await upcomingSwitch.click();
  await expect(page).toHaveURL(/past=1/);
  await expect(page.getByRole('button', { name: 'Past', exact: true, pressed: true })).toBeVisible();
  await expect(page.locator('.schedule-events-controls .hint')).toHaveText(/\d+ events · newest first/);
  expect(await period.getByRole('button').evaluateAll(buttons => buttons.map(button => {
    const { x, y, width, height } = button.getBoundingClientRect();
    return { x, y, width, height };
  }))).toEqual(switchPositions);
  const rows = page.locator('#schedule-events .events-row');
  await expect(rows.first()).toBeVisible();
  const dates = await rows.locator('time').evaluateAll(nodes => nodes.map(node => Date.parse(node.getAttribute('datetime')!)));
  expect(dates.length).toBeGreaterThan(1);
  expect(dates).toEqual([...dates].sort((a, b) => b - a));
  await expect(rows.locator('.badge-live')).toHaveCount(0);
  const first = rows.first().locator('a.events-row-main');
  const href = await first.getAttribute('href');
  const name = await rows.first().locator('.events-row-name').innerText();
  await first.click();
  await expect(page).toHaveURL(new URL(href!, page.url()).href);
  await expect(page.locator('h1')).toHaveText(name);
  await page.goto('/schedule?past=1');
  await expect(page.getByRole('button', { name: 'Past', exact: true, pressed: true })).toBeVisible();
  await expect(rows.first().locator('a.events-row-main')).toHaveAttribute('href', href!);
  await page.getByRole('button', { name: 'Upcoming', exact: true }).click();
  await expect(page).not.toHaveURL(/past=1/);
  await expect(page.getByRole('button', { name: 'Past', exact: true, pressed: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('page Back and browser Back restore a deep archive position and loaded batches', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/schedule?past=1');
  await expect(page.getByRole('button', { name: 'Past', exact: true, pressed: true })).toBeVisible();
  const grani = page.locator('.events-row-main').filter({ hasText: "Grani and the Knights' Treasure" }).filter({ hasNotText: 'Rerun' }).first();
  for (let batch = 0; batch < 10 && await grani.count() === 0; batch++) {
    const count = await page.locator('#schedule-events .events-row').count();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(() => page.locator('#schedule-events .events-row').count()).toBeGreaterThan(count);
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
