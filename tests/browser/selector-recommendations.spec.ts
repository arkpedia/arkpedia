import { expect, test } from '@playwright/test';
import { makeFriendFile } from '../../lib/account/friendFile';
import type { AccountRecord } from '../../lib/account/accountStore';

test('all ticket pools show signed, colored ratings and preserve the nested operator popup', async ({ page }) => {
  await page.goto('/selector-tickets');
  await expect(page.getByText('Kukkikaze ratings are pending.', { exact: false })).toHaveCount(0);
  await expect(page.locator('.selector-card img')).toHaveCount(3);
  for (const [ticket, count] of [
    ['Special Event Transfer Permit', 8],
    ['2026 Celebration Operator Permit', 35],
    ['Top Operator Transfer Permit - Kernel', 48],
  ] as const) {
    const trigger = page.getByRole('button', { name: `${ticket}: selectable operators`, exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: ticket, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.selector-score')).toHaveCount(count);
    for (const text of await dialog.locator('.selector-score').allTextContents()) expect(text).toMatch(/^(?:[+-]\d+(?:\.\d+)?|0)$/);
    if (ticket === '2026 Celebration Operator Permit') {
      const ines = dialog.getByRole('button', { name: /^Ines: operator preview/ });
      await expect(ines.locator('.selector-score-middle')).toHaveText('+4.5');
      await expect(ines).toHaveAttribute('title', /Invisibility reveal talent: \+0\.5/);
    }
    if (ticket.includes('Kernel')) {
      const siege = dialog.getByRole('button', { name: /^Siege: operator preview/ });
      await expect(siege.locator('.selector-score-negative')).toHaveText('-2');
      await expect(dialog.getByRole('button', { name: /^Ceobe: operator preview/ }).locator('.selector-score-middle')).toHaveText('+1.75');
      await expect(dialog.getByRole('button', { name: /^Saria: operator preview/ }).locator('.selector-score-middle')).toHaveText('+3');
      const silverAsh = dialog.getByRole('button', { name: /^SilverAsh: operator preview/ });
      await expect(silverAsh.locator('.selector-score-middle')).toHaveText('+2.5');
      await expect(silverAsh).toHaveAttribute('title', /Invisibility reveal talent: \+0\.5/);
      await siege.click();
      await expect(page.getByRole('dialog', { name: 'Siege', exact: true })).toBeVisible();
      await expect(page).toHaveURL(/\/selector-tickets$/);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeVisible();
      await expect(siege).toBeFocused();
    }
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('imported own roster changes coverage scores while friend ownership stays separate', async ({ page }) => {
  const own: AccountRecord = { version: 1, server: 'en', importedAt: '2026-10-10T00:00:00Z', doctor: 'My Doctor', operators: [], skins: [], cleared: [] };
  const friend = makeFriendFile({ ...own, doctor: 'Friend Doctor', operators: ['Ceobe'] }, {}, new Date('2026-10-10T00:00:00Z'));
  await page.addInitScript(({ own, friend }) => {
    localStorage.setItem('arkpediaAccount', JSON.stringify(own));
    localStorage.setItem('arkpediaFriend', JSON.stringify(friend));
  }, { own, friend });
  await page.goto('/selector-tickets');
  await expect(page.getByText(/Using My Doctor/)).toBeVisible();
  await page.getByRole('button', { name: 'Top Operator Transfer Permit - Kernel: selectable operators', exact: true }).click();
  const ceobe = page.getByRole('button', { name: /^Ceobe: operator preview/ });
  await expect(ceobe.locator('.selector-score')).toHaveText('+2.75');
  await expect(ceobe).not.toContainText('Owned');
  await expect(ceobe).toHaveAttribute('title', /Arts coverage: 3 or fewer owned 6★ Casters \/ Supporters/);
});

test('four owned Casters and Supporters combined block the Arts coverage bonus', async ({ page }) => {
  const own: AccountRecord = { version: 1, server: 'en', importedAt: '2026-10-12T00:00:00Z', doctor: 'Mixed roster', operators: ['Eyjafjalla', 'Ifrit', 'Angelina', 'Suzuran'], skins: [], cleared: [] };
  await page.addInitScript(own => localStorage.setItem('arkpediaAccount', JSON.stringify(own)), own);
  await page.goto('/selector-tickets');
  await page.getByRole('button', { name: 'Top Operator Transfer Permit - Kernel: selectable operators', exact: true }).click();
  const ceobe = page.getByRole('button', { name: /^Ceobe: operator preview/ });
  await expect(ceobe.locator('.selector-score')).toHaveText('+1.75');
  await expect(ceobe).not.toHaveAttribute('title', /Arts coverage/);
});
