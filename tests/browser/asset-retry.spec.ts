import { devices, expect, test, type Page, type Route } from '@playwright/test';
import { ASSET_RETRY_ATTEMPTS, alternateAssetUrl, nextAssetUrl } from '../../lib/assets/assetRetry';

/*
 * GitHub's raw origin sometimes answers 404 (text/plain) for a published file that exists, and its
 * CDN keeps that answer for minutes per path; another percent-encoding of the path is another cache
 * entry and the same file (lib/assets/assetRetry.ts). Here every published file's own address
 * answers that false 404, and any other encoding of it gives the file. No picture may be left
 * broken, and the chibi viewer, whose files are fetched, must still load. A file missing at every
 * address stops after the bounded tries, and the component's own fallback shows.
 */

test.setTimeout(120000);
// Requests still being answered when a test ends are let go, not reported as its failure.
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

const ARKPEDIA_RAW = /^https:\/\/raw\.githubusercontent\.com\/arkpedia\//;
const ENCODED_LETTER = /%(?:4[1-9A-F]|5[0-9A]|6[1-9A-F]|7[0-9A])/i;
/** 1x1 WebP: the stand-in when GitHub itself will not give the real file at any address. */
const STUB_WEBP = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64');
const CORS = { 'access-control-allow-origin': '*' };

type Asked = { url: string; answered: number }[];

/** The real file for an alternate address: through GitHub, at further encodings if it falsely
 *  404s for this harness too, else a stand-in picture. */
async function realFile(route: Route) {
  for (let url: string | null = route.request().url(); url; url = nextAssetUrl(url)) {
    try {
      const response = await route.fetch({ url });
      if (response.ok()) return route.fulfill({ response, headers: { ...response.headers(), ...CORS } });
    } catch { /* the next encoding */ }
  }
  if (route.request().resourceType() === 'image') return route.fulfill({ status: 200, contentType: 'image/webp', headers: CORS, body: STUB_WEBP });
  return route.abort();
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

/** The published pictures on the page: loaded, broken (complete with nothing to draw), and loaded from another encoding. */
function pictures(page: Page) {
  return page.evaluate((pattern) => {
    const raw = Array.from(document.images).filter((img) => new RegExp(pattern).test(img.currentSrc || img.src));
    const address = (img: HTMLImageElement) => img.currentSrc || img.src;
    const loaded = raw.filter((img) => img.complete && img.naturalWidth > 0);
    return {
      loaded: loaded.length,
      broken: raw.filter((img) => img.complete && img.naturalWidth === 0).map(address),
      // Every own address 404s here, so a loaded picture came from another encoding.
      ownAddress: loaded.filter((img) => !/%(?:4[1-9A-F]|5[0-9A]|6[1-9A-F]|7[0-9A])/i.test(address(img).split('?')[0].split('/').pop() ?? '')).map(address),
    };
  }, ARKPEDIA_RAW.source);
}

async function scrollThrough(page: Page) {
  for (let i = 0; i < 8; i++) {
    // Scrolled by script: mobile WebKit has no mouse wheel.
    await page.evaluate(() => window.scrollBy(0, 1200));
    await page.waitForTimeout(120);
  }
}

test('a false 404 on every published picture leaves none broken on /operators', async ({ page }) => {
  const asked = await falseNotFound(page);
  await page.goto('/operators');
  await scrollThrough(page);
  await expect.poll(async () => {
    const seen = await pictures(page);
    return { broken: seen.broken, ownAddress: seen.ownAddress, enough: seen.loaded >= 30 };
  }, { timeout: 30000 }).toEqual({ broken: [], ownAddress: [], enough: true });
  // Not vacuous: the pictures' own addresses were asked for and refused, and each came back at
  // another encoding, as the browser sent it (the escape survived URL parsing).
  const loaded = await page.evaluate(() => Array.from(document.images).filter((img) => img.complete && img.naturalWidth > 0).map((img) => img.currentSrc || img.src));
  const refused = new Set(asked.filter(({ answered }) => answered === 404).map(({ url }) => url));
  const own = (url: string) => url.replace(/%(4[1-9A-F]|5[0-9A]|6[1-9A-F]|7[0-9A])/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  const retried = loaded.filter((url) => ARKPEDIA_RAW.test(url));
  expect(retried.length).toBeGreaterThanOrEqual(30);
  for (const url of retried) expect(refused.has(own(url)), url).toBe(true);
  // CSS art has no error event: the class chips' masks are looked at once shown, and move to
  // an address that answered.
  await page.evaluate(() => window.scrollTo(0, 0));
  const chip = page.getByRole('group', { name: 'Class' }).getByRole('img').first();
  await expect.poll(() => chip.evaluate((el) => (el as HTMLElement).style.webkitMask || (el as HTMLElement).style.mask), { timeout: 15000 }).toMatch(ENCODED_LETTER);
});

test('an operator page and its chibi viewer load through false 404s', async ({ page }) => {
  const asked = await falseNotFound(page);
  await page.goto('/operators/Thorns');
  await scrollThrough(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(async () => {
    const seen = await pictures(page);
    return { broken: seen.broken, ownAddress: seen.ownAddress, enough: seen.loaded >= 10 };
  }, { timeout: 30000 }).toEqual({ broken: [], ownAddress: [], enough: true });

  // The chibi's skeleton and atlas are fetched and its textures loaded off the page.
  await page.getByRole('group', { name: 'Operator outfits', exact: true }).getByRole('button', { name: 'Base', exact: true }).click();
  await page.getByRole('button', { name: 'Chibi viewer', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Chibi animation', exact: true })).toContainText('Idle');
  await expect(page.locator('.chibi-viewer [role="status"]')).toHaveCount(0);
  const model = asked.filter(({ url }) => /arkpedia-sd-assets\/[a-f0-9]{40}\/models\//.test(url));
  for (const kind of [/\.skel$/, /\.atlas$/, /\.png$/]) {
    expect(model.some(({ url, answered }) => kind.test(url) && answered === 404), `${kind} own address refused`).toBe(true);
    expect(model.some(({ url, answered }) => kind.test(url) && answered === 200), `${kind} alternate served`).toBe(true);
  }
});

test('a file missing at every address stops after the bounded tries, and the fallback shows', async ({ page }) => {
  const asked = await falseNotFound(page, /\/stages-images\//);
  await page.goto('/games/stage-guesser');
  await page.getByRole('button', { name: 'Start guessing', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal hint: In-game image', exact: true }).click();
  // The page's own fallback: the in-game image gives way to the layout.
  await expect(page.getByRole('alert').filter({ hasText: 'The in-game image could not load' })).toBeVisible();
  const map = () => asked.filter(({ url }) => url.includes('/stages-images/'));
  await expect.poll(() => new Set(map().map(({ url }) => url)).size).toBe(ASSET_RETRY_ATTEMPTS + 1);
  const own = map()[0].url;
  expect(new Set(map().map(({ url }) => url))).toEqual(new Set([own, ...[1, 2, 3].map((attempt) => alternateAssetUrl(own, attempt)!)]));
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
    .toEqual([own, ...[1, 2, 3].map((attempt) => alternateAssetUrl(own, attempt)!)]);
});

/*
 * A phone plays <audio> only from inside the press that asked for it (iOS; lib/music/
 * audioElement.ts), so a voice clip GitHub refused is not retried from an await: the reader is
 * told to press play again, and that press asks at the next encoding, inside itself. Here
 * play() outside a press is refused the way iOS refuses it, so a retry from an await would
 * fail; in WebKit's iPhone profile and in Chromium alike.
 */
test.describe('voice clips on a phone', () => {
  const { defaultBrowserType: _browser, ...iPhone } = devices['iPhone 13'];
  test.use(iPhone);
  const wav = Buffer.alloc(44 + 8000 * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  const RETRY = 'This recording did not load. Press play to try again.';
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
    await page.route(/^https:\/\/raw\.githubusercontent\.com\/arkpedia\/arkpedia-voice-/, async (route) => {
      const url = route.request().url();
      asked.push(url);
      const own = !ENCODED_LETTER.test(new URL(url).pathname.split('/').pop() ?? '');
      if (own || missingEverywhere) return route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: '404: Not Found' });
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

  test('a clip GitHub refused plays at the next press, from inside it', async ({ page }) => {
    const { voice, status, asked, line } = await phone(page, false);
    await line.click();
    await expect(status).toHaveText(RETRY);
    await line.click();
    await expect.poll(() => voice.locator('audio').evaluate((el: HTMLAudioElement) => !el.paused && el.currentSrc)).toMatch(ENCODED_LETTER);
    await expect(status).not.toHaveAttribute('data-error', /.*/);
    expect(await said(page), 'the last failure message never shows during a retry').not.toContain(FINAL);
    const called = await plays(page);
    expect(called.length).toBe(2);
    expect(called.every(({ inPress }) => inPress), JSON.stringify(called)).toBe(true);
    expect(called[1].src).toBe(alternateAssetUrl(called[0].src, 1));
    expect(asked).toEqual([called[0].src, called[1].src]);
  });

  test('a clip missing at every address says so after the last encoding, never sooner', async ({ page }) => {
    const { status, asked, line } = await phone(page, true);
    for (let press = 1; press <= ASSET_RETRY_ATTEMPTS; press++) {
      await line.click();
      await expect(status).toHaveText(RETRY);
      await expect.poll(() => asked.length).toBe(press);
    }
    expect(await said(page)).not.toContain(FINAL);
    await line.click();
    await expect(status).toHaveText(FINAL);
    const called = await plays(page);
    expect(called.map(({ src }) => src)).toEqual([called[0].src, ...[1, 2, 3].map((attempt) => alternateAssetUrl(called[0].src, attempt))]);
    expect(called.every(({ inPress }) => inPress)).toBe(true);
  });
});
