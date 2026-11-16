import { expect, test } from '@playwright/test';

const account = (at: string, expiry: string | null, permits = 4, eventPermits?: Record<string, number>, doctor = 'Forecast test') => ({
  version: 1, server: 'en', importedAt: at, doctor, ...(eventPermits ? { eventPermits } : {}), operators: [], skins: [], cleared: [],
  wallet: { orundum: 153320, originitePrime: 394, permits, yellowCerts: 109, monthlyCardUntil: expiry },
});

for (const theme of ['dark', 'light']) {
  test(`forecast settings survive inventory refreshes (${theme})`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-15T18:12:00Z') });
    await page.addInitScript(({ initial, theme }) => {
      if (!localStorage.getItem('forecast-test-seeded')) {
        localStorage.setItem('arkpediaAccount', JSON.stringify(initial));
        localStorage.setItem('theme', theme);
        localStorage.setItem('forecast-test-seeded', '1');
      }
    }, { initial: account('2026-11-15T18:10:00Z', '2026-12-20T12:00:00Z'), theme });
    await page.goto('/pull-planner');
    const card = page.getByRole('checkbox', { name: 'Monthly card', exact: true });
    await expect(card).toBeChecked();
    await card.uncheck();
    const refresh = async (next: ReturnType<typeof account>) => {
      await page.evaluate(value => {
        localStorage.setItem('arkpediaAccount', JSON.stringify(value));
        window.dispatchEvent(new Event('arkpediaAccountChanged'));
      }, next);
    };
    await refresh(account('2026-11-15T18:11:00Z', '2026-12-20T12:00:00Z'));
    await expect(card).not.toBeChecked();
    await card.check();
    await refresh(account('2026-11-15T18:12:00Z', null));
    await expect(card).toBeChecked();
    await refresh(account('2026-11-15T18:13:00Z', '2026-12-20T12:00:00Z'));
    await page.getByRole('button', { name: 'Income', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Income', exact: true });
    await expect(dialog.getByText(/Renewals follow the imported expiry/)).toBeVisible();
    const permits = dialog.getByRole('spinbutton', { name: /Collected permits .*The Masses/ });
    await expect(permits).toBeVisible();
    const total = page.getByRole('region', { name: 'Pull calculation' }).locator('div').filter({ has: page.locator('dt', { hasText: 'Before spending' }) }).locator('dd');
    const before = await total.textContent();
    await refresh(account('2026-11-15T18:13:30Z', '2026-12-20T12:00:00Z', 5, { act42sre: 1 }));
    await expect(permits).toHaveValue('1');
    await expect(total).toHaveText(before!);
    await refresh(account('2026-11-15T18:14:00Z', '2026-12-20T12:00:00Z', 7, { act42sre: 3 }));
    await expect(permits).toHaveValue('3');
    await expect(dialog.getByText(/imported purchases/)).toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('arkpedia.pull-plan.v1')!).collectedEventPermits.act42sre)).toBe(3);
    await refresh(account('2026-11-15T18:15:00Z', '2026-12-20T12:00:00Z', 7));
    await expect(total).toHaveText(before!);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('arkpedia.pull-plan.v1')!).monthlyCardUntil)).toBe('2026-12-20T12:00:00Z');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Income', exact: true })).toBeFocused();
    await page.reload();
    await expect(card).toBeChecked();
    await page.getByRole('button', { name: 'Income', exact: true }).click();
    await expect(page.getByRole('spinbutton', { name: /Collected permits .*The Masses/ })).toHaveValue('3');
    await refresh(account('2026-11-15T18:16:00Z', null, 4, undefined, 'Another Doctor'));
    await expect(permits).toHaveValue('0');
  });
}
