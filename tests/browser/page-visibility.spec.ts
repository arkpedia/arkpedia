import { expect, test } from '@playwright/test';
import { managedPages, publicPageVisibility, type PageVisibilitySetting } from '../../lib/page-visibility/settings';

const { href, title } = managedPages.ccb;

test('unlisted CCB opens by direct link and stays out of the sitemap', async ({ page }) => {
  await page.goto(href);
  await expect(page.getByRole('heading', { level: 1, name: 'Contingency Contract', exact: true })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  const sitemap = await page.request.get('/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  const xml = await sitemap.text();
  expect(xml).toContain('/about</loc>');
  expect(xml).not.toContain(href);
  expect((await page.request.get('/api/dashboard/page-visibility')).status()).toBe(403);
  expect((await page.request.put('/api/dashboard/page-visibility', { data: { id: 'ccb' } })).status()).toBe(403);
});

test('admin can schedule a page to appear and disappear from public discovery', async ({ page }, info) => {
  const start = Date.UTC(2026, 11, 1, 16);
  let serverTime = start;
  let setting: PageVisibilitySetting = { id: 'ccb', mode: 'unlisted', showAt: null, hideAt: null, revision: 0 };
  await page.addInitScript(theme => localStorage.setItem('theme', theme), info.project.name === 'mobile' ? 'light' : 'dark');
  await page.clock.install({ time: start });
  await page.route('**/api/page-visibility', route => route.fulfill({ json: publicPageVisibility([setting], serverTime) }));
  await page.route('**/_next/data/**/dashboard/campaigns.json*', route => route.fulfill({ json: { pageProps: { catalog: null }, __N_SSP: true } }));
  await page.route('**/api/dashboard/page-visibility', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [setting] });
    const draft: PageVisibilitySetting = route.request().postDataJSON();
    expect(draft.revision).toBe(setting.revision);
    setting = { ...draft, revision: draft.revision + 1 };
    return route.fulfill({ json: setting });
  });
  await page.goto('/game-modes', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { next: { router: { push: (url: string) => Promise<void> } } })
    .next.router.push('/dashboard/campaigns?tab=visibility'));
  const editor = page.getByRole('form', { name: title });
  const save = editor.getByRole('button', { name: 'Save visibility' });
  const chooseListing = async (name: string) => {
    await editor.getByRole('combobox', { name: 'Listing' }).click();
    await page.getByRole('option', { name, exact: true }).click();
  };
  await expect(editor.getByText('Unlisted now', { exact: true })).toBeVisible();
  await chooseListing('Listed');
  await save.click();
  await expect(editor.getByText('Listed now', { exact: true })).toBeVisible();
  await chooseListing('Unlisted');
  await save.click();
  await expect(editor.getByText('Unlisted now', { exact: true })).toBeVisible();
  await chooseListing('Scheduled');
  await expect(save).toBeDisabled();
  await editor.getByLabel('Show at (UTC)').fill('2026-12-01T16:01');
  await editor.getByLabel('Hide at (UTC)').fill('2026-12-01T16:00');
  await expect(save).toBeDisabled();
  await editor.getByLabel('Hide at (UTC)').fill('2026-12-01T16:02');
  await save.click();
  await expect(editor.getByRole('status')).toHaveText('Page visibility saved.');
  expect(setting.showAt).toBe(start + 60_000);
  expect(setting.hideAt).toBe(start + 120_000);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

  const firstRead = page.waitForResponse('**/api/page-visibility');
  await page.goto('/game-modes', { waitUntil: 'domcontentloaded' });
  await firstRead;
  const link = page.getByRole('link', { name: new RegExp(title) });
  await expect(link).toHaveCount(0);
  serverTime = start + 60_000;
  await page.clock.fastForward(60_000);
  await expect(link).toBeVisible();

  await page.goto('/whats-new', { waitUntil: 'domcontentloaded' });
  await expect(link).toBeVisible();
  await page.goto('/search', { waitUntil: 'domcontentloaded' });
  await page.getByRole('main').getByRole('searchbox', { name: 'Search Arkpedia' }).fill('CCB');
  await expect(link).toBeVisible();

  serverTime = start + 120_000;
  await page.clock.fastForward(60_000);
  await expect(link).toHaveCount(0);
  await page.goto('/game-modes', { waitUntil: 'domcontentloaded' });
  await expect(link).toHaveCount(0);
});
