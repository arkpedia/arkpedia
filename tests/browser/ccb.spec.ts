import { expect, test } from '@playwright/test';
import { setTheme } from './overlay-checks';

for (const theme of ['dark', 'light'] as const) {
  test(`CC contracts change enemy stats, add the whole-group bonus, and keep each battlefield's selection (${theme})`, async ({ page }, info) => {
    await page.goto('/game-modes/ccb');
    await setTheme(page, theme);
    // Every season is one press away; CCB #4's maps are in every data snapshot.
    const seasons = page.getByRole('group', { name: 'Seasons' });
    await seasons.getByRole('button', { name: /Arclight/ }).click();
    await expect(seasons.getByRole('button', { name: /Arclight/ })).toHaveAttribute('aria-pressed', 'true');
    const score = page.getByLabel('Contract score', { exact: true });
    const enemy = page.getByRole('table', { name: 'Military Hound stat comparison' });
    const atk = enemy.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'ATK', exact: true }) });
    await expect(atk.getByRole('cell')).toHaveText(['290', '290', '—']);
    // Every group is on the page at once: no drill-in before a contract can be picked.
    const hostile = page.getByRole('region', { name: 'Hostile Forces', exact: true });
    const tiles = hostile.getByRole('button');
    await expect(tiles).toHaveCount(6);
    await hostile.getByRole('button', { name: /ATK.*, 30$/ }).click();
    await expect(score).toHaveText('▲ 30');
    await expect(atk.getByRole('cell')).toHaveText(['290', '464', '+174']);
    // The glyph is the game's own, painted as a mask from the published art.
    const glyph = hostile.locator('.mode-mark').first();
    expect(await glyph.evaluate(el => getComputedStyle(el).maskImage)).toMatch(/contingency-contract\/runeicon\//);
    // A rotating site has its own selection; the permanent site keeps its own.
    const rotating = page.getByRole('group', { name: 'Rotating sites' });
    await rotating.getByRole('button').first().click();
    await expect(score).toHaveText('▲ 0');
    await page.getByRole('button', { name: /Suspended Focus/ }).first().click();
    await expect(score).toHaveText('▲ 30');
    // Selecting the whole group adds its bonus risk.
    for (const tile of await tiles.all()) if (await tile.getAttribute('aria-pressed') !== 'true') await tile.click();
    await expect(hostile.getByText('Completed', { exact: true })).toBeVisible();
    await expect(score).toHaveText('▲ 110');
    await expect(page.getByText('Hostile Forces: whole group selected', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Clear contracts', exact: true }).click();
    await expect(score).toHaveText('▲ 0');
    await expect(atk.getByRole('cell')).toHaveText(['290', '290', '—']);
    // The map opens large and closes again.
    await page.getByRole('button', { name: 'Enlarge the map of Suspended Focus', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Suspended Focus: Map' }).getByRole('img')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // The map's enemies are tiles; picking one drives the comparison.
    const roster = page.getByRole('group', { name: 'Enemies on this map' });
    await roster.getByRole('button').nth(1).click();
    await expect(roster.getByRole('button').nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('table', { name: 'Military Hound stat comparison' })).toHaveCount(0);
    await seasons.getByRole('button', { name: /Pyrolysis/ }).click();
    await expect(seasons.getByRole('button', { name: /Pyrolysis/ })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`ccb-${theme}.png`) });
  });

  test(`CC operator build controls update comparison without writing account data (${theme})`, async ({ page }, info) => {
    await page.goto('/game-modes/ccb');
    await setTheme(page, theme);
    const before = await page.evaluate(() => localStorage.getItem('arkpediaAccount'));
    const search = page.getByRole('combobox', { name: 'Search operators' });
    await search.fill('Thorns');
    const option = page.getByRole('option', { name: 'Thorns', exact: true });
    await expect(option.locator('img')).toBeVisible();
    await option.click();
    const table = page.getByRole('table', { name: 'Thorns stat comparison' });
    await expect(table).toBeVisible();
    // Thorns stands on ground only, so there is no tile choice to make.
    await expect(page.getByRole('group', { name: 'Deployment tile' })).toHaveCount(0);
    const hp = table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'HP', exact: true }) }).getByRole('cell').first();
    const original = await hp.innerText();
    await page.getByRole('combobox', { name: 'Operator promotion' }).click();
    await page.getByRole('option', { name: 'Elite 2', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Operator level', exact: true }).fill('90');
    await expect(hp).not.toHaveText(original);
    await page.getByRole('spinbutton', { name: 'Operator trust', exact: true }).fill('200');
    await expect(page.getByRole('combobox', { name: 'Operator module' })).toBeEnabled();
    expect(await page.evaluate(() => localStorage.getItem('arkpediaAccount'))).toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await table.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`ccb-build-${theme}.png`) });
    await page.getByRole('button', { name: 'Reset to E0 Lv 1', exact: true }).click();
    await expect(hp).toHaveText(original);
    // A Push Stroker can stand on either tile type, so the choice appears.
    await search.fill('Weedy');
    await page.getByRole('option', { name: 'Weedy', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Weedy stat comparison' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Deployment tile' })).toBeVisible();
  });
}
