import { expect, test } from '@playwright/test';
import { makeFriendFile } from '../../lib/account/friendFile';
import type { AccountRecord } from '../../lib/account/accountStore';
import { readOnly } from './census-routes';

const account: AccountRecord = {
  version: 1, server: 'en', importedAt: '2026-11-03T00:00:00Z', doctor: 'Artwork Doctor#1111',
  operators: ['Amiya (Guard)'], skins: ['char_1001_amiya2@sale#16', 'char_1001_amiya2@casc#1'], cleared: [],
};
const friend = makeFriendFile(account, {});

for (const theme of ['dark', 'light']) for (const source of ['account', 'friends']) {
  test(`${source} skins reuse the artwork viewer and preserve the gallery (${theme})`, async ({ page }, info) => {
    await readOnly(page);
    await page.addInitScript(({ account, theme }) => {
      localStorage.setItem('arkpediaAccount', JSON.stringify(account));
      localStorage.setItem('theme', theme);
    }, { account, theme });
    const modelRequests: string[] = [];
    let finishModel!: () => void;
    const modelResponse = new Promise<void>(resolve => { finishModel = resolve; });
    await page.route('**/models/**/model.json', async route => {
      modelRequests.push(route.request().url());
      // Keep the loading controls visible until their layout has been measured.
      await modelResponse;
      return route.fulfill({ status: 404, body: '' });
    });
    await page.goto(`/${source}`);
    if (source === 'friends') {
      await expect(page.getByRole('button', { name: 'Export my account', exact: true })).toBeEnabled();
      await page.getByLabel('Friend account file').setInputFiles({ name: 'artwork-friend.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(friend)) });
      await page.getByRole('button', { name: "Show Artwork Doctor#1111's skins", exact: true }).click();
    } else await page.getByRole('tab', { name: 'Skins', exact: true }).click();
    const collection = source === 'friends'
      ? page.getByRole('dialog', { name: 'Artwork Doctor#1111 · Skins', exact: true })
      : page.getByRole('tabpanel', { name: 'Skins', exact: true });
    const search = collection.getByRole('searchbox');
    await search.fill('Amiya');
    const card = collection.getByRole('button', { name: 'Amiya (Guard) In A Myriad of Universes', exact: true });
    await card.scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => window.scrollY);
    await card.click();
    const viewer = page.getByRole('dialog', { name: 'Amiya (Guard) — In A Myriad of Universes artwork', exact: true });
    const artwork = viewer.getByRole('img', { name: 'Amiya (Guard) — In A Myriad of Universes', exact: true });
    await expect(viewer).toBeVisible();
    await expect.poll(() => artwork.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(viewer.getByRole('button', { name: 'Still', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(viewer.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    expect(modelRequests).toEqual([]);
    const controls = viewer.getByRole('group', { name: 'Artwork', exact: true });
    const stillPosition = await controls.boundingBox();
    // A stable root scrollbar gutter narrows the containing block even when clientWidth does not.
    const contentWidth = await page.evaluate(() => document.documentElement.getBoundingClientRect().width);
    if (info.project.name.startsWith('mobile')) {
      expect(Math.abs(stillPosition!.x + stillPosition!.width / 2 - contentWidth / 2)).toBeLessThan(1);
      const actions = await viewer.locator('.skin-zoom-actions').boundingBox();
      expect(Math.abs(actions!.x + actions!.width / 2 - contentWidth / 2)).toBeLessThan(1);
      expect(actions!.y).toBeGreaterThan(stillPosition!.y);
    }
    const box = await viewer.boundingBox();
    expect(box?.x).toBe(0); expect(box?.y).toBe(0);
    expect(box?.width).toBe(contentWidth);
    expect(box?.height).toBe(page.viewportSize()!.height);
    await page.keyboard.press('Tab');
    await expect(viewer.getByRole('button', { name: 'Still', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(viewer.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/${source}-skin-${theme}-${info.project.name}.png` });
    await viewer.getByRole('button', { name: 'Animated', exact: true }).click();
    // Showing the illustration versions must not move the main controls sideways or upwards.
    await expect(viewer.getByRole('group', { name: 'Illustration version', exact: true })).toBeVisible();
    const animatedPosition = await controls.boundingBox();
    expect(animatedPosition!.x).toBe(stillPosition!.x);
    expect(animatedPosition!.y).toBe(stillPosition!.y);
    const versions = await viewer.getByRole('group', { name: 'Illustration version', exact: true }).boundingBox();
    expect(versions!.y + versions!.height).toBeLessThanOrEqual(animatedPosition!.y);
    expect(Math.abs(versions!.x + versions!.width / 2 - contentWidth / 2)).toBeLessThan(1);
    await expect.poll(() => modelRequests.length).toBeGreaterThan(0);
    expect(modelRequests[0]).toContain('/char_1001_amiya2_sale_16/');
    finishModel();
    await expect(viewer.getByText('The animated art could not be loaded.', { exact: true })).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'Still', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
    await expect(collection).toBeVisible();
    await expect(card).toBeFocused();
    await expect(search).toHaveValue('Amiya');
    expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
    await card.click();
    await viewer.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(card).toBeFocused();
    // A still-only outfit uses the same viewer without offering a nonexistent animation.
    await collection.getByRole('button', { name: 'Amiya (Guard) Touch the Stars', exact: true }).click();
    const still = page.getByRole('dialog', { name: 'Amiya (Guard) — Touch the Stars artwork', exact: true });
    await expect(still).toBeVisible();
    await expect(still.getByRole('button', { name: 'Animated', exact: true })).toHaveCount(0);
    await still.getByRole('button', { name: 'Close', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (source === 'friends') {
      await page.keyboard.press('Escape');
      await expect(collection).toHaveCount(0);
      await expect(page.getByRole('button', { name: "Show Artwork Doctor#1111's skins", exact: true })).toBeFocused();
    }
  });
}
