import { expect, test, type Page } from '@playwright/test';
import { pageAssetRecoveryScript } from '../../lib/assets/pageAssetRecovery';

const cssPath = '/_next/static/css/recovery-fixture.css';
const css = 'body { background-color: rgb(15, 21, 27); color: white; }';
const fixturePath = '/__asset-recovery-test';

async function fixture(page: Page, options: { permanent?: boolean; startup?: boolean; storageBlocked?: boolean } = {}) {
  const requests: string[] = [];
  const documents: string[] = [];
  await page.route(`**${fixturePath}*`, async route => {
    documents.push(route.request().url());
    const fresh = new URL(route.request().url()).searchParams.has('__arkpedia_reload');
    await route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head>
      <script>${options.storageBlocked ? "Object.defineProperty(window,'sessionStorage',{get(){throw Error('blocked')}});" : ''}${pageAssetRecoveryScript()}</script>
      <link rel="stylesheet" href="${cssPath}">
      ${options.startup ? `<script defer src="/_next/static/chunks/${fresh ? 'current' : 'old'}.js"></script>` : ''}
      </head><body><h1>Arkpedia</h1><input aria-label="Plan name"><a href="/">Home</a></body></html>` });
  });
  await page.route(`**${cssPath}*`, async route => {
    requests.push(route.request().url());
    const url = new URL(route.request().url());
    const failed = options.permanent || (!options.startup && !url.searchParams.has('__arkpedia_retry'));
    await route.fulfill(failed ? { status: 503, body: 'Unavailable' } : { contentType: 'text/css', body: css });
  });
  if (options.startup) await page.route('**/_next/static/chunks/{old,current}.js', route =>
    route.fulfill(route.request().url().endsWith('/old.js')
      ? { status: 404, body: 'Old build removed' }
      : { contentType: 'text/javascript', body: 'window.recoveredApp = true;' }));
  return { requests, documents };
}

for (const theme of ['dark', 'light']) test(`the actual homepage recovers a failed stylesheet before application startup (${theme})`, async ({ page }) => {
  await page.addInitScript(theme => {
    localStorage.setItem('theme', theme);
    localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({ version: 1, analytics: false, externalMedia: false, externalMediaChosen: true, savedAt: Date.now() }));
  }, theme);
  let failures = 0;
  let retries = 0;
  let failedPath = '';
  await page.route('**/_next/static/**/*.css*', async route => {
    const url = new URL(route.request().url());
    failedPath ||= url.pathname;
    if (url.pathname === failedPath && !url.searchParams.has('__arkpedia_retry')) { failures++; await route.fulfill({ status: 503, body: 'Interrupted stylesheet' }); }
    else { if (route.request().url().includes('__arkpedia_retry=')) retries++; await route.continue(); }
  });
  await page.goto('/');
  await expect.poll(() => retries).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim())).not.toBe('');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(failures).toBeGreaterThan(0);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: test.info().outputPath(`recovered-${theme}.png`), animations: 'disabled' });
});

test('CSS retries restore styling without navigation and keep the same link', async ({ page }) => {
  const state = await fixture(page);
  await page.goto(fixturePath + '?view=events#saved');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(15, 21, 27)');
  expect(state.documents).toHaveLength(1);
  expect(state.requests).toHaveLength(2);
  await expect(page.locator('link[rel=stylesheet]')).toHaveCount(1);
  expect(page.url()).toContain('?view=events#saved');
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await page.waitForTimeout(400);
  expect(state.requests).toHaveLength(2);
});

test('an old startup bundle gets one fresh document and preserves the URL and saved data', async ({ page }) => {
  const state = await fixture(page, { startup: true });
  await page.addInitScript(() => localStorage.setItem('recovery-plan', 'saved'));
  await page.goto(fixturePath + '?view=events#saved');
  await expect.poll(() => page.evaluate(() => (window as Window & { recoveredApp?: boolean }).recoveredApp)).toBe(true);
  expect(state.documents).toHaveLength(2);
  expect(state.documents[1]).toContain('__arkpedia_reload=');
  expect(page.url()).toContain('?view=events#saved');
  expect(await page.evaluate(() => localStorage.getItem('recovery-plan'))).toBe('saved');
});

for (const storageBlocked of [false, true]) test(`persistent failures stop after one reload (storage blocked: ${storageBlocked})`, async ({ page }) => {
  const state = await fixture(page, { permanent: true, storageBlocked });
  await page.goto(fixturePath);
  await expect.poll(() => state.documents.length).toBe(2);
  await expect.poll(() => state.requests.length).toBe(6);
  await page.waitForTimeout(1500);
  expect(state.documents).toHaveLength(2);
  expect(state.requests).toHaveLength(6);
});

test('recovery never reloads after the reader starts editing', async ({ page }) => {
  const state = await fixture(page, { permanent: true });
  await page.goto(fixturePath);
  await page.getByRole('textbox', { name: 'Plan name' }).fill('Keep my unsaved plan');
  await expect.poll(() => state.requests.length).toBe(3);
  await page.waitForTimeout(1500);
  expect(state.documents).toHaveLength(1);
  await expect(page.getByRole('textbox')).toHaveValue('Keep my unsaved plan');
});

test('an offline page waits for connectivity before retrying its styles', async ({ page }) => {
  const state = await fixture(page);
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }));
  await page.goto(fixturePath);
  expect(state.requests).toHaveLength(1);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    window.dispatchEvent(new Event('online'));
  });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(15, 21, 27)');
  expect(state.documents).toHaveLength(1);
});

test('third-party media and later script failures cannot reload the page', async ({ page }) => {
  const state = await fixture(page);
  await page.route(/youtube\.com\/iframe_api|example\.com\/style\.css|\/chunks\/dynamic\.js/, route => route.abort());
  await page.goto(fixturePath);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(15, 21, 27)');
  await page.evaluate(() => {
    for (const [tag, url] of [['script', 'https://www.youtube.com/iframe_api'], ['script', '/_next/static/chunks/dynamic.js'], ['link', 'https://example.com/style.css']]) {
      const element = document.createElement(tag);
      element.setAttribute(tag === 'link' ? 'href' : 'src', url);
      if (tag === 'link') element.setAttribute('rel', 'stylesheet');
      // An event whose target is the resource; requests are intercepted above.
      document.head.appendChild(element);
      element.dispatchEvent(new Event('error'));
      element.remove();
    }
  });
  await page.waitForTimeout(1500);
  expect(state.documents).toHaveLength(1);
  expect(state.requests).toHaveLength(2);
});
