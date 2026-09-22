import { expect, test } from '@playwright/test';

test('module stages keep the trait and only the latest talent upgrade', async ({ page }) => {
  const rawRequests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).hostname === 'raw.githubusercontent.com') rawRequests.push(request.url()); });
  await page.goto('/operators/Botani#modules');
  const section = page.locator('#operator-modules');
  const detail = section.locator('.op-module-stage-detail');
  await section.getByRole('button', { name: 'Module stage 2', exact: true }).click();
  await expect(detail).toContainText('Elemental Injury dealt to Elite and Leader enemies increases by 18%');
  await expect(detail).toContainText('Maximum 3 stacks');
  await section.getByRole('button', { name: 'Module stage 3', exact: true }).click();
  await expect(detail).toContainText('Elemental Injury dealt to Elite and Leader enemies increases by 18%');
  await expect(detail).toContainText('Maximum 4 stacks');
  await expect(detail).not.toContainText('Maximum 3 stacks');
  await section.getByRole('button', { name: 'Module stage 1', exact: true }).click();
  await expect(detail).not.toContainText('Maximum 4 stacks');

  await page.goto('/operators/Angelina#modules');
  await section.getByRole('button', { name: 'ISW-α', exact: true }).click();
  await section.getByRole('button', { name: 'Module stage 3', exact: true }).click();
  await expect(detail).toContainText('Weight -1');
  await expect(detail).toContainText('60%');
  await expect(detail).not.toContainText('40%');
  await page.screenshot({ path: test.info().outputPath('module-stage-3.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(rawRequests.filter(url => !new URL(url).pathname.startsWith('/arkpedia/'))).toEqual([]);
});
