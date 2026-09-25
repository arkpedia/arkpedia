import { expect, test, type Page } from '@playwright/test';

/*
 * Guards for the games, music and community pages (review 2026-09-25): the bugs a
 * reader saw, each measured on the rendered page.
 */

/** No page-wide sideways scroll. */
async function inBounds(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

/**
 * Anti-Page Jump: put `selector` at `top` px down the viewport, press it where the
 * reader would (a mouse click at its current position, no scroll-into-view), and
 * report how far it moved on screen. The site's rule allows under 4px.
 */
async function pressHolds(page: Page, selector: string, top: number) {
  const target = page.locator(selector).first();
  await target.evaluate((el, y) => window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - y), behavior: 'instant' }), top);
  await page.waitForTimeout(400);
  const before = await target.evaluate(el => el.getBoundingClientRect().top);
  const box = (await target.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(900);
  const after = await target.evaluate(el => el.getBoundingClientRect().top);
  return Math.abs(after - before);
}

test('GM-02: Discover tiles are laid out as tiles, not as uppercase buttons', async ({ page }) => {
  await page.goto('/music/discover');
  const row = page.getByRole('region', { name: 'Recently added albums' });
  const tiles = row.locator('.music-discover-album-tile');
  await expect(tiles.first()).toBeVisible();
  const boxes = await tiles.evaluateAll(els => els.slice(0, 8).map(el => {
    const tile = el.getBoundingClientRect();
    const name = el.querySelector('.music-discover-album-tile-name')!.getBoundingClientRect();
    return { left: tile.left, right: tile.right, nameLeft: name.left, nameRight: name.right, tt: getComputedStyle(el.querySelector('.music-discover-album-tile-name')!).textTransform };
  }));
  expect(boxes.length).toBeGreaterThan(1);
  for (let i = 0; i < boxes.length; i++) {
    // A title stays inside its own tile (they overlapped the next tile by up to 73px) ...
    expect(boxes[i].nameLeft).toBeGreaterThanOrEqual(boxes[i].left - 1);
    expect(boxes[i].nameRight).toBeLessThanOrEqual(boxes[i].right + 1);
    // ... in its own case (the button voice forced uppercase).
    expect(boxes[i].tt).toBe('none');
    if (i) expect(boxes[i].left).toBeGreaterThanOrEqual(boxes[i - 1].right - 0.5);
  }
  await inBounds(page);
});

test('UI-16: /community shows no developer setup notes', async ({ page }) => {
  await page.goto('/community');
  await expect(page.getByRole('heading', { level: 1, name: 'Community Hub' })).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/YOUTUBE_API_KEY|TWITCH_CLIENT_ID|TWITCH_CLIENT_SECRET|twitchConfig\.ts/);
});

test('GE-10/GM-04: the music widget never covers the last row, and stays off /music', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'the reserve is a phone rule (<=640px)');
  await page.goto('/community/videos');
  const toggle = page.locator('[data-music-widget] .music-collapse-toggle');
  await expect(toggle).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await page.waitForTimeout(400);
  const lastBottom = await page.locator('main').evaluate(el => el.lastElementChild!.getBoundingClientRect().bottom);
  const toggleTop = (await toggle.boundingBox())!.y;
  expect(lastBottom, 'the last row must scroll clear of the floating player').toBeLessThanOrEqual(toggleTop);

  await page.goto('/music');
  await expect(page.locator('.music-collapse-toggle')).toHaveCount(0);
  await expect(page.locator('[data-music-widget]')).toHaveCount(0);
});

test('GM-07: nav triggers use the nav links voice', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the desktop nav bar');
  await page.goto('/support');
  const trigger = page.locator('.site-nav-trigger').first();
  const link = page.locator('.site-nav a').filter({ hasText: 'Schedule' }).first();
  const style = (el: Element) => { const s = getComputedStyle(el); return { tt: s.textTransform, weight: s.fontWeight, family: s.fontFamily }; };
  const t = await trigger.evaluate(style);
  const l = await link.evaluate(style);
  expect(t.tt).toBe('none');
  expect(t.weight).toBe(l.weight);
  expect(t.family).toBe(l.family);
});

test('closing a panel holds the reader in place on the games and Discover', async ({ page }) => {
  // Music guesser: closing a long category from below took 435-571px off the page.
  await page.goto('/games/music-guesser');
  const category = 'button[class*="categoryToggle"]';
  await page.locator(category).first().click();
  await page.waitForTimeout(400);
  expect(await pressHolds(page, category, 320)).toBeLessThan(4);

  // Operator guesser: closing "Customize hints".
  await page.goto('/games/operator-guesser');
  await page.locator('details summary').first().click();
  await page.waitForTimeout(400);
  expect(await pressHolds(page, 'details summary', 300)).toBeLessThan(4);

  // Discover: "Show less" on the characters.
  await page.goto('/music/discover');
  const more = 'button[aria-controls="discover-characters"]';
  await page.locator(more).click();
  await page.waitForTimeout(400);
  expect(await pressHolds(page, more, 200)).toBeLessThan(4);
});

test('the recruitment guesser holds its place through reveal and next', async ({ page }) => {
  await page.goto('/games/recruitment-guesser');
  const tags = page.getByLabel('Recruitment tags');
  await expect(tags).toBeVisible();
  // Four rounds: combinations are drawn at random and differ in how many answers they
  // have, which is what makes "Next" shorten the page some of the time.
  for (const label of ['Reveal answers', 'Next combination', 'Reveal answers', 'Next combination', 'Reveal answers', 'Next combination', 'Reveal answers', 'Next combination']) {
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(400);
    const before = await tags.evaluate(el => el.getBoundingClientRect().top);
    await page.getByRole('button', { name: label }).click();
    await page.waitForTimeout(900);
    const after = await tags.evaluate(el => el.getBoundingClientRect().top);
    expect(Math.abs(after - before), `${label} moved the round`).toBeLessThan(4);
  }
  await expect(page.getByRole('button', { name: 'Reveal answers' })).toBeVisible();
});
