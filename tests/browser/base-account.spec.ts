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
const room = (page: Page, prefix = 'B101') => page.getByRole('button', { name: new RegExp(`^${prefix} `) });
const source = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

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
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
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
  await source(page, 'Presets').click();
  await page.getByPlaceholder('e.g. Gold team').fill('Working');
  await source(page, 'Save new').click();
  await page.getByRole('button', { name: /^Dorm 1 Dormitory/ }).click();
  await page.getByPlaceholder('Search operators...').fill('SilverAsh');
  await page.locator('.base-room-card', { hasText: 'SilverAsh' }).click();
  await page.getByLabel('SilverAsh current Morale').fill('6');
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
