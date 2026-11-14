import { expect, test } from '@playwright/test';
import { setTheme } from './overlay-checks';

for (const theme of ['dark', 'light'] as const) test(`IS native artwork loads through every section (${theme})`, async ({ page }, info) => {
  await page.goto('/game-modes/integrated-strategies?theme=rogue_3&tab=items');
  await setTheme(page, theme);
  const panel = page.getByRole('tabpanel');
  const art = panel.locator('img').first();
  await expect(art).toBeVisible();
  await expect(art).toHaveAttribute('src', /27a6696b6c1d98d442e0a36be031d6869639591e.*integrated-strategies/);
  await expect.poll(() => art.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath(`is-items-${theme}.png`), scale: 'css' });
  for (const name of ['Overview', 'Stages', 'Squads', 'Encounters', 'Special mechanics', 'Endings']) {
    await page.getByRole('tab', { name: new RegExp(`^${name}`) }).click();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('status')).not.toHaveText('Loading theme…');
    if (name === 'Stages') {
      const image = panel.locator('img').first();
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    }
    if (name === 'Squads') {
      const icon = panel.locator('.mode-mark').first();
      await expect(icon).toBeVisible();
      const loaded = await icon.evaluate(async el => {
        const url = getComputedStyle(el).maskImage.slice(5, -2);
        const image = new window.Image(); image.src = url;
        await image.decode(); return image.naturalWidth;
      });
      expect(loaded).toBeGreaterThan(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
  const masks = await page.locator('main .mode-mark').evaluateAll(elements => elements.map(el => getComputedStyle(el).maskImage).filter(value => value !== 'none'));
  expect(masks.length).toBeGreaterThan(3);
});

test('IS reference keeps theme and tab in the URL, searches collectibles and opens stage maps', async ({ page }) => {
  await page.goto('/game-modes');
  const cc = page.getByRole('link', { name: /Contingency Contract/ });
  await expect(cc).toHaveAttribute('href', '/ccb');
  await cc.click();
  await expect(page.getByRole('heading', { name: 'CCB Helper', exact: true })).toBeVisible();
  await page.goBack();
  await page.getByRole('link', { name: /Integrated Strategies/ }).click();
  await page.getByRole('tab', { name: /^Items/ }).click();
  await expect(page.getByRole('combobox', { name: 'Item category', exact: true })).toHaveText('Collectibles');
  const search = page.getByRole('searchbox', { name: 'Search items', exact: true });
  await search.fill('zzzznotarelic');
  await expect(page.getByText('No matching records in this theme.', { exact: true })).toBeVisible();
  await search.fill('');
  await page.getByRole('combobox', { name: 'Integrated Strategies theme', exact: true }).click();
  await page.getByRole('option', { name: /Phantom/ }).click();
  await expect(page.getByRole('heading', { name: 'Phantom & Crimson Solitaire', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/theme=rogue_1/);
  await page.getByRole('tab', { name: /^Stages/ }).click();
  const cards = page.getByRole('tabpanel').getByRole('article');
  await expect.poll(() => cards.count()).toBeGreaterThanOrEqual(60);
  await cards.nth(59).scrollIntoViewIfNeeded();
  await expect.poll(() => cards.count()).toBeGreaterThan(65);
  const map = cards.nth(65).getByRole('link');
  await map.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  await expect(map).toHaveAttribute('href', /^\/stages\/browse\?s=/);
  await expect(page).toHaveURL(/tab=stages/);
  await map.click();
  await expect(page).toHaveURL(/\/stages\/browse\?s=/);
  await expect(page.locator('.stage-detail-col')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('tab', { name: /^Stages/ })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(async () => Math.abs(await page.evaluate(() => window.scrollY) - before)).toBeLessThan(100);
  await expect(page.getByRole('combobox', { name: 'Integrated Strategies theme', exact: true })).toHaveText('Phantom & Crimson Solitaire');
});
