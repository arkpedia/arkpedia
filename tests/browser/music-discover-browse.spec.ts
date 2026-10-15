import { chromium, expect, test, type Page } from '@playwright/test';

/*
 * Discover's browse collections (maintainer, 2026-10-14):
 * - Featured artists listed raw credit strings ("Erik Castro, David Lin, Obadiah Brown-Beach
 *   (Acoustic Ver.)", "BaoUner" beside "Bao.Uner", "Uncredited", the label) in no order. It is
 *   one card per artist with a song count, most songs first (lib/music/artistCredits.ts).
 * - Browse by character drew an empty square for every character who is not an operator. Each
 *   tile now has a picture or initials (lib/music/characterPortraits.mjs).
 * - Switching Discover, Library, Now playing and Queue must not move the page sideways when
 *   the page scrollbar comes and goes (html { scrollbar-gutter: stable }, styles/core/shared.css).
 */

const fold = (name: string) => name.normalize('NFKC').toLowerCase().replace(/[\s.\-_·•'’]/g, '');

async function artistCards(page: Page) {
  return page.locator('#discover-artists .music-discover-artist-card').evaluateAll((cards) => cards.map((card) => ({
    name: card.querySelector('.music-discover-artist-name')?.textContent ?? '',
    count: Number((card.querySelector('.music-discover-artist-count')?.textContent ?? '').match(/^(\d+) songs?$/)?.[1] ?? NaN),
  })));
}

test('Featured artists: one card per artist, most songs first, and a card lists that artist\'s songs', async ({ page }) => {
  await page.goto('/music/discover?browse=artists');
  const grid = page.locator('#discover-artists.music-discover-grid');
  await expect(grid).toBeVisible();
  await expect.poll(async () => (await artistCards(page)).length).toBeGreaterThan(50);
  const cards = await artistCards(page);
  for (const { name, count } of cards) {
    expect(Number.isInteger(count) && count > 0, `${name} shows its song count`).toBe(true);
    expect(name, 'one artist, not a combined credit').not.toMatch(/, | and | \/ |、|\bver\.?\)/i);
    expect(['uncredited', 'monstersirenrecords', '塞壬唱片msr'], `${name} is an artist`).not.toContain(fold(name));
  }
  expect(new Set(cards.map((c) => fold(c.name))).size, 'no artist under two spellings').toBe(cards.length);
  for (let i = 1; i < cards.length; i++) expect(cards[i - 1].count, `${cards[i - 1].name} before ${cards[i].name}`).toBeGreaterThanOrEqual(cards[i].count);
  expect(cards.map((c) => c.name)).toContain('BaoUner');
  expect(cards.map((c) => c.name)).not.toContain('Bao.Uner');

  // The filter finds a name among them.
  await page.getByRole('searchbox', { name: 'Filter artists' }).fill('buenck');
  await expect.poll(async () => (await artistCards(page)).map((c) => c.name)).toEqual(['Hendrick Buenck']);
  await page.getByRole('searchbox', { name: 'Filter artists' }).fill('');

  // An artist credited on their own and alongside others: the card's count is the songs listed.
  const artist = cards.find((c) => c.name === 'Matthew Carl Earl')!;
  expect(artist, 'Matthew Carl Earl has a card of his own').toBeTruthy();
  await page.locator('#discover-artists .music-discover-artist-card', { hasText: 'Matthew Carl Earl' }).click();
  await expect(page.locator('.music-discover-active-facet')).toHaveText(' · Matthew Carl Earl');
  await expect(page.locator('.music-discover-song-row')).toHaveCount(artist.count);
  await expect(page.locator('.music-discover-song-row', { hasText: 'Sterling Maffe and Matthew Carl Earl' }).first()).toBeVisible();
});

test('Browse by character: no tile is an empty square', async ({ page }) => {
  await page.goto('/music/discover?browse=characters');
  const tiles = page.locator('#discover-characters .music-discover-character-tile');
  await expect.poll(() => tiles.count()).toBeGreaterThan(100);
  const empty = await tiles.evaluateAll((all) => all
    .filter((tile) => !tile.querySelector('.music-discover-character-portrait img') && !tile.querySelector('.music-discover-character-initials')?.textContent?.trim())
    .map((tile) => tile.querySelector('.music-discover-character-name')?.textContent));
  expect(empty, 'tiles with neither a picture nor initials').toEqual([]);
  // A character the game fights as a boss has that portrait; the Doctor has art or initials.
  await expect(tiles.filter({ hasText: 'Kristen Wright' }).locator('img')).toHaveCount(1);
  const doctor = tiles.filter({ hasText: /^D?Doctor$/ });
  await expect(doctor.locator('img, .music-discover-character-initials')).toHaveCount(1);
});

test('switching the music tabs does not move the page sideways', async ({ baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the page scrollbar takes room on a desktop');
  // Playwright hides scrollbars by default; without --hide-scrollbars, Chromium on Linux (CI)
  // draws classic bars that take room. macOS keeps its overlay bars whatever the flags.
  const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    await page.goto(`${baseURL}/music/discover?browse=characters`);
    await expect(page.locator('.music-nav')).toBeVisible();
    const bar = await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth);
    const place = () => page.evaluate(() => ({
      nav: Math.round(document.querySelector('.music-nav')!.getBoundingClientRect().left),
      title: Math.round(document.querySelector('.page-header h1')!.getBoundingClientRect().left),
      body: Math.round(document.body.getBoundingClientRect().width),
      gutter: getComputedStyle(document.documentElement).scrollbarGutter,
    }));
    const first = await place();
    expect(first.gutter, 'the page reserves the scrollbar\'s room').toBe('stable');
    for (const label of ['Library', 'Now playing', 'Queue', 'Discover']) {
      await page.getByRole('navigation', { name: 'Music' }).getByRole('link', { name: label, exact: true }).click();
      await expect(page.getByRole('navigation', { name: 'Music' }).getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
      await expect.poll(place, `${label}: tabs, title and page width stay put`).toEqual(first);
    }
    if (bar === 0) testInfo.annotations.push({ type: 'note', description: 'overlay scrollbars here: positions compared, the gutter itself only on CI' });
  } finally {
    await browser.close();
  }
});
