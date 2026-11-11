import { expect, test } from '@playwright/test';
import { readOnly } from './census-routes';
import { markDocument, sameDocument } from './youtube-stub';

for (const theme of ['dark', 'light']) {
  test(`settings, local profile and history remain accessible without cloud accounts (${theme})`, async ({ page }, info) => {
    await readOnly(page);
    await page.route('**/api/cloud-account', route => route.fulfill({ status: 503, json: { unavailable: true } }));
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.goto('/schedule?past=1');
    await expect(page.getByRole('button', { name: 'Past', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await markDocument(page);
    const bar = page.locator(info.project.name === 'mobile' ? '.mobile-nav-bar' : '.site-nav');
    const settings = bar.getByRole('button', { name: 'Settings', exact: true });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.evaluate(() => window.scrollTo(0, 500));
    const beforeScroll = await page.evaluate(() => window.scrollY);
    await settings.focus(); await page.keyboard.press('Enter');
    const popover = page.getByRole('region', { name: 'Settings', exact: true });
    await expect(popover.getByRole('button', { name: 'Import / export', exact: true })).toBeFocused();
    expect(await popover.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const appearance = popover.getByRole('button', { name: `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode` });
    await expect(appearance).toHaveText(theme === 'dark' ? 'Dark mode' : 'Light mode');
    await popover.getByRole('button', { name: `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode` }).click();
    if (theme === 'dark') await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    else await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light');
    await page.keyboard.press('Escape'); await expect(settings).toBeFocused();
    await settings.click(); await popover.getByRole('button', { name: 'Import / export', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await sameDocument(page)).toBe(true);
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(settings).toBeFocused();
    await expect(page).toHaveURL(/schedule\?past=1$/);
    expect(await page.evaluate(() => window.scrollY)).toBe(beforeScroll);
    await settings.click();
    await popover.getByRole('button', { name: 'Account settings', exact: true }).click();
    const profile = page.getByRole('dialog', { name: 'Account settings', exact: true });
    await expect(profile.getByText('Choose a picture for this browser.', { exact: false })).toBeVisible();
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/profile-${theme}-${info.project.name}.png` });
    await profile.getByRole('searchbox', { name: 'Search profile icons' }).fill('Suzuran - Base');
    await profile.getByRole('button', { name: 'Suzuran - Base', exact: true }).click();
    await expect(profile.getByRole('status')).toHaveText('Profile picture saved in this browser.');
    await page.keyboard.press('Escape');
    await expect(bar.locator('.profile-avatar-trigger img')).toHaveCount(1);
    await page.reload();
    await expect(bar.locator('.profile-avatar-trigger img')).toHaveAttribute('src', /Suzuran/);
    await page.evaluate(() => localStorage.setItem('arkpedia:profile-avatar-v1', 'https://invalid.example/avatar.png'));
    await page.reload();
    await expect(bar.locator('.profile-avatar-trigger img')).toHaveCount(0);
    await bar.locator('.profile-avatar-trigger').click();
    await page.locator('.action-popover').getByRole('link', { name: 'Friends', exact: true }).focus();
    await page.keyboard.press('Shift+Tab');
    await page.locator('.action-popover').getByRole('link', { name: 'Profile', exact: true }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Pull history', exact: true }).click();
    await expect(page.getByRole('tabpanel', { name: 'Pull history', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goBack(); await expect(page.getByRole('tab', { name: 'Profile', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.goForward(); await expect(page.getByRole('tab', { name: 'Pull history', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Operators', exact: true }).click();
    await expect(page.getByRole('tabpanel')).toContainText('Import your Arknights account');
    await page.getByRole('tab', { name: 'Skins', exact: true }).click();
    await expect(page.getByRole('tabpanel')).toContainText('Import your Arknights account');
    await page.evaluate(() => localStorage.setItem('arkpediaAccount', JSON.stringify({ version: 1, server: 'en', importedAt: '2026-10-24T12:00:00Z', doctor: 'Collection fixture', operators: ['Amiya'], skins: [], cleared: [] })));
    await page.reload();
    await page.getByRole('tab', { name: 'Operators', exact: true }).click();
    await expect(page.getByRole('searchbox', { name: 'Search your operators' })).toBeVisible();
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/operators-${theme}-${info.project.name}.png` });
    await page.getByRole('button', { name: /Amiya:.*Open operator preview/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tabpanel', { name: 'Operators', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Skins', exact: true }).click();
    await expect(page.getByRole('tabpanel')).toContainText('No skins match.');
    await page.locator('.page-header-actions').getByRole('button', { name: 'Account settings', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Skins', exact: true })).toHaveAttribute('aria-selected', 'true');
    expect(await sameDocument(page)).toBe(false); // Explicit reload above creates a new document.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('community projects link to the current release and reference pages keep their own navigation', async ({ page }) => {
  await readOnly(page);
  await page.goto('/community/projects');
  await expect(page.locator('a.primary', { hasText: 'Get desktop chibis' })).toHaveAttribute('href', 'https://github.com/arkpedia/arkpedia-desktop-chibis/releases/latest');
  await page.goto('/techniques');
  await expect(page.locator('.page-header .eyebrow')).toHaveText('Rhodes Island // Skill effects');
  await page.goto('/operators');
  await expect(page.locator('.roster-reference')).toHaveCount(0);
});


test('import tools recover from a load failure without leaving the current page', async ({ page }, info) => {
  await readOnly(page);
  let requests = 0;
  await page.route('**/_next/data/*/account.json', route => ++requests === 1 ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.continue());
  await page.goto('/schedule?past=1');
  const bar = page.locator(info.project.name === 'mobile' ? '.mobile-nav-bar' : '.site-nav');
  await bar.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('region', { name: 'Settings', exact: true }).getByRole('button', { name: 'Import / export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import / export', exact: true });
  await expect(dialog.getByRole('alert')).toContainText('could not load');
  await expect(page).toHaveURL(/schedule\?past=1$/);
  await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(dialog.getByPlaceholder('Yostar email')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL(/schedule\?past=1$/);
  await expect(bar.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
});


test('About keeps its width when the unread dot becomes a chevron', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Desktop intrinsic-width regression; drawer headings occupy the full row.');
  await page.addInitScript(() => localStorage.removeItem('arkpedia.changelog.seen'));
  await page.goto('/');
  const about = page.locator('.site-nav').getByRole('button', { name: 'About', exact: true });
  await expect(about.locator('.nav-new-dot')).toHaveCount(1);
  const before = await about.evaluate(element => element.getBoundingClientRect().width);
  if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/about-unread.png`, clip: { x: 0, y: 0, width: 1440, height: 64 } });
  await about.click();
  await page.locator('#site-nav-about').getByRole('link', { name: /What's new/ }).click();
  await expect(about.locator('.nav-new-dot')).toHaveCount(0);
  await expect(about.locator('.site-nav-chev')).toHaveCount(1);
  expect(await about.evaluate(element => element.getBoundingClientRect().width)).toBeCloseTo(before, 1);
});
