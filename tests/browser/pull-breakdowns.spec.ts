import { expect, test, type Locator } from '@playwright/test';

async function fits(dialog: Locator) {
  const overflow = await dialog.evaluate(root => [...root.querySelectorAll<HTMLElement>('*'), root as HTMLElement]
    .filter(el => el.clientWidth > 0 && getComputedStyle(el).position !== 'absolute')
    .filter(el => !el.closest('thead') || getComputedStyle(el.closest('thead')!).position !== 'absolute')
    .filter(el => el.scrollWidth > el.clientWidth + 1)
    .map(el => `${el.tagName}.${el.className}: ${el.scrollWidth}/${el.clientWidth}`));
  expect(overflow, 'all dialog content fits without horizontal scrolling').toEqual([]);
}

for (const theme of ['dark', 'light']) {
  test(`banner breakdown reconciles and income fits in ${theme}`, async ({ page }, info) => {
    test.setTimeout(90_000);
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.goto('/pull-planner');
    await expect(page.getByRole('heading', { name: 'Pull Planner' })).toBeVisible();
    const data = JSON.parse((await page.locator('#__NEXT_DATA__').textContent())!);
    const banners = (data.props.pageProps.scheduledBanners as { name: string; end: string; endAt?: string; freeTicket: number }[])
      .filter(b => Date.parse(b.endAt ?? `${b.end}T23:59:59Z`) > Date.now())
      .sort((a, b) => a.end.localeCompare(b.end));
    const later = banners.find((b, i) => i > 0 && b.freeTicket > 0)!;
    expect(later, 'a later banner with exclusive pulls').toBeTruthy();
    const earlier = banners[0];
    const plan = {
      version: 1, orundum: '60000', originite: '60', permits: '10', reservedOP: '18', until: banners.at(-1)!.end,
      manualEventDate: '', bannerName: '', monthlyCard: true, includeBacklog: false, annihilationDone: false,
      doneEvents: [], doneKeys: [], clearedReruns: [], future: {},
      goals: [earlier, later].map(b => ({ banner: b.name, spendOn: b.end, bannerEndAt: b.endAt, pulls: 40 })),
    };
    await page.evaluate(plan => localStorage.setItem('arkpedia.pull-plan.v1', JSON.stringify(plan)), plan);
    await page.reload();
    const row = page.locator('article').filter({ has: page.getByRole('button', { name: `Edit ${later.name}`, exact: true }) });
    await row.getByRole('button', { name: `Edit ${later.name}`, exact: true }).click();
    await expect(row.getByText('Banner free pulls', { exact: false })).toHaveCount(0);
    await expect(row.getByText('From savings', { exact: false })).toHaveCount(0);
    await expect(row.getByText(/^\d+ Banner free$/)).toBeVisible();
    const available = row.getByRole('button', { name: /available pulls.*show breakdown/ });
    const total = Number(await available.innerText());
    await available.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Available pulls', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(later.name, { exact: true })).toBeVisible();
    const values = await dialog.locator('tbody tr td:last-child').allTextContents();
    const numbers = values.map(value => Number(value.replace(/,/g, '').replace('−', '-')));
    expect(numbers.at(-1)).toBe(total);
    expect(numbers.slice(0, -1).reduce((a, b) => a + b, 0)).toBe(total);
    expect(numbers[4], 'earlier paid budgets are deducted').toBeLessThan(0);
    expect(numbers[5], 'exclusive free pulls are included once').toBeGreaterThan(0);
    expect(numbers[3], 'skin reservation is included').toBeLessThan(0);
    const widths = info.project.name === 'mobile' ? [320, 390, 412] : [820, 1024, 1440];
    for (const width of widths) {
      await page.setViewportSize({ width, height: info.project.name === 'mobile' ? 844 : 1000 });
      await fits(dialog);
    }
    await page.screenshot({ path: info.outputPath(`available-${theme}.png`), scale: 'css' });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(available).toBeFocused();
    await page.locator('#tab-income').click();
    const income = page.getByRole('dialog', { name: 'Income', exact: true });
    await expect(income.locator('#forecast-date')).toHaveValue(plan.until);
    await expect(income.getByRole('rowheader', { name: 'Monthly card', exact: true })).toBeVisible();
    await expect(income.locator('.pulls-report-amounts').first()).toBeVisible();
    for (const width of widths) {
      await page.setViewportSize({ width, height: info.project.name === 'mobile' ? 844 : 1000 });
      await fits(income);
    }
    await page.screenshot({ path: info.outputPath(`income-${theme}.png`), scale: 'css' });
    await income.locator('.pulls-report-sum').last().scrollIntoViewIfNeeded();
    await expect(income.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
    await income.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('#tab-income')).toBeFocused();
  });
}
