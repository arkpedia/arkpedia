import { expect, test } from '@playwright/test';

for (const route of ['/recruitment', '/recruitment/popout']) {
  test(`recruitment operator previews preserve tags, focus and route on ${route}`, async ({ page }) => {
    const requests: string[] = [];
    page.on('request', request => { if (request.url().includes('/api/gacha-operator/')) requests.push(request.url()); });
    await page.goto(route);
    await page.getByRole('button', { name: 'Robot', exact: true }).click();
    const opener = page.getByRole('button', { name: 'View Lancet-2 details', exact: true });
    await expect(opener).toBeVisible();
    expect(requests).toEqual([]);
    const url = page.url();
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Lancet-2', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /^Stats/ })).toBeVisible();
    await expect(dialog.getByRole('img', { name: 'Lancet-2 base artwork' })).toHaveAttribute('src', /one-star-skins\/Lancet-2/);
    await expect(dialog.getByRole('img', { name: 'Lancet-2 base artwork' })).toHaveAttribute('loading', 'lazy');
    await expect(dialog.getByRole('link', { name: 'View operator page ↗' })).toHaveAttribute('href', '/operators/Lancet-2');
    expect(requests).toHaveLength(1);
    expect(page.url()).toBe(url);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
    await expect(page.getByRole('button', { name: 'Robot', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Close operator preview' }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole('button', { name: 'Clear tags', exact: true }).click();
    await page.getByRole('button', { name: 'Top Operator', exact: true }).click();
    await page.getByRole('button', { name: 'View Exusiai details', exact: true }).click();
    const sixStar = page.getByRole('dialog', { name: 'Exusiai', exact: true });
    await expect(sixStar.getByRole('heading', { name: /^Skills$/ })).toBeVisible();
    await expect(sixStar.getByRole('img', { name: 'Exusiai base artwork' })).toHaveAttribute('src', /six-star-skins\/Exusiai/);
    await page.keyboard.press('Escape');
    await expect(sixStar).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('the operator preview belongs to the recruitment always-on-top document', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'always-on-top is a desktop feature');
  await page.addInitScript(() => {
    Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: {
      requestWindow: async () => window.open('about:blank', 'recruitment-pip-fixture', 'popup,width=480,height=760'), window: null,
    } });
  });
  await page.goto('/recruitment');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'On top', exact: true }).click();
  const popup = await popupPromise;
  await popup.getByRole('button', { name: 'Robot', exact: true }).click();
  const opener = popup.getByRole('button', { name: 'View Lancet-2 details', exact: true });
  await opener.click();
  const dialog = popup.getByRole('dialog', { name: 'Lancet-2', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await popup.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await popup.close();
});
