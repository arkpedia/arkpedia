import { devices, expect, test, type Page, type Route } from '@playwright/test';
import { ASSET_RETRY_ATTEMPTS, alternateAssetUrl, nextAssetUrl } from '../../lib/assets/assetRetry';
import { openFilters } from './census-routes';

/*
 * Public pictures, chibis and voices now request immutable R2 addresses. These browser
 * fixtures exercise routing, rendering, missing-file fallbacks and phone playback.
 * A separately injected legacy GitHub image still exercises its bounded encoding retry;
 * the upstream retry unit suite covers that legacy transport in detail.
 */

test.setTimeout(120000);
// Requests still being answered when a test ends are let go, not reported as its failure.
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

const ARKPEDIA_RAW = /^https:\/\/raw\.githubusercontent\.com\/arkpedia\//;
const ARKPEDIA_R2 = /^https:\/\/assets\.arkpedia\.net\/arkpedia\//;
const ENCODED_LETTER = /%(?:4[1-9A-F]|5[0-9A]|6[1-9A-F]|7[0-9A])/i;
/** 1x1 WebP: the stand-in when GitHub itself will not give the real file at any address. */
const STUB_WEBP = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64');
const CORS = { 'access-control-allow-origin': '*' };

type Asked = { url: string; answered: number }[];

/** The real file for an alternate address: through GitHub, at further encodings if it falsely
 *  404s for this harness too, else a stand-in picture. */
async function realFile(route: Route) {
  // Browser routing tests use pinned source bytes as fixtures; remote R2 integrity
  // and readiness are checked by the publisher/deployment acceptance separately.
  const source = route.request().url().replace('https://assets.arkpedia.net', 'https://raw.githubusercontent.com');
  for (let url: string | null = source; url; url = nextAssetUrl(url)) {
    try {
      const response = await route.fetch({ url });
      if (response.ok()) return route.fulfill({ response, headers: { ...response.headers(), ...CORS } });
    } catch { /* the next encoding */ }
  }
  if (route.request().resourceType() === 'image') return route.fulfill({ status: 200, contentType: 'image/webp', headers: CORS, body: STUB_WEBP });
  return route.abort();
}

async function mirroredFiles(page: Page, missing?: RegExp): Promise<Asked> {
  const asked: Asked = [];
  await page.route(ARKPEDIA_R2, async route => {
    const url = route.request().url();
    if (missing?.test(decodeURIComponent(new URL(url).pathname))) {
      asked.push({ url, answered: 404 });
      return route.fulfill({ status: 404, headers: CORS, body: 'Unknown asset' });
    }
    asked.push({ url, answered: 200 });
    return realFile(route);
  });
  return asked;
}

/** Every published file's own address answers GitHub's false 404; `missing` files answer it at every address. */
async function falseNotFound(page: Page, missing?: RegExp): Promise<Asked> {
  const asked: Asked = [];
  await page.route(ARKPEDIA_RAW, async (route) => {
    const url = route.request().url();
    const { pathname } = new URL(url);
    if (missing?.test(decodeURIComponent(pathname)) || !ENCODED_LETTER.test(pathname.split('/').pop() ?? '')) {
      asked.push({ url, answered: 404 });
      return route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', headers: CORS, body: '404: Not Found' });
    }
    asked.push({ url, answered: 200 });
    return realFile(route);
  });
  return asked;
}

/** Published R2 pictures: loaded or broken (complete with nothing to draw). */
function pictures(page: Page) {
  return page.evaluate((pattern) => {
    const raw = Array.from(document.images).filter((img) => new RegExp(pattern).test(img.currentSrc || img.src));
    const address = (img: HTMLImageElement) => img.currentSrc || img.src;
    const loaded = raw.filter((img) => img.complete && img.naturalWidth > 0);
    return {
      loaded: loaded.length,
      broken: raw.filter((img) => img.complete && img.naturalWidth === 0).map(address),
    };
  }, ARKPEDIA_R2.source);
}

async function scrollThrough(page: Page) {
  for (let i = 0; i < 8; i++) {
    // Scrolled by script: mobile WebKit has no mouse wheel.
    await page.evaluate(() => window.scrollBy(0, 1200));
    await page.waitForTimeout(120);
  }
}

test('mirrored catalogue pictures and masks use their pinned R2 addresses', async ({ page }) => {
  const asked = await mirroredFiles(page);
  await page.goto('/operators');
  await scrollThrough(page);
  await expect.poll(async () => {
    const seen = await pictures(page);
    return { broken: seen.broken, enough: seen.loaded >= 30 };
  }, { timeout: 30000 }).toEqual({ broken: [], enough: true });
  expect(asked.length).toBeGreaterThanOrEqual(30);
  expect(asked.every(({ answered }) => answered === 200)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  // On a phone the class chips are in the Filters sheet.
  await openFilters(page);
  const chip = page.getByRole('group', { name: 'Class' }).getByRole('img').first();
  await expect.poll(() => chip.evaluate((el) => (el as HTMLElement).style.webkitMask || (el as HTMLElement).style.mask), { timeout: 15000 }).toContain('https://assets.arkpedia.net/arkpedia/');
});

test('an operator page and its chibi viewer request pinned R2 files', async ({ page }) => {
  const asked = await mirroredFiles(page);
  await page.goto('/operators/Thorns');
  await scrollThrough(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(async () => {
    const seen = await pictures(page);
    return { broken: seen.broken, enough: seen.loaded >= 10 };
  }, { timeout: 30000 }).toEqual({ broken: [], enough: true });

  // The chibi's skeleton and atlas are fetched and its textures loaded off the page.
  await page.getByRole('group', { name: 'Operator outfits', exact: true }).getByRole('button', { name: 'Base', exact: true }).click();
  await page.getByRole('button', { name: 'Chibi viewer', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Chibi animation', exact: true })).toContainText('Idle');
  await expect(page.locator('.chibi-viewer [role="status"]')).toHaveCount(0);
  const model = asked.filter(({ url }) => /arkpedia-sd-assets\/[a-f0-9]{40}\/models\//.test(url));
  for (const kind of [/\.skel$/, /\.atlas$/, /\.(?:png|webp)$/]) {
    expect(model.some(({ url, answered }) => kind.test(url) && answered === 200), `${kind} R2 address requested`).toBe(true);
  }
});

test('a missing mirrored stage image shows the fallback without GitHub encoding probes', async ({ page }) => {
  const asked = await mirroredFiles(page, /\/stages-images\//);
  await page.goto('/games/stage-guesser');
  await page.getByRole('button', { name: 'Start guessing', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal hint: In-game image', exact: true }).click();
  // The page's own fallback: the in-game image gives way to the layout.
  await expect(page.getByRole('alert').filter({ hasText: 'The in-game image could not load' })).toBeVisible();
  const map = () => asked.filter(({ url }) => url.includes('/stages-images/'));
  await expect.poll(() => new Set(map().map(({ url }) => url)).size).toBe(1);
  // And no further tries after the last one.
  const settled = map().length;
  await page.waitForTimeout(1500);
  expect(map().length).toBe(settled);
});

test('an <img> missing at every address gets its error after exactly the bounded tries', async ({ page }) => {
  const asked = await falseNotFound(page, /__retry-missing/);
  await page.goto('/support');
  const own = 'https://raw.githubusercontent.com/arkpedia/arkpedia-image-assets/1a0fb7d0ae42aebb4117be86a52caf97367b4e9f/essential-icons/__retry-missing.webp';
  const errors = await page.evaluate((src) => new Promise<number>((resolve) => {
    const img = document.createElement('img');
    let seen = 0;
    img.onerror = () => { seen++; setTimeout(() => resolve(seen), 1000); };
    img.src = src;
    document.body.appendChild(img);
  }), own);
  expect(errors, 'the element hears only the last failure').toBe(1);
  expect(asked.filter(({ url }) => decodeURIComponent(url).includes('__retry-missing')).map(({ url }) => url))
    .toEqual([own, ...Array.from({ length: ASSET_RETRY_ATTEMPTS }, (_, i) => alternateAssetUrl(own, i + 1)!)]);
});

/*
 * A phone plays <audio> only from inside the press that asked for it (iOS; lib/music/
 * audioElement.ts). Here play() outside a press is refused the way iOS refuses it,
 * so R2 playback must remain synchronous with the user's request.
 */
test.describe('voice clips on a phone', () => {
  const { defaultBrowserType: _browser, ...iPhone } = devices['iPhone 13'];
  test.use(iPhone);
  const wav = Buffer.alloc(44 + 8000 * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  const FINAL = 'Audio could not be loaded for this recording.';

  async function phone(page: Page, missingEverywhere: boolean) {
    await page.addInitScript(() => {
      let inPress = false;
      for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
        addEventListener(type, () => { inPress = true; setTimeout(() => { inPress = false; }, 0); }, true);
      }
      const plays: { src: string; inPress: boolean }[] = [];
      (window as unknown as { __plays: typeof plays }).__plays = plays;
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        plays.push({ src: this.src, inPress });
        if (!inPress) return Promise.reject(new DOMException('The request is not allowed by the user agent.', 'NotAllowedError'));
        return play.call(this);
      };
    });
    const asked: string[] = [];
    await page.route(/^https:\/\/assets\.arkpedia\.net\/arkpedia\/arkpedia-voice-/, async (route) => {
      const url = route.request().url();
      asked.push(url);
      if (missingEverywhere) return route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: 'Unknown asset' });
      return route.fulfill({ status: 200, contentType: 'audio/wav', body: wav });
    });
    await page.goto('/operators/Kroos#voiceLines');
    const voice = page.locator('#operator-voiceLines');
    await expect(voice.getByRole('searchbox', { name: 'Search voice lines' })).toBeVisible();
    const status = voice.locator('[aria-label="Voice line player"] [aria-live="polite"]');
    // Every message the player shows, however briefly.
    await status.evaluate((el) => {
      const seen: string[] = [];
      (window as unknown as { __said: string[] }).__said = seen;
      new MutationObserver(() => seen.push(el.textContent ?? '')).observe(el, { childList: true, subtree: true, characterData: true });
    });
    return { voice, status, asked, line: voice.locator('ol button:not([disabled])').first() };
  }
  const plays = (page: Page) => page.evaluate(() => (window as unknown as { __plays: { src: string; inPress: boolean }[] }).__plays);
  const said = (page: Page) => page.evaluate(() => (window as unknown as { __said: string[] }).__said);

  test('a mirrored clip plays inside the phone user gesture', async ({ page }) => {
    const { voice, status, asked, line } = await phone(page, false);
    await line.click();
    await expect.poll(() => voice.locator('audio').evaluate((el: HTMLAudioElement) => !el.paused && el.currentSrc)).toMatch(ARKPEDIA_R2);
    await expect(status).not.toHaveAttribute('data-error', /.*/);
    expect(await said(page), 'the last failure message never shows during a retry').not.toContain(FINAL);
    const called = await plays(page);
    expect(called.length).toBe(1);
    expect(called.every(({ inPress }) => inPress), JSON.stringify(called)).toBe(true);
    expect(asked).toEqual([called[0].src]);
  });

  test('a missing mirrored clip reports its failure without GitHub encoding probes', async ({ page }) => {
    const { status, asked, line } = await phone(page, true);
    await line.click();
    await expect(status).toHaveText(FINAL);
    const called = await plays(page);
    expect(called).toHaveLength(1);
    expect(asked).toEqual([called[0].src]);
    expect(called.every(({ inPress }) => inPress)).toBe(true);
  });
});
