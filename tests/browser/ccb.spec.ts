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

async function selectArclight(page: Page) {
  const battlefields = page.getByRole('region', { name: 'Battlefields', exact: true });
  await battlefields.getByRole('group', { name: 'Seasons' }).getByRole('button', { name: /Arclight/ }).click();
  await battlefields.getByRole('button', { name: /Suspended Focus/ }).click();
}

const riskDialog = (page: Page) => page.getByRole('dialog', { name: 'Risks', exact: true });

async function openRisks(page: Page) {
  const button = page.getByRole('button', { name: 'Risks', exact: true });
  if (await button.isVisible()) await button.click();
}

async function closeRisks(page: Page) {
  if (await riskDialog(page).isVisible()) await page.keyboard.press('Escape');
}

for (const theme of ['dark', 'light'] as const) {
  test(`CC contracts change enemy stats, add the whole-group bonus, and keep each battlefield's selection (${theme})`, async ({ page }, info) => {
    if (info.project.name === 'mobile' && theme === 'dark') await page.setViewportSize({ width: 320, height: 680 });
    await page.goto('/game-modes/ccb');
    await setTheme(page, theme);
    await selectArclight(page);
    const score = page.getByLabel('Contract score', { exact: true });
    await openRisks(page);
    const risks = riskDialog(page);
    const phone = await risks.isVisible();
    const categoryList = phone ? risks : page.getByRole('region', { name: 'Contract board' });
    const checkbox = categoryList.getByRole('checkbox', { name: 'Select Hostile Forces contracts' });
    const inspect = categoryList.getByRole('button', { name: 'View Hostile Forces contracts' });
    const hostile = risks.getByRole('region', { name: 'Hostile Forces', exact: true });
    await inspect.click();
    await expect(hostile).toBeFocused();
    await expect(hostile).toHaveAttribute('aria-current', 'true');
    await expect(hostile.getByRole('heading', { name: 'Hostile Forces', exact: true })).toBeInViewport();
    await expect(risks.getByRole('button', { name: 'Close Risks', exact: true })).toBeInViewport({ ratio: 1 });
    await expect(hostile.getByRole('button', { name: /, \d+$/ })).toHaveCount(6);
    await expect(risks.getByRole('region', { name: 'Restrictions', exact: true })).toHaveCount(1);
    await hostile.getByRole('button', { name: /ATK.*, 30$/ }).click();
    await expect(hostile).toHaveAttribute('aria-current', 'true');
    expect(await hostile.locator('.mode-mark').first().evaluate(el => getComputedStyle(el).maskImage)).toMatch(/contingency-contract\/runeicon\//);
    if (phone) {
      await risks.getByRole('button', { name: 'Categories', exact: true }).click();
      await expect(inspect).toHaveAttribute('aria-current', 'true');
    } else {
      await closeRisks(page);
      await expect(inspect).toBeFocused();
    }
    await expect(checkbox).toHaveJSProperty('indeterminate', true);
    await closeRisks(page);
    await expect(score).toHaveText('▲ 30');
    await page.getByRole('button', { name: 'Enemy stats', exact: true }).click();
    const enemy = page.getByRole('table', { name: 'Military Hound stat comparison' });
    const atk = enemy.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'ATK', exact: true }) });
    await expect(atk.getByRole('cell')).toHaveText(['290', '464', '+174']);
    await page.keyboard.press('Escape');

    await page.getByRole('group', { name: 'Rotating sites' }).getByRole('button').first().click();
    await expect(score).toHaveText('▲ 0');
    await selectArclight(page);
    await expect(score).toHaveText('▲ 30');

    await openRisks(page);
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await closeRisks(page);
    await expect(score).toHaveText('▲ 110');
    await openRisks(page);
    await checkbox.click();
    await expect(checkbox).not.toBeChecked();
    await closeRisks(page);
    await expect(score).toHaveText('▲ 0');

    await page.getByRole('button', { name: 'Enlarge the map of Suspended Focus', exact: true }).click();
    const map = page.getByRole('dialog', { name: 'Suspended Focus: Map' });
    await expect(map.getByRole('img', { name: 'Tile map of Suspended Focus' })).toBeVisible();
    await map.getByRole('button', { name: 'In-game screenshot' }).click();
    await expect(map.getByRole('img', { name: 'In-game screenshot of Suspended Focus' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
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
    await editBuild(page, 'Thorns');
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
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Edit Thorns build' })).toBeFocused();
    // A Push Stroker can stand on either tile type, so the choice appears.
    await search.fill('Weedy');
    await page.getByRole('option', { name: 'Weedy', exact: true }).click();
    await editBuild(page, 'Weedy');
    await expect(page.getByRole('table', { name: 'Weedy stat comparison' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Deployment tile' })).toBeVisible();
  });
}

test('a team shares contracts while build and tile choices reload independently from a local preset', async ({ page }, info) => {
  test.setTimeout(60000);
  await page.goto('/game-modes/ccb');
  await setTheme(page, info.project.name === 'mobile' ? 'light' : 'dark');
  const account = await page.evaluate(() => localStorage.getItem('arkpediaAccount'));
  await selectArclight(page);
  await openRisks(page);
  for (const [category, label] of [
    ['Deterioration', 'All operators on ground tiles: HP -20%, 10'],
    ['Restrictions', 'Sniper / Caster: DP cost ×2, 20'],
  ]) {
    const risks = riskDialog(page);
    const view = `View ${category} contracts`;
    if (await risks.isVisible()) {
      await risks.getByRole('button', { name: 'Categories', exact: true }).click();
      await risks.getByRole('button', { name: view, exact: true }).click();
    } else await page.getByRole('button', { name: view, exact: true }).click();
    const group = risks.getByRole('region', { name: category, exact: true });
    await expect(group).toBeFocused();
    await expect(risks.locator('section[aria-current="true"]')).toHaveCount(1);
    await expect(group).toHaveAttribute('aria-current', 'true');
    await group.getByRole('button', { name: label, exact: true }).click();
  }
  await closeRisks(page);
  await addOperator(page, 'Thorns');
  await editBuild(page, 'Thorns');
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

  await page.keyboard.press('Escape');
  await addOperator(page, 'Exusiai');
  await editBuild(page, 'Exusiai');
  await expect(statCells(page, 'Exusiai', 'HP').nth(2)).toHaveText('—');
  await expect(statCells(page, 'Exusiai', 'DP cost').nth(2)).toHaveText(/^\+/);
  await page.keyboard.press('Escape');
  await addOperator(page, 'Weedy');
  await editBuild(page, 'Weedy');
  const weedyHp = statCells(page, 'Weedy', 'HP');
  await expect(weedyHp.nth(2)).toHaveText(/^-/);
  const highTile = page.getByRole('group', { name: 'Deployment tile' }).getByRole('button', { name: 'High tile', exact: true });
  const elapsed = page.getByRole('spinbutton', { name: 'Seconds after deployment', exact: true });
  await highTile.click();
  await elapsed.fill('12');
  await expect(weedyHp.nth(2)).toHaveText('—');
  await page.keyboard.press('Escape');
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
  await page.keyboard.press('Escape');
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
  await page.keyboard.press('Escape');
  await editBuild(page, 'Weedy');
  await expect(highTile).toHaveAttribute('aria-pressed', 'true');
  await expect(elapsed).toHaveValue('12');
  expect(await page.evaluate(() => localStorage.getItem('arkpediaAccount'))).toBe(account);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('stage limits and blocked tiles update with the selected contracts', async ({ page }) => {
  await page.goto('/game-modes/ccb');
  await selectArclight(page);
  const stage = page.getByRole('region', { name: 'Suspended Focus: Stage', exact: true });
  const deploy = stage.locator('dt').filter({ hasText: 'Deployment limit' }).locator('..').locator('dd strong');
  const dpRecovery = stage.locator('dt').filter({ hasText: 'DP per second' }).locator('..').locator('dd strong');
  const lifePoints = stage.locator('dt').filter({ hasText: 'Life points' }).locator('..');
  const blockedTiles = stage.locator('dt').filter({ hasText: 'Blocked tiles' }).locator('..');
  const blocked = stage.locator('svg [data-blocked="true"]');

  await expect(deploy).toHaveText('9');
  await expect(dpRecovery).toHaveText('1');
  await expect(blockedTiles.locator('dd strong')).toHaveText('0');
  await expect(blocked).toHaveCount(0);
  await openRisks(page);
  const board = await riskDialog(page).isVisible() ? riskDialog(page) : page.getByRole('region', { name: 'Contract board' });
  for (const category of ['Deprivation', 'Restrictions']) {
    await board.getByRole('checkbox', { name: `Select ${category} contracts`, exact: true }).check();
  }
  await board.getByRole('button', { name: 'View Deprivation contracts', exact: true }).click();
  await riskDialog(page).getByRole('button', { name: 'Deployment limit -4, 30', exact: true }).click();
  await closeRisks(page);

  await expect(deploy).toHaveText('5');
  await expect(dpRecovery).toHaveText('0.5');
  await expect(blockedTiles.locator('dd strong')).toHaveText('4');
  await expect(blocked).toHaveCount(4);
  const lifeBox = (await lifePoints.boundingBox())!;
  const blockedBox = (await blockedTiles.boundingBox())!;
  expect(Math.abs(blockedBox.x - lifeBox.x)).toBeLessThanOrEqual(1);
  expect(blockedBox.y).toBeGreaterThanOrEqual(lifeBox.y + lifeBox.height);

  await page.getByRole('button', { name: 'Enlarge the map of Suspended Focus', exact: true }).click();
  const map = page.getByRole('dialog', { name: 'Suspended Focus: Map', exact: true });
  await expect(map.locator('svg [data-blocked="true"]')).toHaveCount(4);
  await page.keyboard.press('Escape');
});

test('mixed blocked tiles keep the overview steady beside larger enemy portraits', async ({ page }, info) => {
  await page.goto('/game-modes/ccb');
  await selectArclight(page);
  await page.getByRole('region', { name: 'Battlefields', exact: true }).getByRole('button', { name: /Cursed Bonefield/ }).click();
  const stage = page.getByRole('region', { name: 'Cursed Bonefield: Stage', exact: true });
  const enemies = page.getByRole('region', { name: 'Enemies on this map', exact: true });
  const portrait = enemies.getByRole('button', { name: 'Bloodborn Spawn', exact: true });
  const team = page.locator('#ccb-squad');
  await expect(portrait).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const stageBefore = (await stage.boundingBox())!;
  const teamBefore = (await team.boundingBox())!;
  expect((await portrait.boundingBox())!.width).toBeGreaterThanOrEqual(40);

  await openRisks(page);
  const board = await riskDialog(page).isVisible() ? riskDialog(page) : page.getByRole('region', { name: 'Contract board' });
  await board.getByRole('button', { name: 'View Test criteria contracts', exact: true }).click();
  await riskDialog(page).getByRole('button', { name: '3 map tiles become unavailable for deployment, 20', exact: true }).first().click();
  await closeRisks(page);
  await expect(stage.getByText('1 ground, 2 high', { exact: true })).toBeVisible();
  const stageAfter = (await stage.boundingBox())!;
  const teamAfter = (await team.boundingBox())!;
  expect(stageAfter.height).toBeCloseTo(stageBefore.height, 0);
  expect(teamAfter.y - stageAfter.y).toBeCloseTo(teamBefore.y - stageBefore.y, 0);
  if (info.project.name === 'desktop') {
    const enemyBox = (await enemies.boundingBox())!;
    expect(enemyBox.y).toBeCloseTo(stageAfter.y, 0);
    expect(enemyBox.height).toBeCloseTo(stageAfter.height, 0);
  }
});

test('Blood-Soaked Earth labels pollution separately from contract blocks', async ({ page }) => {
  await page.goto('/game-modes/ccb');
  const battlefields = page.getByRole('region', { name: 'Battlefields', exact: true });
  await battlefields.getByRole('group', { name: 'Seasons' }).getByRole('button', { name: /Extinguished Sins/ }).click();
  await page.getByRole('button', { name: 'Enlarge the map of Blood-Soaked Earth', exact: true }).click();
  const map = page.getByRole('dialog', { name: 'Blood-Soaked Earth: Map', exact: true });
  const legend = map.getByRole('list', { name: 'Map legend', exact: true });
  await expect(legend.getByText('Originium Pollution', { exact: false })).toContainText('reduces their SP recovery');
  await expect(legend.getByText('Blocked by a contract', { exact: false })).toBeVisible();
  const schematic = map.getByRole('img', { name: 'Tile map of Blood-Soaked Earth', exact: true });
  await expect(schematic.locator('[data-blocked="true"]')).toHaveCount(0);
  await expect(schematic.locator('title').filter({ hasText: 'Originium Pollution · Melee deployment' })).not.toHaveCount(0);
  await expect(schematic.locator('title').filter({ hasText: 'Originium Pollution · Ranged deployment' })).not.toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(map).toBeHidden();
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
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save preset', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Load preset', exact: true }).click();
  await expect(team.getByRole('button', { name: /^Edit .+ build$/ })).toHaveCount(13);
  await expect(team.getByRole('cell')).toHaveCount(13 * 8);
  await editBuild(page, 'Texas');
  await expect(operatorTable(page, 'Texas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('the old bookmark redirects and a failed catalogue download can be retried', async ({ page }) => {
  let attempts = 0;
  await page.route('**/_ccb/catalogue-*.json', route => {
    if (++attempts === 1) return route.fulfill({ status: 503 });
    return route.continue();
  });
  await page.goto('/ccb#ccb-squad');
  await expect(page).toHaveURL(/\/game-modes\/ccb#ccb-squad$/);
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('The battleplan could not load.');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Battlefields' })).toBeVisible();
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
  await expect(teamTable(page).getByRole('button', { name: 'Edit Thorns build' })).toBeVisible();
});
