import { expect, test } from '@playwright/test';

const outfit = 'Upcoming Operators/Outfits - Monster Hunter Collab 2 | Arknights 近日実装 オペレーター';
const bgm = 'Stronghold Protocol: Regulation Mix | Arknights 坚守协议 BGM集';
const voice = 'Closure Stronghold Protocol JP Voice Lines | Arknights 坚守协议 クロージャボイス集';
const guide = 'Stronghold Protocol Regulation AFK Guide | Arknights';
const titles = [outfit, bgm, voice, guide, 'Arknights: a very surprising day'];
const videos = titles.map((title, index) => ({
  videoId: String(index + 1).repeat(11), title, channelLabel: 'RiverV Workshop',
  publishedAt: '2026-11-08T12:00:00Z', thumbnail: '/essential-icons/M3.webp',
  url: `https://www.youtube.com/watch?v=${String(index + 1).repeat(11)}`,
  isLivestream: false, liveStatus: 'none',
}));

for (const theme of ['dark', 'light']) {
  test(`World automatically groups upcoming outfits and Stronghold audio (${theme})`, async ({ page }, info) => {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.route('**/_next/data/**/world.json*', async route => {
      const response = await route.fetch();
      // Middleware/prefetch redirects can have no JSON body. Preserve those
      // responses; only actual page data receives the video fixture.
      const text = await response.text();
      if (!text.trim().startsWith('{')) { await route.fulfill({ response }); return; }
      const data = JSON.parse(text);
      if (data.pageProps) data.pageProps.videos = videos;
      await route.fulfill({ response, json: data });
    });
    await page.goto('/');
    await page.evaluate(() => (window as unknown as { next: { router: { push: (path: string) => Promise<void> } } }).next.router.push('/world?section=youtube'));
    const skins = page.getByRole('region', { name: 'Skin showcases', exact: true });
    const media = page.getByRole('region', { name: 'Music & media', exact: true });
    const other = page.getByRole('region', { name: 'Other', exact: true });
    await expect(skins.getByRole('link', { name: outfit, exact: false })).toBeVisible();
    for (const title of [bgm, voice]) await expect(media.getByRole('link', { name: title, exact: false })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Guides & clears', exact: true }).getByRole('link', { name: guide, exact: false })).toBeVisible();
    await expect(other.locator('.video-card')).toHaveCount(1);
    for (const title of [outfit, bgm, voice]) await expect(other.getByText(title)).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Video category', exact: true }).click();
    await page.getByRole('option', { name: 'Music & media (2)', exact: true }).click();
    await expect(media.locator('.video-card')).toHaveCount(2);
    await expect(skins).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
