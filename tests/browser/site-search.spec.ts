import { expect, test } from '@playwright/test';

/*
 * The site search (components/layout/SiteSearch.tsx, pages/search.tsx): the nav's button
 * on every page, at both widths, and the /search?s= address a browser searches.
 */

test('the nav search finds a page by name and Enter opens the exact match', async ({ page }) => {
  await page.goto('/schedule');
  await page.getByRole('button', { name: 'Search Arkpedia' }).click();
  const field = page.getByRole('combobox', { name: 'Search Arkpedia' });
  await expect(field).toBeFocused();
  await field.fill('amiya');
  // The index loads on the first open; poll until its rows are in the list.
  await expect(page.getByRole('option').first()).toContainText('Amiya');
  await expect(page.getByRole('option').first()).toContainText('Operator');
  await field.press('Enter');
  await expect(page).toHaveURL(/\/operators\/Amiya(\?|#|$)/);
  await expect(page.getByRole('dialog', { name: 'Search Arkpedia' })).toHaveCount(0);
});

test('a stage code matches as a code, and a pick opens the stage', async ({ page }) => {
  await page.goto('/schedule');
  await page.getByRole('button', { name: 'Search Arkpedia' }).click();
  await page.getByRole('combobox', { name: 'Search Arkpedia' }).fill('1-7');
  const first = page.getByRole('option').first();
  await expect(first).toContainText('1-7');
  await expect(page.getByRole('option', { name: /6-17/ })).toHaveCount(0);
  await first.click();
  await expect(page).toHaveURL(/\/stages\/browse\?s=1-7$/);
});

test('Escape closes the panel and returns focus to the button', async ({ page }) => {
  await page.goto('/schedule');
  const button = page.getByRole('button', { name: 'Search Arkpedia' });
  await button.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Search Arkpedia' })).toHaveCount(0);
  await expect(button).toBeFocused();
});

test('on the phone, the search button opens search and not the menu drawer', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'the phone bar');
  await page.goto('/schedule');
  await page.getByRole('button', { name: 'Search Arkpedia' }).tap();
  await expect(page.getByRole('combobox', { name: 'Search Arkpedia' })).toBeFocused();
  await expect(page.locator('.mobile-nav-overlay')).toHaveCount(0);
});

test('arkpedia.net/?s= and /search?s= open the one exact answer, in place of the search page', async ({ page }) => {
  await page.goto('/?s=wisadel');
  await expect(page).toHaveURL(/\/operators\/Wi%C5%A1(%27|')adel(\?|#|$)/);
  await page.goBack();
  await expect(page).not.toHaveURL(/\/search/);
});

test('/search lists every match when no one row is the answer', async ({ page }) => {
  await page.goto('/search?s=sarkaz');
  await expect(page.locator('main input[name="s"]')).toHaveValue('sarkaz');
  await expect(page.locator('.site-search-page-count')).toContainText(/\d+ results for “sarkaz”/);
  expect(await page.locator('.site-search-page-row').count()).toBeGreaterThan(10);
  await expect(page).toHaveURL(/\/search\?s=sarkaz$/);
});

test('typing on /search keeps what was typed, and the URL follows it', async ({ page }) => {
  await page.goto('/search');
  const field = page.locator('main input[name="s"]');
  // Faster than the URL's 300ms delay, with a pause long enough for some writes to land
  // mid-word: a write catching up must not put an older query back in the field.
  await field.pressSequentially('kal', { delay: 40 });
  await page.waitForTimeout(350);
  await field.pressSequentially('tsit', { delay: 120 });
  await expect(page).toHaveURL(/\/search\?s=kaltsit$/);
  await expect(field).toHaveValue('kaltsit');
  await expect(page.locator('.site-search-page-row').first()).toContainText('Kal');
});
