import { expect, test, type Page } from '@playwright/test';
import { setTheme } from './overlay-checks';

test.setTimeout(120000);
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({ version: 1, analytics: false, externalMedia: false, externalMediaChosen: true, savedAt: Date.now() })));
});

async function bounds(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

for (const route of ['/artists?letter=I', '/voice-actors?letter=S']) {
  test(`${route}: readable creator sections in both themes`, async ({ page }, info) => {
    await page.goto(route);
    const cards = page.locator('.credit-person');
    await expect(cards.first()).toBeVisible();
    for (const theme of ['dark', 'light'] as const) {
      await setTheme(page, theme);
      await bounds(page);
      const geometry = await cards.first().evaluate(el => ({ width: el.getBoundingClientRect().width, parent: el.parentElement!.getBoundingClientRect().width }));
      expect(Math.abs(geometry.width - geometry.parent)).toBeLessThan(2);
      const credits = await page.locator('.credit-op-credit').evaluateAll(els => els.map(el => ({ clamp: getComputedStyle(el).webkitLineClamp, overflow: el.scrollHeight - el.clientHeight })));
      expect(credits.length).toBeGreaterThan(0);
      for (const credit of credits) { expect(credit.clamp).toBe('none'); expect(credit.overflow).toBeLessThanOrEqual(1); }
      await cards.first().scrollIntoViewIfNeeded();
      await expect.poll(() => cards.first().locator('img').first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { timeout: 30000 }).toBe(true);
      await page.screenshot({ path: `.cache/credits-games-qa/${route.startsWith('/artists') ? 'artists' : 'voices'}-${info.project.name}-${theme}.png` });
    }
    const link = cards.first().locator('.credit-op').first();
    const href = await link.getAttribute('href');
    await link.click();
    await expect(page).toHaveURL(new RegExp(href!.split('?')[0]), { timeout: 30000 });
    await page.goBack();
    await expect(cards.first()).toBeVisible();
    expect(new URL(page.url()).searchParams.get('letter')).toBe(route.endsWith('I') ? 'I' : 'S');
  });
}

const games = [
  { path: 'operator-guesser', title: 'Operator Guesser', start: 'Start round', reveal: 'Give up and reveal answer', next: 'Play again' },
  { path: 'color-palette', title: 'Color Palette', start: 'Start guessing', reveal: 'Reveal answer', next: 'Next palette' },
  { path: 'recruitment-guesser', title: 'Recruitment Guesser', reveal: 'Reveal answers', next: 'Next combination' },
  { path: 'stage-guesser', title: 'Stage Guesser', start: 'Start guessing', reveal: 'Reveal answer', next: 'Next stage' },
  { path: 'music-guesser', title: 'Music Guesser', start: 'Start listening', reveal: 'Give up and reveal answer', next: 'Next song' },
];

for (const game of games) {
  test(`${game.title}: hub, round, reveal and replay in both themes`, async ({ page }, info) => {
    await page.goto('/games');
    await page.getByRole('link', { name: game.title, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: game.title })).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('navigation', { name: 'Games', exact: true }).locator('[aria-current="page"]')).toHaveCount(1);
    if (game.start) await page.getByRole('button', { name: game.start, exact: true }).click();
    await expect(page.getByRole('button', { name: game.reveal, exact: true })).toBeVisible({ timeout: 30000 });
    for (const theme of ['dark', 'light'] as const) {
      await setTheme(page, theme);
      await bounds(page);
      await page.screenshot({ path: `.cache/credits-games-qa/${game.path}-${info.project.name}-${theme}.png` });
    }
    await page.getByRole('button', { name: game.reveal, exact: true }).click();
    await expect(page.getByRole('button', { name: game.next, exact: true })).toBeVisible();
    await bounds(page);
    await page.getByRole('button', { name: game.next, exact: true }).click();
    await expect(page.getByRole('button', { name: game.reveal, exact: true })).toBeVisible();
    await bounds(page);
    await page.getByRole('link', { name: 'Games', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Games', exact: true })).toBeVisible();
  });
}
