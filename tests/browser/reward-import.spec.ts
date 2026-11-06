import { expect, test } from '@playwright/test';
import { accountFromGame } from '../../lib/account/accountStore';
import { readOnly } from './census-routes';
import { welcomeMailClaims } from '../../lib/account-import/welcomeMail';

// Synthetic normalized records only. No game login, credentials or account payload capture.
const map = { version: 1 as const, chars: {} };
const record = (counts: [string, number][], at: string) => accountFromGame({ status: { uid: 'reward-fixture', level: 120 },
  shop: { GP: { level: { info: counts.map(([id, count]) => ({ id, count })) } } } }, map, 'en', new Date(at));

for (const theme of ['light', 'dark'] as const) test(`an import's claim records win over manual ticks, both ways, through reimport and reload (${theme})`, async ({ page }, info) => {
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
  await page.goto("/reward-tracker"); await open();
  const pack = (level: number) => page.getByRole('checkbox', { name: `Lv.${level} Enhancement Pack`, exact: true });
  // Lv.10 was ticked by hand, but the save records it as not received: the import unticks it.
  await expect(pack(5)).toBeChecked(); await expect(pack(10)).not.toBeChecked();
  await expect(pack(15)).not.toBeChecked(); await pack(15).check();
  const second = record([['GP_freeL_5', 0], ['GP_freeL_15', 0]], '2026-10-17T00:00:00Z');
  await page.evaluate(value => {
    localStorage.setItem('arkpediaAccount', JSON.stringify(value)); window.dispatchEvent(new Event('arkpediaAccountChanged'));
  }, second);
  // The next import records Lv.5 and Lv.15 as not received: both untick, the hand tick on 15 too.
  await expect(pack(5)).not.toBeChecked(); await expect(pack(10)).not.toBeChecked(); await expect(pack(15)).not.toBeChecked();
  await page.reload(); await open();
  await expect(pack(5)).not.toBeChecked(); await expect(pack(10)).not.toBeChecked(); await expect(pack(15)).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `test-results/reward-import-${info.project.name}-${theme}.png` });
});

test('a beginner reward the save records as received shows claimed and locked; the rest stay manual', async ({ page }) => {
  await readOnly(page);
  const account = accountFromGame({ status: { uid: 'beginner-fixture', level: 30 }, mission: { missions: { OPENSERVER: {
    openserver_1_1: { state: 3, progress: [] }, openserver_2_1: { state: 2, progress: [] } } } } }, map, 'en', new Date('2026-10-16T00:00:00Z'));
  await page.addInitScript(account => {
    if (sessionStorage.getItem('beginner-fixture-seeded')) return;
    sessionStorage.setItem('beginner-fixture-seeded', '1');
    localStorage.setItem('arkpediaAccount', JSON.stringify(account));
  }, account);
  await page.goto("/reward-tracker");
  await page.getByRole('tab', { name: 'Free rewards', exact: true }).click();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.locator('details[open] > summary')).toContainText('Beginner rewards');
  const received = page.getByRole('checkbox', { name: 'Clear Main Storyline 0-1', exact: true });
  const open = page.getByRole('checkbox', { name: 'Player reaches Lv.8', exact: true });
  await expect(received).toBeChecked(); await expect(received).toBeDisabled();
  await expect(page.locator('.free-reward-row').filter({ has: received })).toContainText('Claimed in game');
  await expect(open).not.toBeChecked(); await expect(open).toBeEnabled();
  await expect(page.locator('.free-reward-row').filter({ has: open })).not.toContainText('Claimed in game');
  // "None claimed" leaves the save's row ticked.
  await page.getByRole('button', { name: 'None claimed', exact: true }).click();
  await expect(received).toBeChecked();
});

test('Paradox rewards import from operator handbook stages, and a hand tick on one the save shows unplayed goes', async ({ page }, info) => {
  await readOnly(page);
  const raw = (state: number) => accountFromGame({ status: { uid: 'paradox-fixture' }, troop: { addon: {
    char_009_12fce: { stage: { mem_12fce_1: { state: 3, completeTimes: 1 } } },
    char_225_haak: { stage: { mem_haak_1: { state: 0 } } },
    char_405_absin: { stage: { mem_absin_1: { state } } },
  } } }, map, 'en', new Date(state === 3 ? '2026-10-17T00:00:00Z' : '2026-10-16T00:00:00Z'));
  await page.addInitScript(first => {
    if (sessionStorage.getItem('paradox-fixture-seeded')) return;
    sessionStorage.setItem('paradox-fixture-seeded', '1');
    localStorage.setItem('arkpediaAccount', JSON.stringify(first));
    localStorage.setItem('arkpedia.past-rewards.v1', JSON.stringify({ doneKeys: ['paradox:mem_haak_1'], doneEvents: [], annihilationDone: false, ticksFrom: '' }));
  }, raw(1));
  const open = async () => {
    await page.getByRole('tab', { name: 'Paradox Simulations', exact: true }).click();
    await page.getByRole('button', { name: 'All', exact: true }).click();
  };
  const reward = (name: string) => page.getByRole('checkbox', { name: new RegExp(`^${name} ·`) });
  await page.goto("/reward-tracker"); await open();
  // Aak was ticked by hand, but the save has her simulation unplayed (state 0): the import unticks it.
  await expect(reward('12F')).toBeChecked(); await expect(reward('Aak')).not.toBeChecked(); await expect(reward('Absinthe')).not.toBeChecked();
  await page.evaluate(value => {
    localStorage.setItem('arkpediaAccount', JSON.stringify(value)); window.dispatchEvent(new Event('arkpediaAccountChanged'));
  }, raw(3));
  await expect(reward('Absinthe')).toBeChecked(); await expect(reward('Aak')).not.toBeChecked();
  await page.reload(); await open();
  await expect(reward('12F')).toBeChecked(); await expect(reward('Aak')).not.toBeChecked(); await expect(reward('Absinthe')).toBeChecked();
  await page.screenshot({ path: `test-results/paradox-import-${info.project.name}.png` });
});

test('reported state-one Paradox clears tick only the four completed simulations', async ({ page }, info) => {
  await readOnly(page);
  const first = accountFromGame({ troop: { addon: Object.fromEntries(['mem_skgoat_1', 'mem_crow_1', 'mem_cgbird_1', 'mem_tomimi_1']
    .map((id, index) => [`char_fixture_${index}`, { stage: { [id]: { state: 1, completeTimes: 1 } } }])) } }, map, 'en');
  await page.addInitScript(({ first, theme }) => {
    localStorage.setItem('theme', theme);
    localStorage.setItem('arkpediaAccount', JSON.stringify(first));
  }, { first, theme: info.project.use.colorScheme === 'light' ? 'light' : 'dark' });
  await page.goto('/reward-tracker');
  await page.getByRole('tab', { name: 'Paradox Simulations', exact: true }).click();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  for (const name of ['Earthspirit', 'Jaye', 'La Pluma', 'Minimalist', 'Nightingale', 'Tomimi']) {
    const checkbox = page.getByRole('checkbox', { name: new RegExp(`^${name} ·`) });
    for (let attempt = 0; await checkbox.count() === 0 && attempt < 20; attempt++) {
      await page.locator('.pulls-past-row').last().scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);
    }
    await expect(checkbox).toBeChecked({ checked: !['Jaye', 'Minimalist'].includes(name) });
  }
  await page.screenshot({ path: `test-results/paradox-state-one-${info.project.name}.png` });
});

test('New Doctor mail explains unknown history and imports a retained claim without duplicate currency', async ({ page }, info) => {
  await readOnly(page);
  const snapshot = (claimed: boolean) => accountFromGame(claimed ? { arkpediaMailClaims: welcomeMailClaims([{ subject: 'Orundum resupply for newbie Doctors!', hasItem: 1, state: 1, items: [{ id: '4003', count: 3800 }] }]) } : {}, map, 'en', new Date(claimed ? '2026-11-07T00:00:00Z' : '2026-11-06T00:00:00Z'));
  await page.addInitScript(({ account, theme }) => {
    localStorage.setItem('theme', theme);
    if (sessionStorage.getItem('new-doctor-mail-seeded')) return;
    sessionStorage.setItem('new-doctor-mail-seeded', '1');
    localStorage.setItem('arkpediaAccount', JSON.stringify(account));
  }, { account: snapshot(false), theme: info.project.use.colorScheme === 'light' ? 'light' : 'dark' });
  const open = async () => { await page.getByRole('tab', { name: 'Free rewards', exact: true }).click(); await page.getByRole('button', { name: 'All', exact: true }).click(); };
  await page.goto('/reward-tracker'); await open();
  await page.getByRole('button', { name: 'Needs confirmation', exact: true }).click();
  const mail = page.getByRole('checkbox', { name: /^New Doctor Orundum mail/ });
  await expect(mail).not.toBeChecked(); await expect(mail).toBeEnabled();
  await expect(page.locator('.free-reward-row').filter({ has: mail })).toContainText('excluded from totals');
  const help = page.getByRole('button', { name: 'About New Doctor mail', exact: true });
  await help.focus(); await page.keyboard.press('Enter');
  await expect(page.getByText('The one-time 3,800 Orundum supply sent when you started playing.', { exact: false })).toBeVisible();
  await page.screenshot({ path: `test-results/new-doctor-mail-help-${info.project.name}.png` });
  await page.keyboard.press('Escape'); await expect(help).toBeFocused();
  await page.evaluate(account => { localStorage.setItem('arkpediaAccount', JSON.stringify(account)); window.dispatchEvent(new Event('arkpediaAccountChanged')); }, snapshot(true));
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(mail).toBeChecked(); await expect(mail).toBeDisabled();
  await expect(page.locator('.free-reward-row').filter({ has: mail })).toContainText('Claimed in game');
  await page.reload(); await open();
  await expect(mail).toBeChecked(); await expect(mail).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});
