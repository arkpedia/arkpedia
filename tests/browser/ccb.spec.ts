import { expect, test, type Page } from '@playwright/test';
import { setTheme } from './overlay-checks';

const searchOperators = (page: Page) => page.getByRole('combobox', { name: 'Search operators', exact: true });
const operatorTable = (page: Page, name: string) => page.getByRole('table', { name: `${name} stat comparison`, exact: true });
const statCells = (page: Page, name: string, stat: string) => operatorTable(page, name)
  .getByRole('row').filter({ has: page.getByRole('rowheader', { name: stat, exact: true }) }).getByRole('cell');
const editBuild = (page: Page, name: string) => page.getByRole('button', { name: `Edit ${name} build`, exact: true }).click();
const teamTable = (page: Page) => page.getByRole('table', { name: 'Team stat comparison', exact: true });
const teamRow = (page: Page, name: string) => teamTable(page).getByRole('row').filter({ has: page.getByRole('button', { name: `Edit ${name} build`, exact: true }) });

async function addOperator(page: Page, name: string) {
  await searchOperators(page).fill(name);
  await page.getByRole('option', { name, exact: true }).click();
}

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

test('a team shares contracts while build and tile choices reload independently from a local preset', async ({ page }, info) => {
  test.setTimeout(60000);
  await page.goto('/game-modes/ccb');
  await setTheme(page, info.project.name === 'mobile' ? 'light' : 'dark');
  const account = await page.evaluate(() => localStorage.getItem('arkpediaAccount'));
  await page.getByRole('group', { name: 'Seasons' }).getByRole('button', { name: /Arclight/ }).click();
  const groundPenalty = page.getByRole('region', { name: 'Deterioration' }).getByRole('button', { name: 'All operators on ground tiles: HP -20%, 10', exact: true });
  const classPenalty = page.getByRole('region', { name: 'Restrictions' }).getByRole('button', { name: 'Sniper / Caster: DP cost ×2, 20', exact: true });
  await groundPenalty.click();
  await classPenalty.click();
  await addOperator(page, 'Thorns');
  const thornsHp = statCells(page, 'Thorns', 'HP');
  await expect(thornsHp.nth(2)).toHaveText(/^-/);
  await expect(statCells(page, 'Thorns', 'DP cost').nth(2)).toHaveText('—');
  const defaultHp = await thornsHp.first().innerText();
  await page.getByRole('combobox', { name: 'Operator promotion' }).click();
  await page.getByRole('option', { name: 'Elite 2', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Operator level', exact: true }).fill('90');
  await page.getByRole('spinbutton', { name: 'Operator trust', exact: true }).fill('200');
  await expect(thornsHp.first()).not.toHaveText(defaultHp);
  const builtHp = await thornsHp.first().innerText();

  await addOperator(page, 'Exusiai');
  await expect(statCells(page, 'Exusiai', 'HP').nth(2)).toHaveText('—');
  await expect(statCells(page, 'Exusiai', 'DP cost').nth(2)).toHaveText(/^\+/);
  await addOperator(page, 'Weedy');
  const weedyHp = statCells(page, 'Weedy', 'HP');
  await expect(weedyHp.nth(2)).toHaveText(/^-/);
  const highTile = page.getByRole('group', { name: 'Deployment tile' }).getByRole('button', { name: 'High tile', exact: true });
  const elapsed = page.getByRole('spinbutton', { name: 'Seconds after deployment', exact: true });
  await highTile.click();
  await elapsed.fill('12');
  await expect(weedyHp.nth(2)).toHaveText('—');
  for (const name of ['Thorns', 'Exusiai', 'Weedy']) {
    await expect(teamRow(page, name).getByRole('cell')).toHaveCount(8);
  }
  await expect(teamRow(page, 'Thorns').getByRole('cell').first()).toContainText(/-\d/);
  await expect(teamRow(page, 'Exusiai').getByRole('cell').nth(4)).toContainText(/\+\d/);
  await expect(teamRow(page, 'Weedy').getByRole('cell').first()).not.toContainText(/-\d/);

  const save = page.getByRole('button', { name: 'Save preset', exact: true });
  const load = page.getByRole('button', { name: 'Load preset', exact: true });
  await save.click();
  await expect(load).toBeEnabled();
  await editBuild(page, 'Thorns');
  await page.getByRole('button', { name: 'Reset to E0 Lv 1', exact: true }).click();
  await expect(thornsHp.first()).toHaveText(defaultHp);
  await editBuild(page, 'Weedy');
  await expect(highTile).toHaveAttribute('aria-pressed', 'true');
  await expect(elapsed).toHaveValue('12');

  await page.reload();
  await expect(load).toBeEnabled();
  await load.click();
  await editBuild(page, 'Thorns');
  await expect(thornsHp.first()).toHaveText(builtHp);
  await expect(page.getByRole('spinbutton', { name: 'Operator level', exact: true })).toHaveValue('90');
  await expect(page.getByRole('spinbutton', { name: 'Operator trust', exact: true })).toHaveValue('200');
  await editBuild(page, 'Weedy');
  await expect(highTile).toHaveAttribute('aria-pressed', 'true');
  await expect(elapsed).toHaveValue('12');
  expect(await page.evaluate(() => localStorage.getItem('arkpediaAccount'))).toBe(account);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('all 13 squad members remain available together and removal frees a slot', async ({ page }, info) => {
  test.setTimeout(60000);
  await page.goto('/game-modes/ccb');
  await setTheme(page, info.project.name === 'mobile' ? 'dark' : 'light');
  const names = ['Thorns', 'Weedy', 'Exusiai', 'Amiya', 'Specter', 'Saria', 'Siege', 'Hoshiguma', 'SilverAsh', 'Ifrit', 'Eyjafjalla', 'Shining', 'Nightingale'];
  await addOperator(page, names[0]);
  await searchOperators(page).fill(names[0]);
  await expect(page.getByRole('option', { name: names[0], exact: true })).toHaveCount(0);
  for (const name of names.slice(1)) await addOperator(page, name);
  const team = teamTable(page);
  await expect(team.getByRole('button', { name: /^Edit .+ build$/ })).toHaveCount(13);
  await expect(team.getByRole('cell')).toHaveCount(13 * 8);
  await expect(page.getByRole('status').filter({ hasText: 'Team is full.' })).toBeVisible();
  await searchOperators(page).fill('Texas');
  await expect(page.getByRole('option', { name: 'Texas', exact: true })).toHaveCount(0);
  await team.getByRole('button', { name: 'Remove Weedy', exact: true }).click();
  await expect(team.getByRole('button', { name: 'Edit Weedy build', exact: true })).toHaveCount(0);
  await addOperator(page, 'Texas');
  await expect(team.getByRole('button', { name: /^Edit .+ build$/ })).toHaveCount(13);
  await expect(operatorTable(page, 'Texas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('the old bookmark redirects and a failed catalogue download can be retried', async ({ page }) => {
  let attempts = 0;
  await page.route('**/_ccb/catalogue-*.json', route => {
    if (++attempts === 1) return route.fulfill({ status: 503 });
    return route.continue();
  });
  await page.goto('/ccb');
  await expect(page).toHaveURL(/\/game-modes\/ccb$/);
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('The battleplan could not load.');
  await page.getByRole('link', { name: 'Squad stats', exact: true }).click();
  await expect(page).toHaveURL(/#ccb-squad$/);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Seasons' }).getByRole('button')).toHaveCount(5);
  await expect(page.getByRole('combobox', { name: 'Search operators' })).toBeInViewport();
});

test('operator suggestions stay visible when the search is at the bottom of the viewport', async ({ page }) => {
  await page.goto('/game-modes/ccb');
  const search = page.getByRole('combobox', { name: 'Search operators' });
  await search.evaluate(input => {
    const { bottom } = input.getBoundingClientRect();
    window.scrollBy(0, bottom - window.innerHeight + 8);
  });
  await search.fill('Thorns');
  const option = page.getByRole('option', { name: 'Thorns', exact: true });
  await expect(option).toBeInViewport();
  await option.click();
  await expect(page.getByRole('table', { name: 'Thorns stat comparison' })).toBeVisible();
});
