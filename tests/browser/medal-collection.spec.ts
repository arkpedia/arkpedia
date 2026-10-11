import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import type { AccountRecord } from '../../lib/account/accountStore';
import { makeFriendFile } from '../../lib/account/friendFile';

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
// The local UI test checks asset paths without relying on a third-party host. Official
// artwork is separately inspected in the native browser preview.
test.beforeEach(async ({ page }) => { await page.route('**/profile-medals/*.webp', route => route.fulfill({ contentType: 'image/png', body: PIXEL })); });
const catalogue = JSON.parse(fs.readFileSync('public/medal-catalogue.json', 'utf8'));
const pyrite = catalogue.sets.find((s: { name: string }) => s.name.startsWith('Operation Pyrite'));
const wolumonde = catalogue.sets.find((s: { name: string }) => s.name.startsWith('Wolumonde'));
const own: AccountRecord = { version: 1, server: 'en', importedAt: '2026-10-11T00:00:00Z', doctor: 'Medal Doctor', operators: [], skins: [], cleared: [],
  profile: { level: 120, registeredAt: null, secretary: null, bio: 'Medal collection preview',
    medals: [{ id: pyrite.medals[0], x: 0, y: 0 }],
    medalCollection: [...pyrite.medals, wolumonde.medals[0], 'medal_player_lv_01'].map((id: string) => ({ id, obtainedAt: '2026-10-01T00:00:00.000Z' })) } };

for (const scenario of ['empty display', 'missing display', 'omitted panel', 'friend empty display', 'light empty display']) {
  test(`View medals: ${scenario}`, async ({ page }, info) => {
    const account = structuredClone(own);
    if (scenario === 'omitted panel') account.profile!.panels = ['module_sign', 'module_assist', 'module_equip'];
    else if (scenario === 'missing display') delete account.profile!.medals;
    else account.profile!.medals = [];
    await page.addInitScript(({ account, theme }) => {
      localStorage.setItem('arkpediaAccount', JSON.stringify(account));
      localStorage.setItem('theme', theme);
    }, { account, theme: scenario.startsWith('light') ? 'light' : 'dark' });
    if (scenario.startsWith('friend')) {
      await page.goto('/friends');
      await expect(page.getByRole('button', { name: 'Export my account', exact: true })).toBeEnabled();
      await page.getByLabel('Friend account file').setInputFiles({ name: 'friend-medals.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(makeFriendFile(account, {}))) });
      await expect(page.getByRole('status')).toContainText('Imported Medal Doctor');
    } else await page.goto('/account');
    const button = page.getByRole('button', { name: 'View medals' });
    await expect(button).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show medal collection', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (scenario === 'empty display') await page.locator('.account-card').screenshot({ path: `.cache/view-medals-${info.project.name}.png` });
    await button.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Medal Doctor · Medals' });
    await expect(dialog.getByRole('article').filter({ hasText: pyrite.name })).toContainText('✓ Completed');
    await expect(dialog.getByRole('article').filter({ hasText: wolumonde.name })).toContainText('1 / 11 obtained');
    await page.keyboard.press('Escape');
    await expect(button).toBeFocused();
  });
}

for (const theme of ['dark', 'light']) test(`${theme}: sets, completion, full list, categories, keyboard and narrow layout`, async ({ page }, info) => {
  await page.addInitScript(({ own, theme }) => { localStorage.setItem('arkpediaAccount', JSON.stringify(own)); localStorage.setItem('theme', theme); }, { own, theme });
  await page.goto('/account');
  const board = page.getByRole('button', { name: 'Show medal collection', exact: true });
  await board.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Medal Doctor · Medals' });
  const complete = dialog.getByRole('article').filter({ hasText: pyrite.name });
  await expect(complete).toContainText('✓ Completed');
  await expect(complete).toContainText('Oct 1, 2026');
  await expect(dialog.getByRole('article').filter({ hasText: wolumonde.name })).toContainText('1 / 11 obtained');
  await expect(complete.getByRole('img', { name: `${pyrite.name} official background` })).toHaveAttribute('src', pyrite.background);
  const placed = complete.locator('[data-medal-id]').first();
  const position = pyrite.layout.positions.find((p: {id:string}) => p.id === pyrite.medals[0]);
  const native = catalogue.medals.find((m: {id:string}) => m.id === pyrite.medals[0]).size;
  const box = await placed.evaluate(el => ({left: (el as HTMLElement).style.left, top: (el as HTMLElement).style.top, position: getComputedStyle(el).position}));
  expect(parseFloat(box.left)).toBeCloseTo((position.x + native.x) / pyrite.layout.width * 100, 3);
  expect(parseFloat(box.top)).toBeCloseTo((1 - (position.y + native.y) / pyrite.layout.height) * 100, 3);
  expect(box.position).toBe('absolute');
  await expect(placed.locator('img')).toHaveAttribute('src', /profile-medals\/medal_/);
  await expect(dialog.locator('img').first()).toHaveAttribute('loading', 'lazy');
  await page.screenshot({ path: `.cache/medals-${info.project.name}-${theme}-sets.png` });
  await complete.getByRole('button', { name: 'Medal list', exact: true }).click();
  await expect(dialog.getByRole('article')).toHaveCount(10);
  await expect(dialog.getByRole('article').filter({ hasText: 'Unobtained' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Back to sets' }).click();
  await expect(complete).toBeVisible();
  await dialog.getByRole('button', { name: 'Full medal list', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Medal ownership' }).click();
  await dialog.getByRole('option', { name: 'All', exact: true }).click();
  await dialog.getByRole('searchbox', { name: 'Search medals' }).fill("Veteran's Medal");
  await expect(dialog.getByRole('article')).toHaveCount(3);
  await expect(dialog.getByRole('article').filter({ hasText: "Veteran's Medal I" }).first()).toContainText('✓ Obtained');
  await expect(dialog.getByRole('article').filter({ hasText: "Veteran's Medal III" })).toContainText('Unobtained');
  await page.screenshot({ path: `.cache/medals-${info.project.name}-${theme}-list.png` });
  await dialog.getByRole('combobox', { name: 'Medal category' }).click();
  await dialog.getByRole('option', { name: 'Secret Medal', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('No medals match.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(board).toBeFocused();
});

test('friend collection is separate from own account and persists across reloads', async ({ page }) => {
  await page.addInitScript(own => localStorage.setItem('arkpediaAccount', JSON.stringify(own)), own);
  const friend = makeFriendFile({ ...own, doctor: 'Friend Doctor', profile: { ...own.profile!, medals: [{ id: wolumonde.medals[0], x: 0, y: 0 }], medalCollection: wolumonde.medals.map((id: string) => ({ id, obtainedAt: '2020-11-08T00:00:00.000Z' })) } }, {});
  await page.goto('/friends');
  await expect(page.getByRole('button', { name: 'Export my account', exact: true })).toBeEnabled();
  await page.getByLabel('Friend account file').setInputFiles({ name: 'friend-medals.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(friend)) });
  await expect(page.getByRole('status')).toContainText('Imported Friend Doctor');
  await page.getByRole('button', { name: 'Show medal collection', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Friend Doctor · Medals' });
  await expect(dialog.getByRole('article').filter({ hasText: wolumonde.name })).toContainText('✓ Completed');
  await expect(dialog.getByRole('article').filter({ hasText: pyrite.name })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkpediaAccount')!))).toEqual(own);
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'Show medal collection', exact: true }).click();
  await expect(dialog.getByRole('article').filter({ hasText: wolumonde.name })).toContainText('✓ Completed');
});

test('legacy imports show only confirmed displayed medals; catalogue failures can retry', async ({ page }) => {
  await page.addInitScript(own => {
    delete own.profile!.medalCollection;
    localStorage.setItem('arkpediaAccount', JSON.stringify(own));
  }, own);
  let requests = 0;
  await page.route('**/medal-catalogue.json', route => { requests++; return route.fulfill(requests === 1 ? { status: 503, body: '' } : { json: catalogue }); });
  await page.goto('/account');
  await page.getByRole('button', { name: 'Show medal collection', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('could not be loaded');
  await dialog.getByRole('button', { name: 'Try again' }).click();
  await expect(dialog.getByRole('article').filter({ hasText: pyrite.name })).toContainText('1 / 10 obtained');
  await expect(dialog).toContainText('This older import only contains displayed medals');
  await dialog.getByRole('combobox', { name: 'Medal ownership' }).click();
  await expect(dialog.getByRole('option', { name: 'Unobtained', exact: true })).toHaveAttribute('aria-disabled', 'true');
});
