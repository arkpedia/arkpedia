import { expect, test } from '@playwright/test';
import { channels as YOUTUBE_CHANNELS } from '../../data/youtube-creators.json';

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

test('Ctrl+K and "/" open the search from anywhere, and "/" stays a character in a field', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'a keyboard');
  await page.goto('/schedule');
  // The shortcut is the app's, so it answers once the page has hydrated: press until it does.
  await expect(async () => {
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'Search Arkpedia' })).toBeVisible({ timeout: 500 });
  }).toPass();
  await expect(page.getByRole('combobox', { name: 'Search Arkpedia' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Search Arkpedia' })).toHaveCount(0);
  await page.keyboard.press('/');
  await expect(page.getByRole('dialog', { name: 'Search Arkpedia' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Search Arkpedia' }).pressSequentially('1/');
  await expect(page.getByRole('combobox', { name: 'Search Arkpedia' })).toHaveValue('1/');
});

test('a click outside the pop-up closes it', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'on a phone the pop-up is the whole screen');
  await page.goto('/schedule');
  await page.getByRole('button', { name: 'Search Arkpedia' }).click();
  await expect(page.getByRole('dialog', { name: 'Search Arkpedia' })).toBeVisible();
  await page.mouse.click(5, 300);
  await expect(page.getByRole('dialog', { name: 'Search Arkpedia' })).toHaveCount(0);
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

test('on the phone the pop-up has a × that closes it: it fills the screen and there is no Esc key', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'the phone pop-up');
  await page.goto('/schedule');
  await page.getByRole('button', { name: 'Search Arkpedia' }).tap();
  await expect(page.getByRole('dialog', { name: 'Search Arkpedia' })).toBeVisible();
  await page.getByRole('button', { name: 'Close search' }).tap();
  await expect(page.getByRole('dialog', { name: 'Search Arkpedia' })).toHaveCount(0);
});

test('on the desktop the pop-up shows no ×: Esc and a click outside close it', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the desktop pop-up');
  await page.goto('/schedule');
  await page.getByRole('button', { name: 'Search Arkpedia' }).click();
  await expect(page.getByRole('button', { name: 'Close search' })).toBeHidden();
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
  // Text typed into the server's copy of the field before the page hydrates is replaced by
  // React's, so wait until the router is up.
  await page.waitForFunction(() => (window as unknown as { next?: { router?: { isReady?: boolean } } }).next?.router?.isReady === true);
  // Faster than the URL's 300ms delay, with a pause long enough for some writes to land
  // mid-word: a write catching up must not put an older query back in the field.
  await field.pressSequentially('kal', { delay: 40 });
  await page.waitForTimeout(350);
  await field.pressSequentially('tsit', { delay: 120 });
  await expect(page).toHaveURL(/\/search\?s=kaltsit$/);
  await expect(field).toHaveValue('kaltsit');
  await expect(page.locator('.site-search-page-row').first()).toContainText('Kal');
});

/* The community's YouTube (lib/search/siteSearch.ts): the curated channels from the index, their
   videos from /api/search-feeds, which the server reads from the checked-in feed
   (ARKPEDIA_YOUTUBE_FEED_FIXTURE, playwright.config.ts). Twitch has no fixture, so its rows are
   held by scripts/tests/test-site-search.ts. */
test('a YouTube creator and their videos are found, and a pick opens YouTube in a new tab', async ({ page, context }) => {
  // The new tab is answered here, so the run never reaches YouTube.
  await context.route('https://www.youtube.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>YouTube</title>' }));
  // The first channel the fixture feeds, so the creator has videos to list under it.
  const creator = YOUTUBE_CHANNELS[0].label;
  await page.goto('/schedule');
  await page.getByRole('button', { name: 'Search Arkpedia' }).click();
  await page.getByRole('combobox', { name: 'Search Arkpedia' }).fill(creator);
  const options = page.getByRole('option');
  await expect(options.first()).toContainText(creator);
  await expect(options.first()).toContainText('YouTube channel');
  // The feed's videos arrive after the index, under the channel.
  await expect(options.nth(1)).toContainText(/Arknights/);
  await expect(options.nth(1)).toContainText(creator);
  await expect(options.nth(1)).toContainText('YouTube');
  const opened = context.waitForEvent('page');
  await options.nth(1).click();
  const tab = await opened;
  await expect.poll(() => tab.url()).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=/);
  await tab.close();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByRole('dialog', { name: 'Search Arkpedia' })).toHaveCount(0);
});

test('/search lists a creator as a link out, and does not jump to it', async ({ page }) => {
  const creator = YOUTUBE_CHANNELS[0];
  await page.goto(`/search?s=${encodeURIComponent(creator.label)}`);
  const row = page.locator('.site-search-page-row').first();
  await expect(row).toContainText(creator.label);
  await expect(row).toHaveAttribute('href', `https://www.youtube.com/channel/${creator.id}`);
  await expect(row).toHaveAttribute('target', '_blank');
  await expect(row).toHaveAttribute('rel', /noopener/);
  // The videos, from the feed, follow it.
  await expect(page.locator('.site-search-page-row[href^="https://www.youtube.com/watch"]').first()).toBeVisible();
  await expect(page).toHaveURL(/\/search\?s=/);
});

/* Artists and voice actors (lib/search/siteSearchIndex.ts): every credited person is a row,
   found by a romanized name (scripts/lib/credit-romanization.ts) and by the loose tiers when
   typed as it looks (lib/search/siteSearch.ts), and a pick opens their credit page searched
   for them. The names are the bundled data's. */
const PEOPLE = [
  { query: 'mgnokuro', name: 'm9nokuro', kind: 'Artist', href: /\/artists\?q=m9nokuro$/ },
  { query: 'kawaguchi', name: 'カワグチ', kind: 'Artist', href: /\/artists\?q=%E3%82%AB%E3%83%AF%E3%82%B0%E3%83%81$/ },
  { query: 'zhaoshuang', name: '赵爽', kind: 'Voice actor', href: /\/voice-actors\?q=%E8%B5%B5%E7%88%BD$/ },
  { query: 'kana hanazwa', name: 'Kana Hanazawa', kind: 'Voice actor', href: /\/voice-actors\?q=Kana(%20|\+)Hanazawa$/ },
];
for (const person of PEOPLE) {
  test(`"${person.query}" finds the ${person.kind.toLowerCase()} ${person.name}, and a pick opens their credit page`, async ({ page }) => {
    await page.goto('/schedule');
    await page.getByRole('button', { name: 'Search Arkpedia' }).click();
    await page.getByRole('combobox', { name: 'Search Arkpedia' }).fill(person.query);
    const first = page.getByRole('option').first();
    await expect(first).toContainText(person.name);
    await expect(first).toContainText(person.kind);
    await expect(first).toContainText(/\d+ operators?/);
    await first.click();
    await expect(page).toHaveURL(person.href);
    // The page reads the name as its search: their card is on it.
    await expect(page.locator('main .credit-person h3', { hasText: person.name }).first()).toBeVisible();
  });
}

test('/search lists a person found by a typo, and does not jump on one', async ({ page }) => {
  await page.goto('/search?s=minokuro');
  await expect(page.locator('.site-search-page-row').first()).toContainText('m9nokuro');
  await expect(page).toHaveURL(/\/search\?s=minokuro$/);
});
