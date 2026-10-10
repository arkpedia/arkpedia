import { expect, test, type Page } from '@playwright/test';
import { buildSheetCase, sheetCases } from '../../scripts/tests/helpers/baseCombinationCases';
import type { BaseCalculationInput } from '../../lib/base/calculateBase';
import type { ProductionSpots } from '../../lib/base/baseTypes';

const scenario = (id: string) => buildSheetCase(sheetCases.find(c => c.id === id)!).input;
async function seed(page: Page, input: BaseCalculationInput) {
  const productionSpots = Object.fromEntries(input.facilities.filter(f => f.id.startsWith('prod')).map(f => [f.id, f.kind])) as ProductionSpots;
  const facilityLevels = Object.fromEntries(input.facilities.map(f => [f.id, f.level]));
  await page.addInitScript(({ productionSpots, facilityLevels, assignments, factoryProducts }) => {
    localStorage.setItem('baseSetup_v2', JSON.stringify({ productionSpots, facilityLevels, setupComplete: true }));
    localStorage.setItem('baseAssignments_v2', JSON.stringify(assignments));
    localStorage.setItem('baseFactoryProducts_v1', JSON.stringify(factoryProducts));
  }, { productionSpots, facilityLevels, assignments: input.assignments, factoryProducts: input.factoryProducts });
  await page.goto('/base');
}

test('worksheet Worldly Plight reaches the rendered TP and Factory together', async ({ page }) => {
  const input = scenario('Advanced:24');
  input.assignments.prod1 = [{ operatorName: 'Jieyun', eliteLevel: 'Elite 2' }];
  await seed(page, input);
  await expect(page.locator('.base-extra-resources-panel')).toContainText('Worldly Plight 80');
  await expect(page.locator('.base-extra-resources-panel')).toContainText('Witchcraft Crystal 16');
  await expect(page.getByRole('button', { name: /^B101 Factory/ })).toContainText('133% efficiency');
  await expect(page.getByRole('button', { name: /^B202 Trading Post/ })).toContainText('218% efficiency');
});

test('worksheet Degenbrecher Jaye Gnosis ordering is visible in the page breakdown', async ({ page }) => {
  await seed(page, scenario('TP:30'));
  const room = page.getByRole('button', { name: /^B202 Trading Post/ });
  await expect(room).toContainText('224% efficiency');
  await room.click();
  await page.getByRole('button', { name: 'Calculation', exact: true }).click();
  await expect(page.locator('.base-breakdown-panel')).toContainText('121.00%');
  await expect(page.locator('.base-breakdown-panel')).toContainText('Degenbrecher');
  await expect(page.locator('.base-breakdown-panel')).toContainText("Champion's Bearing");
  await expect(page.locator('.base-breakdown-panel')).toContainText('Jaye');
  expect((await page.locator('.base-breakdown-lines').boundingBox())!.height).toBeGreaterThan(100);
  await page.locator('.base-breakdown-final').scrollIntoViewIfNeeded();
  await expect(page.locator('.base-breakdown-final')).toBeInViewport();
});

test('rendered empty Trading Post never creates output from CC support', async ({ page }) => {
  const input = scenario('TP:17');
  input.assignments.prod5 = [];
  await seed(page, input);
  await expect(page.getByLabel('Daily production estimates')).toContainText('0 LMD / day');
});
