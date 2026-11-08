import { expect, test } from '@playwright/test';

test('Limited navigation groups crossover banners while historical links retain crossover rules', async ({ page }, info) => {
  await page.goto("/gacha-simulator?banner=" + encodeURIComponent('[Crossover] Attack, Defence, Tactical Collide'));
  await expect(page.getByText('Crossover guarantee (120)', { exact: true })).toBeVisible();
  await expect(page.locator('.gacha-main-col').getByText('Limited guarantee', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Pull ten operators', exact: true }).click();
  await expect(page.locator('.gacha-main-col')).toContainText('10');
  if (info.project.name === 'mobile') {
    const category = page.getByRole('combobox', { name: 'Banner category' });
    await category.click();
    await expect(page.getByRole('option', { name: 'Crossover', exact: true })).toHaveCount(0);
    await page.getByRole('option', { name: 'Limited', exact: true }).click();
  } else {
    await expect(page.getByRole('button', { name: 'Crossover', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Limited', exact: true }).click();
  }
  await expect(page.getByRole('region', { name: 'Banners' })).toBeVisible();
  await page.goto("/gacha-simulator?banner=" + encodeURIComponent('[Celebration] Sealed With Time'));
  await expect(page.locator('.gacha-main-col').getByText('Limited guarantee', { exact: true })).toBeVisible();
  await page.goto("/gacha-simulator?banner=" + encodeURIComponent('[Crossover] Attack, Defence, Tactical Collide'));
  await expect(page.getByText('Crossover guarantee (120)', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Crossover guarantee (120)', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/gacha-limited-${info.project.name}.png`, fullPage: false });
});


test('datamined current pools and Orienteering forecasts keep distinct labels', async ({ page }) => {
  await page.goto("/gacha-simulator?banner=" + encodeURIComponent('Standard Pool #178 (Global)'));
  await expect(page.locator('.gacha-main-col')).toContainText('Datamined Global · 2026/10/23–2026/11/06');
  await expect(page.locator('.gacha-main-col')).toContainText('Ines');
  await expect(page.locator('.gacha-main-col')).toContainText('Zuo Le');
  // A pending Orienteering in the pinned data (tests/browser/data-pin.json): its Global date is
  // never labelled datamined, and its lineup awaits confirmation.
  await page.goto("/gacha-simulator?banner=" + encodeURIComponent('Orienteering #8'));
  await expect(page.getByText('Awaiting Global lineup confirmation.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pull one operator', exact: true })).toBeDisabled();
  await expect(page.locator('.gacha-main-col')).not.toContainText('Datamined');
});

test('banner guides explain both selection milestones and the other special formats', async ({ page }, info) => {
  await page.addInitScript((theme) => {
    localStorage.setItem('theme', theme);
    localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({
      version: 1, savedAt: Date.now(), analytics: false, externalMedia: false, analyticsChosen: true, externalMediaChosen: true,
    }));
  }, info.project.name === 'mobile' ? 'light' : 'dark');
  const guides = [
    ['Standard Pool #178 (Global)', 'Standard Selection counts every pull'],
    ['Kernel #63 (Global)', 'Kernel Selection counts every pull'],
    ['The Front That Was #4', 'featured trio shares 45%'],
    ['[Crossover] Attack, Defence, Tactical Collide', 'within 120 pulls, once on this banner'],
  ];
  for (const [name, rule] of guides) {
    await page.goto('/gacha-simulator?banner=' + encodeURIComponent(name));
    await page.getByRole('button', { name: 'How does this work?', exact: true }).click();
    const guide = page.locator('.gacha-guide-modal');
    await guide.getByRole('button', { name: 'Yes', exact: true }).click();
    await expect(guide).toContainText(rule);
    if (rule.includes('Selection')) {
      await expect(guide).toContainText('After 300 total pulls, your next 6★ is the other one');
      await expect(guide).toContainText('resets when this banner ends');
      await guide.screenshot({ path: info.outputPath(name + '.png') });
    }
    await guide.getByRole('button', { name: /Next/ }).click();
    await expect(guide.locator('.gacha-tutorial-progress')).toContainText('2 /');
    await guide.getByRole('button', { name: /Previous/ }).click();
    await expect(guide).toContainText(rule);
  }
});
