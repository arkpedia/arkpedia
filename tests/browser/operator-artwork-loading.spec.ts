import { expect, test, type Page } from '@playwright/test';
import { readOnly } from './census-routes';

/*
 * The operator artwork fetches the outfit on screen, and another only when the reader
 * switches to it (lazy-images, 2026-09-29). /operators/Amiya fetched all six of Amiya's
 * outfits at full size at load: the picker's 68x46 thumbnails were each outfit's full
 * artwork, beside the 768px rendition the carousel showed. The thumbnails are the 320px
 * renditions now (AVIF, or WebP), and pages/operators/[name].tsx fetches another
 * outfit's artwork only when the reader points at, focuses or presses the control that
 * shows it (or autoplay turns to it), into a hidden copy inside the artwork's box.
 *
 * Dedicated (one page, driven), not a census check. Autoplay turns every 8s, so it is
 * paused once the page has hydrated: what is fetched before the reader does anything is
 * then what the load asked for, however slow the load.
 */

/** The artwork at a size the carousel shows it: a 768 or 1280 rendition, or the full file
 *  (an original under <rarity>-star-skins/, or the lossless PNG). Not the 320 thumbnails. */
const FULL_ART = /\/variants\/(?:avif|webp)\/w(?:768|1280)\/|\/[0-9a-f]{40}\/[a-z]+-star-skins\/|\/originals\//;
const THUMB = /\/variants\/(?:avif|webp)\/w320\//;
const SKIN_ART = /-star-skins\//;

const shown = (page: Page) => page.locator('.op-carousel-img-enter img').evaluate((img: HTMLImageElement) => decodeURIComponent(img.currentSrc));
const frame = (page: Page) => page.evaluate(() => {
  const box = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round).join(','); };
  return { artwork: box('.op-carousel-main'), picker: box('[aria-label="Operator outfits"]'), document: document.documentElement.scrollHeight };
});
const arrived = (page: Page) => expect.poll(() => page.locator('.op-carousel-img-enter img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { timeout: 20_000 }).toBe(true);

test('the operator artwork fetches the outfit on screen, and another only when the reader switches to it', async ({ page }) => {
  test.setTimeout(90_000);
  await readOnly(page);
  const images: string[] = [];
  page.on('request', (request) => { if (request.resourceType() === 'image') images.push(decodeURIComponent(request.url())); });
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error' && /hydrat|did not match|Minified React error #(418|423|425)/i.test(msg.text())) errors.push(msg.text()); });
  const fullArt = () => [...new Set(images.filter((url) => FULL_ART.test(url)))];

  await page.goto('/operators/Amiya');
  // The app has hydrated once the image-arrival watch is on (pages/_app.tsx), and the
  // pause is then a real press, before autoplay's first turn at 8s.
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-image-arrivals'));
  const play = page.getByRole('button', { name: 'Pause outfit autoplay' });
  await play.click();
  await expect(page.getByRole('button', { name: 'Start outfit autoplay' })).toBeVisible();
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await arrived(page);

  const first = await shown(page);
  expect(first, 'the first outfit is shown at a carousel size').toMatch(FULL_ART);
  expect(fullArt(), 'at load, the artwork of the outfit on screen and no other').toEqual([first]);
  const thumbnails = await page.locator('[aria-label="Operator outfits"] img').evaluateAll((imgs) => [...new Set(imgs.map((img) => decodeURIComponent((img as HTMLImageElement).currentSrc)).filter(Boolean))]);
  expect(thumbnails.length, 'the thumbnails on screen have loaded').toBeGreaterThan(1);
  expect(thumbnails.filter((src) => !THUMB.test(src)), 'every thumbnail is its outfit\'s 320px rendition').toEqual([]);
  expect(images.filter((url) => SKIN_ART.test(url) && !FULL_ART.test(url) && !THUMB.test(url)), 'no other size of any outfit').toEqual([]);
  const before = await frame(page);

  // The reader moves to the next outfit: its artwork is fetched then, and only it.
  const next = page.getByRole('button', { name: 'Show next outfit' });
  await next.hover();
  await next.click();
  await expect.poll(() => shown(page), { timeout: 20_000 }).not.toBe(first);
  await arrived(page);
  const second = await shown(page);
  expect(fullArt(), 'switching fetches the new outfit\'s artwork, and nothing else').toEqual([first, second]);
  expect(await page.locator('[aria-label="Operator outfits"] button[aria-pressed="true"]').first().getAttribute('aria-label'), 'the picture shown is the outfit picked')
    .toBe(await page.locator('.op-carousel-img-enter img').getAttribute('alt'));
  // The switch keeps the frame: the artwork's box, the picker and the page's height.
  await page.waitForTimeout(600);
  expect(await frame(page), 'switching outfits moves no box and does not shorten the page').toEqual(before);

  // Back to the first: in the browser already, so nothing more is fetched.
  await page.getByRole('button', { name: 'Show previous outfit' }).click();
  await expect.poll(() => shown(page)).toBe(first);
  await page.waitForTimeout(600);
  expect(fullArt(), 'going back fetches nothing').toEqual([first, second]);
  expect(await frame(page)).toEqual(before);
  expect(errors, 'no hydration error').toEqual([]);
});
