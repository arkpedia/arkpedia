import { expect, test, type Page } from '@playwright/test';
import { setTheme } from './overlay-checks';
import type { SiteUpdate } from '@/lib/site-updates/types';

async function openMenu(page: Page, name: string) {
  const drawer = page.getByRole('button', { name: 'Open navigation menu', exact: true });
  const openingDrawer = await drawer.isVisible() && await drawer.getAttribute('aria-expanded') !== 'true';
  if (openingDrawer) await drawer.click();
  const button = page.getByRole('button', { name, exact: true });
  if (openingDrawer && await button.evaluate(el => el.classList.contains('current'))) {
    await expect(button).toHaveAttribute('aria-expanded', 'true');
  } else if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
  return button;
}

for (const theme of ['dark', 'light'] as const) {
  test(`the Intro and both menus explain the new navigation (${theme})`, async ({ page }) => {
    await page.goto('/intro');
    await setTheme(page, theme);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Plan pulls and try game modes' })).toBeFocused();
    await expect(page.getByRole('img', { name: /Tools menu|expand Tools/ })).toBeVisible();
    const next = page.getByRole('button', { name: 'Next', exact: true });
    const player = page.getByRole('button', { name: 'Expand player', exact: true });
    if (await player.isVisible()) {
      const [action, playerToggle] = await Promise.all([next.boundingBox(), player.boundingBox()]);
      expect(action && playerToggle && action.x < playerToggle.x + playerToggle.width &&
        action.x + action.width > playerToggle.x && action.y < playerToggle.y + playerToggle.height &&
        action.y + action.height > playerToggle.y).toBe(false);
    }
    await next.click();
    await expect(page.getByRole('link', { name: 'Finish Intro', exact: true })).toHaveAttribute('href', '/');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Plan pulls and try game modes' })).toBeVisible();
    await openMenu(page, 'Guides');
    await expect(page.getByRole('link', { name: 'Farming', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Gacha Simulator', exact: true })).toHaveCount(0);
    await openMenu(page, 'Tools');
    const gacha = page.getByRole('link', { name: 'Gacha Simulator', exact: true });
    await expect(gacha).toHaveAttribute('href', '/gacha-simulator');
    await expect(page.getByRole('link', { name: 'Pull Planner', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Game Modes', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Game Modes', exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/intro$/);
    await expect(page.getByRole('heading', { name: 'Intro', exact: true })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await openMenu(page, 'About');
    await expect(page.getByRole('link', { name: 'About Arkpedia', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Intro', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });

  test(`a published major notice shows the right screenshot and remembers dismissal (${theme})`, async ({ page }, info) => {
    const update: SiteUpdate = {
      id: 'tools-and-guides',
      title: 'The Planner menu is now Tools',
      body: 'Game Modes and Gacha Simulator are under Tools.\n\nThe previous Tools menu is now Guides.',
      major: true,
      publishedAt: Date.now() - 1_000,
      images: [
        { src: '/site-updates/tools-menu-desktop.png', alt: 'Desktop navigation example', device: 'desktop' },
        { src: '/site-updates/tools-menu-mobile.png', alt: 'Mobile navigation example', device: 'mobile' },
      ],
    };
    await page.route('**/api/site-updates*', route => route.fulfill({ json: [update] }));
    await page.goto('/game-modes');
    await setTheme(page, theme);
    const notice = page.getByRole('dialog', { name: update.title, exact: true });
    await expect(notice).toBeVisible();
    const image = notice.getByRole('img', { name: info.project.name === 'mobile' ? 'Mobile navigation example' : 'Desktop navigation example' });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(notice.getByRole('link', { name: 'All updates', exact: true })).toBeVisible();
    await notice.getByRole('button', { name: 'Got it', exact: true }).click();
    await expect(notice).toHaveCount(0);
    await Promise.all([page.waitForResponse('**/api/site-updates?latest=1'), page.reload()]);
    await expect(notice).toHaveCount(0);
    await page.goto('/whats-new');
    await expect(page.getByRole('region', { name: 'Published site updates' }).getByRole('heading', { name: update.title })).toBeVisible();
  });
}

test.describe('first visit', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the first visit keeps the unfinished Intro hidden', async ({ page, request }) => {
    await page.goto('/');
    await page.getByRole('region', { name: 'Music playback choice' }).getByRole('button', { name: 'No thanks', exact: true }).click();
    await page.getByRole('region', { name: 'Usage statistics choice' }).getByRole('button', { name: 'No thanks', exact: true }).click();
    await openMenu(page, 'About');
    await expect(page.getByRole('link', { name: 'About Arkpedia', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Welcome to Arkpedia' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Intro', exact: true })).toHaveCount(0);
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBe(true);
    expect(await sitemap.text()).not.toContain('/intro</loc>');
  });
});
