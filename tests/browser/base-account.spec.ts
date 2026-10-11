import { expect, test, type Page } from '@playwright/test';
import account from '../fixtures/base-account.json';
import { fontsSettled } from './census-routes';

async function seedAccount(page: Page, snapshot = true) {
  await page.addInitScript(({ account, snapshot }) => {
    const record = { ...account, ...(snapshot ? {} : { base: undefined }) };
    localStorage.setItem('arkpediaAccount', JSON.stringify(record));
    localStorage.setItem('plannerRoster', JSON.stringify(Object.fromEntries(account.operators.map(name => [name, { elite: 2, level: 40, skillLevel: 1, masteries: {} }]))));
  }, { account, snapshot });
}
async function begin(page: Page) {
  await page.goto('/base');
  await page.locator('.base-setup-preset-card').first().click();
  await page.getByRole('button', { name: 'Begin Simulation' }).click();
}
const room = (page: Page, prefix = 'B101') => page.getByRole('button', { name: new RegExp(`^${prefix} `), includeHidden: true });
const source = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test('presets stay highlighted while open and clearing preserves saved setups, layout and rotation', async ({ page }, info) => {
  await seedAccount(page); await begin(page);
  await source(page, 'Imported account').click();
  await source(page, 'Edit a copy').first().click();
  const presetsButton = source(page, 'Presets');
  await expect(presetsButton).toHaveAttribute('aria-expanded', 'false');
  const inactiveColor = 'rgba(0, 0, 0, 0)';
  await expect(presetsButton).toHaveCSS('background-color', inactiveColor);
  await presetsButton.click();
  await expect(presetsButton).toHaveAttribute('aria-expanded', 'true');
  await expect(presetsButton).not.toHaveCSS('background-color', inactiveColor);
  await presetsButton.click();
  await expect(page.getByRole('region', { name: 'Saved base presets' })).toHaveCount(0);
  await expect(presetsButton).toHaveCSS('background-color', inactiveColor);
  await presetsButton.click();
  await page.getByPlaceholder('e.g. Gold team').fill('Original staffing');
  await source(page, 'Save new').click();
  await source(page, 'Rotation').click();
  await source(page, 'Add shift').click();
  await page.getByRole('dialog', { name: 'Rotation', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
  const preserved = await page.evaluate(() => Object.fromEntries(['baseSetup_v2', 'baseSavedPresets_v1', 'baseRotationPlan_v1', 'arkpediaAccount'].map(key => [key, localStorage.getItem(key)])));
  expect(preserved.baseSetup_v2).not.toBeNull();
  expect(JSON.parse(preserved.baseRotationPlan_v1!).shifts).toHaveLength(1);
  // Capture the real control layout before the destructive-to-draft action.
  await fontsSettled(page);
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 900 });
  for (const theme of ['dark', 'light'] as const) {
    const switcher = page.getByRole('button', { name: theme === 'light' ? 'Switch to light mode' : 'Switch to dark mode', exact: true });
    if (await switcher.count()) await switcher.click();
    await expect(presetsButton).not.toHaveCSS('background-color', inactiveColor);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const pickerBox = await page.getByRole('combobox', { name: 'Saved preset', exact: true }).boundingBox();
    const nameBox = await page.getByLabel('New preset', { exact: true }).boundingBox();
    expect(Math.abs(pickerBox!.height - nameBox!.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(pickerBox!.x - nameBox!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(pickerBox!.width - nameBox!.width)).toBeLessThanOrEqual(1);
    const loadBox = await source(page, 'Load').boundingBox();
    const updateBox = await source(page, 'Update').boundingBox();
    const deleteBox = await source(page, 'Delete').boundingBox();
    expect(Math.abs(loadBox!.y - updateBox!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(loadBox!.y - deleteBox!.y)).toBeLessThanOrEqual(1);
    const saveBox = await source(page, 'Save new').boundingBox();
    expect(Math.abs(saveBox!.height - nameBox!.height)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `.cache/base-preset-layout/${theme}-${info.project.name}-active.png` });
  }
  await source(page, 'Clear base').click();
  await expect(page.getByRole('status')).toContainText('Current base cleared');
  await expect(source(page, 'Update')).toBeDisabled();
  await expect(room(page)).toHaveAttribute('aria-label', /0 of 3 operators/);
  const emptyAssignments = await page.evaluate(() => JSON.parse(localStorage.getItem('baseAssignments_v2')!));
  expect(Object.values(emptyAssignments).flat().filter(Boolean)).toEqual([]);
  expect(await page.evaluate(() => Object.fromEntries(['baseSetup_v2', 'baseSavedPresets_v1', 'baseRotationPlan_v1', 'arkpediaAccount'].map(key => [key, localStorage.getItem(key)])))).toEqual(preserved);
  await page.getByPlaceholder('e.g. Gold team').fill('Empty staffing');
  // Editing the next preset must not cause an effect to reselect an old setup.
  await expect(source(page, 'Update')).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Saved preset', exact: true })).toHaveText('Choose a preset');
  await source(page, 'Save new').click();
  await page.reload();
  await expect(room(page)).toHaveAttribute('aria-label', /0 of 3 operators/);
  await presetsButton.click();
  await page.getByRole('combobox', { name: 'Saved preset', exact: true }).click();
  await page.getByRole('option', { name: 'Original staffing', exact: true }).click();
  await source(page, 'Load').click();
  await expect(room(page)).toHaveAttribute('aria-label', /3 of 3 operators/);
  await source(page, 'Imported account').click();
  await expect(presetsButton).toBeDisabled();
  await expect(presetsButton).toHaveAttribute('aria-expanded', 'false');
  await expect(source(page, 'Clear base')).toHaveCount(0);
  await expect(room(page)).toHaveAttribute('aria-label', /3 of 3 operators/);
});

test('imported rooms preserve the plan, show exact Morale, and copy only on request', async ({ page }) => {
  await seedAccount(page); await begin(page);
  const saved = await page.evaluate(() => localStorage.getItem('baseAssignments_v2'));
  await source(page, 'Imported account').click();
  await expect(room(page)).toHaveAttribute('aria-label', /3 of 3 operators/);
  await room(page).click();
  await expect(page.getByLabel('Imported room details')).toContainText('Proviso');
  await expect(page.getByLabel('Imported room details')).toContainText('18.0 / 24 Morale');
  await expect(source(page, 'Edit layout')).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('baseAssignments_v2'))).toBe(saved);
  await source(page, 'Your plan').click();
  await expect(room(page)).toHaveAttribute('aria-label', /0 of 3 operators/);
  await source(page, 'Imported account').click();
  await source(page, 'Edit a copy').first().click();
  await expect(source(page, 'Your plan')).toHaveAttribute('aria-pressed', 'true');
  await expect(room(page)).toHaveAttribute('aria-label', /3 of 3 operators/);
  const presets = await page.evaluate(() => JSON.parse(localStorage.getItem('baseSavedPresets_v1')!));
  expect(presets.some((p: {name: string}) => p.name === 'Plan before account copy')).toBe(true);
  await room(page).click();
  await expect(page.getByLabel('Room level')).toBeVisible();
  await expect(page.getByPlaceholder('Search operators...')).toBeVisible();
});

test('an imported snapshot opens before formation setup and can become a repeating shift', async ({ page }) => {
  await seedAccount(page); await page.goto('/base');
  await source(page, 'Imported account').click();
  await expect(room(page)).toHaveAttribute('aria-label', /3 of 3 operators/);
  await source(page, 'Add to rotation').click();
  const timetable = page.getByLabel('Rotation timetable');
  await expect(timetable).toBeVisible();
  await expect(timetable).toContainText('Starts from imported Morale');
  await expect(timetable).toContainText('Dusk reaches 0 Morale');
  await page.getByLabel('Shift 1 hours').fill('24');
  await expect(timetable).toContainText('Next cycle:');
  await page.reload();
  await source(page, 'Imported account').click();
  await source(page, 'Rotation').click();
  await expect(page.getByLabel('Shift 1 hours')).toHaveValue('24');
  await source(page, 'Load shift').click();
  await expect(source(page, 'Your plan')).toHaveAttribute('aria-pressed', 'true');
  await expect(room(page)).toHaveAttribute('aria-label', /3 of 3 operators/);
});

test('older imports explain reimporting and leave formation intact', async ({ page }) => {
  await seedAccount(page, false); await page.goto('/base');
  await source(page, 'Imported account').click();
  await expect(page.getByLabel('Imported base unavailable')).toContainText('Import it again');
  await expect(source(page, 'Save image')).toBeDisabled();
  await source(page, 'Your plan').click();
  await expect(page.getByRole('heading', { name: 'Base Formation' })).toBeVisible();
});

test('room selection keeps the desktop board stable and the narrow phone page contained', async ({ page }, info) => {
  await seedAccount(page); await begin(page);
  await fontsSettled(page);
  const before = await room(page).boundingBox();
  await room(page).click();
  const after = await room(page).boundingBox();
  if (info.project.name === 'desktop') {
    expect(Math.abs(before!.width - after!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(before!.x - after!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(before!.y - after!.y)).toBeLessThanOrEqual(1);
  }
  await source(page, '‹ Back').click();
  await page.setViewportSize({ width: 320, height: 800 });
  await source(page, 'Imported account').click();
  await source(page, 'Add to rotation').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.getByRole('dialog', { name: 'Rotation', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
  await room(page).click();
  await expect(page.getByLabel('Imported room details')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('base replacement picks use imported unlock levels over stale planner progress', async ({ page }) => {
  await seedAccount(page); await begin(page);
  await room(page, 'B102').click();
  await page.getByPlaceholder('Search operators...').fill('Spot');
  await page.locator('.base-room-card', { hasText: 'Spot' }).click();
  const placed = await page.evaluate(() => JSON.parse(localStorage.getItem('baseAssignments_v2')!).prod2[0]);
  expect(placed).toMatchObject({ operatorName: 'Spot', eliteLevel: 'Base', level: 20 });
});

test('base working and resting setups keep one physical operator and form a saved rotation', async ({ page }) => {
  await seedAccount(page); await begin(page);
  await room(page).click();
  await page.getByPlaceholder('Search operators...').fill('SilverAsh');
  await page.locator('.base-room-card', { hasText: 'SilverAsh' }).click();
  await source(page, '‹ Back').click();
  await source(page, 'Presets').click();
  await page.getByPlaceholder('e.g. Gold team').fill('Working');
  await source(page, 'Save new').click();
  await page.getByRole('button', { name: /^Dorm 1 Dormitory/ }).click();
  await page.getByPlaceholder('Search operators...').fill('SilverAsh');
  await page.locator('.base-room-card', { hasText: 'SilverAsh' }).click();
  await page.getByLabel('SilverAsh current Morale').fill('6');
  await source(page, '‹ Back').click();
  await expect(room(page)).toHaveAttribute('aria-label', /0 of 3 operators/);
  await page.getByPlaceholder('e.g. Gold team').fill('Resting');
  await source(page, 'Save new').click();
  await source(page, 'Rotation').click();
  await source(page, 'Add shift').click();
  await source(page, 'Add shift').click();
  await page.getByLabel('Shift 2 setup', { exact: true }).click();
  await page.getByRole('option', { name: 'Resting', exact: true }).click();
  await expect(page.getByLabel('Rotation timetable')).toContainText('Resting: SilverAsh');
  const setups = await page.evaluate(() => JSON.parse(localStorage.getItem('baseSavedPresets_v1')!));
  expect(setups[0].rotationRates.SilverAsh).toBeGreaterThan(0);
  expect(setups[1].rotationRates.SilverAsh).toBeLessThan(0);
  expect(setups[1].assignments.dormitory1[0].morale).toBe(6);
});

test('base facility-count skills exclude imported unbuilt rooms', async ({ page }) => {
  await page.addInitScript(record => {
    for (const id of ['prod3', 'prod6', 'prod9'] as const) record.base.facilityLevels[id] = 0;
    record.operators.push('Windflit');
    record.base.assignments.prod8 = [{ operatorName: 'Windflit', eliteLevel: 'Elite 2', level: 40, morale: 18 }, null, null];
    localStorage.setItem('arkpediaAccount', JSON.stringify(record));
  }, account);
  await page.goto('/base');
  await source(page, 'Imported account').click();
  await expect(room(page, 'B302')).toContainText('101% efficiency');
  await expect(room(page, 'B103')).toHaveAttribute('aria-label', /level 0, 0 of 0 operators/);
});

test('base output estimates respect an exhausted imported factory worker', async ({ page }) => {
  await page.addInitScript(record => {
    record.base.morale.FEater = 0;
    record.base.assignments.prod2[0]!.morale = 0;
    localStorage.setItem('arkpediaAccount', JSON.stringify(record));
  }, account);
  await page.goto('/base');
  await source(page, 'Imported account').click();
  await expect(page.getByLabel('Daily production estimates')).toContainText('0 EXP / day');
  await expect(room(page, 'B102')).toContainText('0.0h until tired');
});

test('the production floor plan stays intact at desktop and narrow phone widths', async ({ page }) => {
  await seedAccount(page); await begin(page);
  await fontsSettled(page);
  const geometry = () => page.locator('.base-overview').evaluate(grid => {
    const position = (area: string) => {
      const tile = Array.from(grid.children).find(child => (child as HTMLElement).style.gridArea === area) as HTMLElement;
      return { x: tile.offsetLeft, y: tile.offsetTop };
    };
    return Object.fromEntries(['cc', 'reception', 'prod1', 'prod2', 'prod7', 'dorm1', 'dorm3', 'dorm4', 'workshop', 'office', 'training'].map(area => [area, position(area)]));
  });
  const wide = await geometry();
  expect(wide.cc.y).toBe(wide.reception.y);
  expect(wide.cc.y).toBeLessThan(wide.prod1.y);
  expect(wide.prod1.y).toBe(wide.workshop.y);
  expect(wide.prod7.y).toBe(wide.training.y);
  expect(wide.prod1.x).toBeLessThan(wide.prod2.x);
  expect(wide.prod2.x).toBeLessThan(wide.dorm1.x);
  expect(wide.dorm1.x).toBeLessThan(wide.workshop.x);
  expect(wide.workshop.x).toBe(wide.office.x);
  expect(wide.dorm4.x).toBe(wide.cc.x);
  expect(wide.dorm4.y).toBeGreaterThan(wide.dorm3.y);
  await page.setViewportSize({ width: 320, height: 800 });
  await expect.poll(geometry).toEqual(wide);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await source(page, 'Imported account').click();
  const imported = await geometry();
  expect(imported.cc.x).toBe(imported.dorm1.x);
  expect(imported.prod1.y).toBe(imported.workshop.y);
  expect(imported.prod7.y).toBe(imported.training.y);
});

test('zoom, drag and fullscreen preserve room selection and keyboard access', async ({ page }) => {
  await begin(page);
  const zoom = page.getByLabel('Base zoom', { exact: true });
  const initial = Number(await zoom.inputValue());
  await source(page, 'Zoom in').click();
  expect(Number(await zoom.inputValue())).toBeGreaterThan(initial);
  await zoom.press('End');
  await expect(zoom).toHaveValue('2.5');
  await room(page).scrollIntoViewIfNeeded();
  const box = (await room(page).boundingBox())!;
  const view = page.getByLabel('Zoomable base map', { exact: true });
  const before = await view.evaluate(element => element.scrollLeft);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(await view.evaluate(element => element.scrollLeft)).toBeGreaterThan(before);
  await expect(page.locator('.base-room-panel')).toHaveCount(0);
  await source(page, 'Fit base').click();
  await source(page, 'View fullscreen').click();
  await expect(page.getByRole('dialog', { name: 'Base floor plan' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(source(page, 'View fullscreen')).toBeFocused();
  await source(page, 'View fullscreen').click();
  await room(page).click();
  await expect(page.getByRole('dialog', { name: 'Base floor plan' })).toHaveCount(0);
  await expect(page.getByLabel('Room level')).toBeVisible();
});

test('changing staffing preserves a panned map while room summaries grow', async ({ page }) => {
  await begin(page);
  await fontsSettled(page);
  await page.setViewportSize({ width: 1440, height: 800 });
  const view = page.getByLabel('Zoomable base map', { exact: true });
  await source(page, 'Fit base').click();
  await view.evaluate(element => { element.scrollTop = 40; });
  const before = await view.evaluate(element => element.scrollTop);
  expect(before).toBe(40);
  await room(page).click();
  await page.getByPlaceholder('Search operators...').fill('SilverAsh');
  const height = await page.locator('.base-overview').evaluate(element => (element as HTMLElement).offsetHeight);
  await page.locator('.base-room-card').filter({ hasText: 'SilverAsh', hasNotText: 'Reignfrost' }).click();
  await expect(room(page)).toHaveAttribute('aria-label', /1 of 3 operators/);
  await expect.poll(() => page.locator('.base-overview').evaluate(element => (element as HTMLElement).offsetHeight)).toBeGreaterThan(height);
  await source(page, '‹ Back').click();
  await expect.poll(() => view.evaluate(element => element.scrollTop)).toBe(before);
});

test('staffing replaces the map with a wide readable grid and restores keyboard focus', async ({ page }) => {
  await begin(page);
  await fontsSettled(page);
  await room(page).click();
  const picker = page.getByRole('region', { name: 'Trading Post staffing' });
  await expect(picker).toBeVisible();
  const viewport = page.viewportSize()!;
  const { bounds, workspace } = await picker.evaluate(el => {
    const rect = (node: Element) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    };
    return { bounds: rect(el), workspace: rect(el.closest('.base-command-workspace')!) };
  });
  expect(bounds.x).toBe(workspace.x);
  expect(bounds.y).toBe(workspace.y);
  expect(bounds.width).toBe(workspace.width);
  expect(bounds.height).toBe(workspace.height);
  await expect(page.getByLabel('Base floor plan', { exact: true })).not.toBeVisible();
  const grid = picker.locator('.base-room-grid');
  expect((await grid.boundingBox())!.height).toBeGreaterThanOrEqual(180);
  await expect(source(page, '‹ Back')).toBeInViewport();
  if (viewport.width > 1000) {
    const first = (await grid.locator('.base-room-card').nth(0).boundingBox())!;
    const second = (await grid.locator('.base-room-card').nth(1).boundingBox())!;
    expect(second.x).toBeGreaterThan(first.x);
    expect(second.y).toBe(first.y);
  }
  await expect(picker.locator('.base-room-card-skill-desc').first()).toBeInViewport();
  const firstCard = grid.locator('.base-room-card').first();
  expect(await firstCard.evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  await page.getByLabel('Room level').click();
  await expect(page.getByRole('listbox', { name: 'Room level' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await picker.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(page.getByLabel('Base floor plan', { exact: true })).toBeVisible();
  await expect(room(page)).toBeFocused();
  await room(page).press('Enter');
  await source(page, '‹ Back').click();
  await expect(room(page)).toBeFocused();
  await page.setViewportSize({ width: 320, height: 800 });
  await room(page, 'B102').click();
  const factory = page.getByRole('region', { name: 'Factory staffing' });
  expect(await factory.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  expect(await factory.locator('.base-room-team').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  await expect(source(page, 'Originium Shards')).toBeInViewport();
});

test('layout editing anchors the eyebrow and calculation uses the existing Staffing control', async ({ page }) => {
  await seedAccount(page); await begin(page); await fontsSettled(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  const eyebrow = page.locator('.page-header .eyebrow');
  const before = await eyebrow.boundingBox();
  await source(page, 'Edit layout').click();
  const editing = await eyebrow.boundingBox();
  expect(Math.abs(editing!.y - before!.y)).toBeLessThanOrEqual(1);
  await source(page, 'Cancel').click();
  expect(Math.abs((await eyebrow.boundingBox())!.y - before!.y)).toBeLessThanOrEqual(1);
  await room(page, 'B102').click();
  await source(page, 'Calculation').click();
  await expect(source(page, '‹ Back to operators')).toHaveCount(0);
  await expect(source(page, 'Staffing')).toBeVisible();
  await source(page, 'Staffing').click();
  await expect(page.getByPlaceholder('Search operators...')).toBeVisible();
  await source(page, 'Rotation').click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Rotation', exact: true })).toHaveCount(0);
  await expect(page.getByPlaceholder('Search operators...')).toBeVisible();
});

test('rotation is a modal with real preset choices, editable empty hours and distinct output calculations', async ({ page }) => {
  await seedAccount(page);
  await page.addInitScript(() => {
    const record = JSON.parse(localStorage.getItem('arkpediaAccount')!);
    record.base.assignments = { prod2: [{ operatorName: 'FEater', eliteLevel: 'Elite 2', level: 40, morale: 24 }] };
    record.base.morale = { FEater: 24 };
    localStorage.setItem('arkpediaAccount', JSON.stringify(record));
  });
  await begin(page);
  await source(page, 'Imported account').click();
  await source(page, 'Edit a copy').first().click();
  await page.getByRole('group', { name: 'Login interval', exact: true }).getByRole('button', { name: '12h', exact: true }).click();
  const strip = page.getByLabel('Daily production estimates');
  const exp = async () => Number((await strip.innerText()).match(/([\d,]+)\s+EXP \/ day/)![1].replaceAll(',', ''));
  const workingExp = await exp();
  expect(workingExp).toBeGreaterThan(0);
  await source(page, 'Presets').click();
  await page.getByPlaceholder('e.g. Gold team').fill('Working');
  await source(page, 'Save new').click();
  await page.getByRole('combobox', { name: 'Saved preset', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Choose a preset', exact: true })).toHaveCount(0);
  await expect(page.getByRole('option', { name: 'Working', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Saved preset', exact: true }).press('Escape');
  await room(page, 'B102').click();
  await page.getByRole('button', { name: 'Remove FEater', exact: true }).click();
  await source(page, '‹ Back').click();
  expect(await exp()).toBe(0);
  await page.getByPlaceholder('e.g. Gold team').fill('Off');
  await source(page, 'Save new').click();
  const assignments = await page.evaluate(() => localStorage.getItem('baseAssignments_v2'));
  await page.evaluate(() => window.scrollTo(0, 0));
  const headingBefore = await page.locator('.page-header .eyebrow').boundingBox();
  await source(page, 'Rotation').click();
  const dialog = page.getByRole('dialog', { name: 'Rotation', exact: true });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((el: HTMLDialogElement) => el.matches(':modal'))).toBe(true);
  const headingAfter = await page.locator('.page-header .eyebrow').boundingBox();
  expect(Math.abs(headingAfter!.y - headingBefore!.y)).toBeLessThanOrEqual(1);
  await dialog.getByRole('button', { name: 'Add shift', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add shift', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Shift 1 setup', exact: true }).click();
  await dialog.getByRole('option', { name: 'Working', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Shift 2 setup', exact: true }).click();
  await expect(dialog.getByRole('option', { name: 'Choose saved setup', exact: true })).toHaveCount(0);
  await dialog.getByRole('option', { name: 'Off', exact: true }).click();
  const hours = dialog.getByRole('spinbutton', { name: 'Shift 1 hours', exact: true });
  await hours.fill('');
  await expect(hours).toHaveValue('');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('baseRotationPlan_v1')!).shifts[0].hours)).toBe(12);
  await hours.pressSequentially('0.5');
  await expect(hours).toHaveValue('0.5');
  await expect(dialog).toContainText('Repeats every 12.5h');
  await hours.fill('');
  await dialog.getByRole('combobox', { name: 'Rotation start time' }).focus();
  await expect(hours).toHaveValue('0.5');
  await hours.fill('12');
  await dialog.getByRole('combobox', { name: 'Shift 1 setup', exact: true }).click();
  await expect(dialog.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('listbox')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(source(page, 'Rotation')).toBeFocused();
  await page.getByRole('radio', { name: 'Rotation', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Rotation', exact: true })).toBeChecked();
  expect(Math.abs(await exp() - workingExp / 2)).toBeLessThanOrEqual(1);
  await expect(page.getByLabel('Base production summary')).toContainText('Second-cycle average');
  await page.getByRole('radio', { name: 'Rotation', exact: true }).press('ArrowLeft');
  await expect(page.getByRole('radio', { name: 'Current Base', exact: true })).toBeChecked();
  expect(await exp()).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('baseAssignments_v2'))).toBe(assignments);
  await source(page, 'Rotation').click();
  await expect(dialog.getByRole('spinbutton', { name: 'Shift 1 hours' })).toHaveValue('12');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('rotation popup stays contained and readable at narrow widths in both themes', async ({ page }, info) => {
  await seedAccount(page); await begin(page);
  await source(page, 'Presets').click();
  await page.getByPlaceholder('e.g. Gold team').fill('Working');
  await source(page, 'Save new').click();
  for (const theme of ['dark', 'light'] as const) {
    const switcher = page.getByRole('button', { name: theme === 'light' ? 'Switch to light mode' : 'Switch to dark mode', exact: true });
    if (await switcher.count()) await switcher.click();
    await source(page, 'Rotation').click();
    const dialog = page.getByRole('dialog', { name: 'Rotation', exact: true });
    if (theme === 'dark') await dialog.getByRole('button', { name: 'Add shift', exact: true }).click();
    await expect(dialog).toBeVisible();
    const width = info.project.name === 'mobile' ? 320 : 1440;
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => dialog.locator('.account-dialog-body').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
    await page.screenshot({ path: `.cache/base-rotation/${theme}-${info.project.name}-popup.png` });
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
});
