import { expect, test } from '@playwright/test';

const routes = ['/operators', '/skins', '/artists', '/voice-actors', '/techniques', '/synergies', '/story?view=list', '/schedule?past=1', "/world?section=youtube", "/reward-tracker?view=free"];

for (const route of routes) test(`${route}: compact controls stay below navigation while browsing`, async ({ page }) => {
  await page.goto(route);
  if (route.startsWith('/story')) await expect(page.getByRole('combobox', { name: 'Story category' })).toBeVisible();
  if (route.startsWith('/schedule')) await expect(page.getByRole('button', { name: 'Past', pressed: true, exact: true })).toBeVisible();
  const bar = page.locator('.sticky-controls:visible').first();
  await expect(bar).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; window.scrollTo(0, 0); }, theme);
    const initial = await bar.boundingBox();
    await page.evaluate(top => window.scrollTo(0, top + 450), initial!.y);
    const metrics = await bar.evaluate(el => ({ top: el.getBoundingClientRect().top, height: el.getBoundingClientRect().height, viewport: innerHeight, nav: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 60, position: getComputedStyle(el).position, pinned: el.getAttribute('data-sticky') === 'true', overflow: document.documentElement.scrollWidth > innerWidth, y: scrollY }));
    expect(metrics.overflow, `${route} ${theme}: page width`).toBe(false);
    if (metrics.pinned) {
      await expect(bar).toHaveAttribute('data-sticky', 'true');
      expect(metrics.position).toBe('sticky');
      expect(metrics.height).toBeLessThanOrEqual(metrics.viewport / 4);
      if (metrics.y > initial!.y && route !== "/world?section=youtube") expect(metrics.top).toBeGreaterThanOrEqual(metrics.nav - 1);
    } else {
      await expect(bar).toHaveAttribute('data-sticky', 'false');
      expect(metrics.position).not.toBe('sticky');
    }
  }
});

test('large controls return to normal flow on a short viewport', async ({ page }) => {
  await page.goto('/artists');
  await page.setViewportSize({ width: 390, height: 400 });
  await expect(page.locator('.page-header-sticky-actions')).toHaveAttribute('data-sticky', 'false');
});

test('mobile filters remain usable after scrolling and narrowing the list', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'the compact Filters sheet is the mobile interaction');
  await page.goto('/artists');
  const bar = page.locator('.page-header-sticky-actions');
  await expect(bar).toHaveAttribute('data-sticky', 'true');
  await page.evaluate(() => window.scrollTo(0, 650));
  const position = await page.evaluate(() => scrollY);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(page.locator('dialog.filter-sheet')).toBeVisible();
  await page.getByRole('button', { name: '6-star', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  expect(Math.abs(await page.evaluate(() => scrollY) - position)).toBeLessThan(3);
  await expect(page.getByRole('button', { name: /Filters/ }).first()).toBeVisible();
});

test('Story category anchors clear the sticky search controls', async ({ page }) => {
  await page.goto('/story?view=list');
  const bar = page.locator('.story-library-tools');
  await expect(bar).toHaveAttribute('data-sticky', 'true');
  const category = page.locator('.story-list-section h3[id]').nth(1);
  await category.evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
  const heading = await category.boundingBox(), toolbar = await bar.boundingBox();
  expect(heading!.y).toBeGreaterThanOrEqual(toolbar!.y + toolbar!.height);
});

test('Community section and search survive leaving and browser Back', async ({ page }) => {
  await page.goto("/world?section=youtube&q=arknights");
  await expect(page.getByRole('tab', { name: 'YouTube', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('searchbox', { name: 'Search videos or creators' })).toHaveValue('arknights');
  await page.getByRole('link', { name: 'All videos', exact: true }).click();
  await expect(page).toHaveURL(/world\/videos/);
  await page.goBack();
  await expect(page.getByRole('tab', { name: 'YouTube', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('searchbox', { name: 'Search videos or creators' })).toHaveValue('arknights');
});

test('Reward type has a shareable view and retains it on reload', async ({ page }) => {
  await page.goto("/reward-tracker");
  await page.getByRole('tab', { name: 'Free rewards', exact: true }).click();
  await expect(page).toHaveURL(/view=free/);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Free rewards', exact: true })).toHaveAttribute('aria-selected', 'true');
});
