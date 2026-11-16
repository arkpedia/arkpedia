import { expect, test } from '@playwright/test';

const outfit = 'Upcoming Operators/Outfits - Monster Hunter Collab 2 | Arknights 近日実装 オペレーター';
const bgm = 'Stronghold Protocol: Regulation Mix | Arknights 坚守协议 BGM集';
const voice = 'Closure Stronghold Protocol JP Voice Lines | Arknights 坚守协议 クロージャボイス集';
const guide = 'Stronghold Protocol Regulation AFK Guide | Arknights';
const operator = 'Should You Get and Build Orchid alter? | Orchid alter Review [Arknights]';
const showcase = 'Violet Mizutsune Orchid, Zinogre S Catapult, Rhodes Island Recon [Arknights]';
const trailer = 'Arknights Official Trailer - Thunder in the Azure Dream';
const teaser = 'Arknights Official Teaser Trailer - Thunder in the Azure Dream';
const tracker = 'New Arknights Players Can Get 700 FREE PULLS (and counting) | Arkpedia';
const rng = 'The Absolute Limit of Arknights RNG';
const clear = 'MT-8 3 operators | Arknights';
const pulls = 'Talulah and Tocka Pulls!! [Arknights]';
const titles = [outfit, bgm, voice, guide, 'Arknights: a very surprising day', operator, showcase, trailer, teaser, tracker, rng, clear, pulls];
const videos = titles.map((title, index) => ({
  videoId: String(index + 1).padStart(11, '0'), title, channelLabel: 'RiverV Workshop',
  publishedAt: '2026-11-08T12:00:00Z', thumbnail: '/essential-icons/M3.webp',
  url: `https://www.youtube.com/watch?v=${String(index + 1).padStart(11, '0')}`,
  isLivestream: false, liveStatus: 'none',
  ...(title === showcase ? { classifiedTopic: 'operators' } : {}),
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
    for (const title of [bgm, voice, trailer, teaser]) await expect(media.getByRole('link', { name: title, exact: false })).toBeVisible();
    for (const title of [operator, showcase]) await expect(page.getByRole('region', { name: 'Operator analyses', exact: true }).getByRole('link', { name: title, exact: false })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Guides', exact: true }).getByRole('link', { name: guide, exact: false })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Stage clears', exact: true }).getByRole('link', { name: clear, exact: false })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Pulls', exact: true }).getByRole('link', { name: pulls, exact: false })).toBeVisible();
    for (const title of [tracker, rng]) await expect(page.getByRole('region', { name: 'Discussions', exact: true }).getByRole('link', { name: title, exact: false })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Guides & clears', exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Gameplay & pulls', exact: true })).toHaveCount(0);
    await expect(other.locator('.video-card')).toHaveCount(1);
    for (const title of [outfit, bgm, voice]) await expect(other.getByText(title)).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Video category', exact: true }).click();
    await page.getByRole('option', { name: 'Music & media (4)', exact: true }).click();
    await expect(media.locator('.video-card')).toHaveCount(4);
    await expect(skins).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
