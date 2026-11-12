import { expect, test, type Page } from '@playwright/test';
import type { Skin } from '../../lib/skins/skinTypes';
import { readOnly } from './census-routes';

/** Exercise the home carousel with a real outfit even between shop windows. Its
 * server-selected rows depend on today's date, so fixing the browser clock alone
 * cannot guarantee that a card (or this animated outfit) is on the home page. */
async function openHomeWithOutfit(page: Page, name = 'Supernova') {
  const gallery = await page.request.get('/skins');
  expect(gallery.ok()).toBe(true);
  const json = (await gallery.text()).match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  expect(json, 'the gallery provides the real outfit records').toBeTruthy();
  const props = JSON.parse(json!).props.pageProps;
  const skin = (props.skins as Skin[]).find(skin => skin.name === name);
  expect(skin, `${name} exists in the gallery`).toBeTruthy();
  // The gallery keeps animation pointers in a separate map to reduce its payload.
  const outfit = { ...skin!, dynamic: props.dynamicArt?.[skin!.skinId ?? ''] ?? skin!.dynamic ?? null };
  let given = false;
  await page.route(url => url.pathname === '/', async route => {
    const html = await (await route.fetch()).text();
    const body = html.replace(/(<script id="__NEXT_DATA__" type="application\/json"[^>]*>)([\s\S]*?)(<\/script>)/, (_, open: string, json: string, close: string) => {
      const data = JSON.parse(json);
      data.props.pageProps.ongoingSkins = [outfit];
      given = true;
      return open + JSON.stringify(data).replace(/</g, '\\u003c') + close;
    });
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  });
  await page.goto('/');
  expect(given, 'the home carousel receives its outfit fixture').toBe(true);
}

for (const theme of ['dark', 'light']) {
  test(`outfit details keep artwork, actions and information usable (${theme})`, async ({ page }, info) => {
    await readOnly(page);
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.route('**/api/community/stats?**', route => route.fulfill({ json: { contributors: 20, owned: 10, equipmentOwners: 10, equipped: 3 } }));
    await page.goto('/skins?skin=The%20Spirit-Farer');
    const dialog = page.getByRole('dialog', { name: 'The Spirit-Farer', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('30.0%', { exact: true })).toBeVisible();
    const artwork = dialog.getByRole('button', { name: 'View full artwork of The Spirit-Farer', exact: true });
    await expect.poll(() => artwork.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(artwork.locator('img')).toHaveCSS('object-fit', 'contain');
    const wish = dialog.getByRole('button', { name: 'Wishlist', exact: true });
    await wish.click();
    await expect(dialog.getByRole('button', { name: 'Wishlisted', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(dialog.getByRole('button', { name: 'Wishlisted', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByText('30.0%', { exact: true })).toBeVisible();
    await expect.poll(() => dialog.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await dialog.locator('img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
    await page.evaluate(() => document.fonts.ready);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/skin-detail-${info.project.name}-${theme}.png` });
    await artwork.click();
    const zoom = page.getByRole('dialog', { name: 'The Spirit-Farer artwork', exact: true });
    await expect(zoom).toBeVisible();
    const bounds = await zoom.boundingBox();
    expect(bounds!.width).toBe(await page.evaluate(() => document.documentElement.getBoundingClientRect().width));
    await page.keyboard.press('Escape');
    await expect(zoom).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(artwork).toBeFocused();
    await dialog.getByText('Release details', { exact: true }).click();
    await expect(dialog.getByText(/Original release:/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
    const availability = dialog.getByRole('button', { name: 'Availability details', exact: true });
    if (await availability.count()) {
      await availability.click();
      await expect(page.getByRole('region', { name: 'Availability details', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeVisible();
    }
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ width: 320, height: 568 });
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await dialog.getByText('Do you want to contribute?').scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
    await page.setViewportSize(viewport);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    // A deep link opens any outfit; it need not be among today's first 30 cards.
    await page.getByRole('searchbox', { name: 'Search skins' }).fill('The Spirit-Farer');
    const card = page.getByRole('button', { name: /The Spirit-Farer/ }).first();
    await card.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(card).toBeFocused();
  });
}

for (const surface of ['home', 'event', 'schedule']) {
  test(`the ${surface} opens the shared outfit dialog and returns focus`, async ({ page }) => {
    await readOnly(page);
    await page.route('**/api/community/stats?**', route => route.fulfill({ json: { contributors: 2, owned: null } }));
    if (surface === 'home') await openHomeWithOutfit(page);
    if (surface === 'event') {
      await page.goto('/events/%5BCelebration%5D%20Critical%20Phase%20Transition');
      await page.getByRole('tab', { name: 'Skins', exact: true }).click();
    }
    if (surface === 'schedule') {
      await page.goto('/schedule?view=calendar');
      await page.getByRole('combobox', { name: 'Year', exact: true }).click();
      await page.getByRole('option', { name: '2026', exact: true }).click();
      await page.getByRole('combobox', { name: 'Month', exact: true }).click();
      await page.getByRole('option', { name: 'October', exact: true }).click();
      await page.locator('.schedule-bar').filter({ hasText: 'Critical Phase Transition' }).first().click();
    }
    const card = page.locator(surface === 'home' ? '.front-skin-item' : surface === 'event' ? '.event-detail-skin-item' : '.schedule-panel-skin').first();
    await card.click();
    const dialog = page.locator('dialog.skin-modal');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^View full artwork/ })).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'View in outfit gallery', exact: true })).toBeVisible();
    await expect(dialog.getByText('Waiting for at least 10 contributors across all regions.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(card).toBeFocused();
  });
}

for (const theme of ['dark', 'light']) {
  for (const surface of ['home', 'event', 'schedule', 'gallery']) {
    test(`animated outfits use the same viewer from ${surface} (${theme})`, async ({ page }, info) => {
      await readOnly(page);
      await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
      const modelRequests: string[] = [];
      // Keep the model pending: this regression checks discovery and lazy loading,
      // without depending on WebGL or downloading a large animation in every case.
      await page.route(/arkpedia-l2d-assets.*\/model\.json/, route => { modelRequests.push(route.request().url()); });
      if (surface === 'home') await openHomeWithOutfit(page);
      if (surface === 'gallery') await page.goto('/skins?skin=Supernova');
      if (surface === 'event') {
        await page.goto(`/events/${encodeURIComponent("[Side Story – Celebration] The Masses' Travels")}`);
        await page.getByRole('tab', { name: 'Skins', exact: true }).click();
      }
      if (surface === 'schedule') {
        await page.goto('/schedule?view=calendar');
        await page.getByRole('combobox', { name: 'Year', exact: true }).click();
        await page.getByRole('option', { name: '2025', exact: true }).click();
        await page.getByRole('combobox', { name: 'Month', exact: true }).click();
        await page.getByRole('option', { name: 'October', exact: true }).click();
        await page.locator('.schedule-bar').filter({ hasText: "The Masses' Travels" }).first().click();
      }
      const card = surface === 'home' ? page.locator('.front-skin-item').filter({ hasText: 'Supernova' })
        : surface === 'event' ? page.locator('.event-detail-skin-item').filter({ hasText: 'Supernova' })
        : page.locator('.schedule-panel-skin').filter({ has: page.getByRole('img', { name: 'Supernova', exact: true }) });
      if (surface !== 'gallery') await card.click();
      const dialog = page.getByRole('dialog', { name: 'Supernova', exact: true });
      const artwork = dialog.getByRole('button', { name: 'View full artwork of Supernova', exact: true });
      await artwork.click();
      const zoom = page.getByRole('dialog', { name: 'Supernova artwork', exact: true });
      const animated = zoom.getByRole('button', { name: 'Animated', exact: true });
      await expect(animated).toBeVisible();
      expect(modelRequests).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/animation-${surface}-${info.project.name}-${theme}.png` });
      await animated.click();
      await expect(animated).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => modelRequests.length).toBe(1);
      expect(decodeURIComponent(modelRequests[0])).toContain('char_1035_wisdel');
      await zoom.getByRole('button', { name: 'Still', exact: true }).click();
      await page.keyboard.press('Escape');
      await expect(zoom).toHaveCount(0);
      await expect(artwork).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      if (surface !== 'gallery') await expect(card).toBeFocused();
    });
  }
}
