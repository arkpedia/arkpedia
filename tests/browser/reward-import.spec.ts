import { expect, test } from '@playwright/test';
import { accountFromGame } from '../../lib/account/accountStore';
import { readOnly } from './census-routes';

// Synthetic normalized records only. No game login, credentials or account payload capture.
const map = { version: 1 as const, chars: {} };
const record = (counts: [string, number][], at: string) => accountFromGame({ status: { uid: 'reward-fixture', level: 120 },
  shop: { GP: { level: { info: counts.map(([id, count]) => ({ id, count })) } } } }, map, 'en', new Date(at));

for (const theme of ['light', 'dark'] as const) test(`imported and manual reward claims survive reimport and reload (${theme})`, async ({ page }, info) => {
  await readOnly(page);
  const first = record([['GP_freeL_5', 1], ['GP_freeL_10', 0]], '2026-10-16T00:00:00Z');
  await page.addInitScript(({ first, theme }) => {
    localStorage.setItem('theme', theme);
    if (sessionStorage.getItem('reward-fixture-seeded')) return;
    sessionStorage.setItem('reward-fixture-seeded', '1');
    localStorage.setItem('arkpediaAccount', JSON.stringify(first));
    localStorage.setItem('arkpedia.past-rewards.v1', JSON.stringify({ doneKeys: ['free:GP_freeL_10'], doneEvents: [], annihilationDone: false, ticksFrom: '' }));
  }, { first, theme });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const open = async () => {
    await page.getByRole('tab', { name: 'Free rewards', exact: true }).click();
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.locator('summary').filter({ hasText: 'Free level-up packs' }).click();
  };
  await page.goto('/free-op'); await open();
  const pack = (level: number) => page.getByRole('checkbox', { name: `Lv.${level} Enhancement Pack`, exact: true });
  await expect(pack(5)).toBeChecked(); await expect(pack(10)).toBeChecked();
  await expect(pack(15)).not.toBeChecked(); await pack(15).check();
  const second = record([['GP_freeL_5', 0], ['GP_freeL_15', 0]], '2026-10-17T00:00:00Z');
  await page.evaluate(value => {
    localStorage.setItem('arkpediaAccount', JSON.stringify(value)); window.dispatchEvent(new Event('arkpediaAccountChanged'));
  }, second);
  await expect(pack(5)).not.toBeChecked(); await expect(pack(10)).toBeChecked(); await expect(pack(15)).toBeChecked();
  await page.reload(); await open();
  await expect(pack(5)).not.toBeChecked(); await expect(pack(10)).toBeChecked(); await expect(pack(15)).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `test-results/reward-import-${info.project.name}-${theme}.png` });
});
