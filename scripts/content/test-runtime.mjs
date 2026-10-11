import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { pageFilePath } from '../../lib/content/pagePaths.mjs';
import assetCdn from '../../config/asset-delivery.json' with { type: 'json' };
// How a pinned revision appears inside a delivered address, taken from the same template the
// site builds URLs from, so a delivery-network change cannot turn this check red while the site is right.
const pinnedRevision = (revision) => assetCdn.template.split('{repository}')[1].split('{path}')[0].replace('{revision}', revision);
import { chromium, devices } from '@playwright/test';
const root = path.resolve(process.argv[2] || '.cache/content-export/release');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const initial = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
const states = {};
// Two Standard banners whose windows are over (never the Upcoming tab's default), the older
// with its lineup not yet named, as Standard Pool #176 was on 2026-09-25: the page shows a
// note in place of its Featured chips.
const ended = banner => {
  const match = String(banner.global_date ?? '').match(/\d{4}\/\d{1,2}\/\d{1,2}\D+(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  return Boolean(match) && Date.UTC(+match[1], match[2] - 1, +match[3]) < Date.now() - 86_400_000;
};
const [shownBanner, pendingBanner] = JSON.parse(fs.readFileSync(path.join(root, initial.pages['/gacha'].path))).props.banners
  .filter((banner, index) => index > 0 && banner.pull_type === 'standard' && banner.six_stars?.length && ended(banner)).map(banner => banner.name);
assert.ok(shownBanner && pendingBanner, 'two past Standard banners to switch between');
function make(label) {
  const manifest = structuredClone(initial), overrides = new Map();
  manifest.release = label.repeat(64);
  if (label === 'b') manifest.assets['arkpedia-image-assets'] = 'b'.repeat(40);
  for (const repository of Object.keys(manifest.assets).filter(name => name.startsWith('arkpedia-voice-'))) manifest.assets[repository] = label.repeat(40);
  const readPage = route => JSON.parse(fs.readFileSync(path.join(root, initial.pages[route].path)));
  const setPage = (route, props) => {
    const file = pageFilePath(route), body = JSON.stringify({ props });
    overrides.set(file, body);
    manifest.pages[route] = { path: file, bytes: Buffer.byteLength(body), sha256: sha(body) };
  };
  const operator = readPage('/operators/Penance').props;
  operator.operator.name = 'Runtime Content Test';
  operator.operator.trait = `Approved content release ${label.toUpperCase()}`;
  setPage('/operators/Runtime%20Content%20Test', operator);
  if (label === 'b') {
    const added = structuredClone(operator); added.operator.name = 'New Runtime Operator';
    setPage('/operators/New%20Runtime%20Operator', added);
  }
  const gacha = readPage('/gacha').props;
  gacha.banners[0].name = `Runtime Banner ${label.toUpperCase()}`;
  Object.assign(gacha.banners.find(banner => banner.name === pendingBanner), { lineupSource: 'pending', six_stars: [], five_stars: [], four_stars: [], rate_up_six_stars: [] });
  gacha.pools.six[0].name = `Runtime Pool Operator ${label.toUpperCase()}`;
  setPage('/gacha', gacha);
  if (label === 'b') {
    const detail = JSON.parse(fs.readFileSync(path.join(root, 'public/stage-detail/1-7.json')));
    detail.stage.slug = 'runtime-stage'; detail.stage.name = 'Runtime Stage B'; detail.stage.code = 'RT-1';
    overrides.set('public/stage-detail/runtime-stage.json', JSON.stringify(detail));
    // A song only this release has: the music player's queue must pick it up with no rebuild.
    const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'public/music-catalogue.json')));
    catalogue.songs.push({ videoId: 'RuntimeSngB', title: 'Runtime Song B' });
    overrides.set('public/music-catalogue.json', JSON.stringify(catalogue));
  }
  const body = JSON.stringify(manifest);
  overrides.set('manifest.json', body);
  return { manifest, overrides, pointer: { schema: 2, release: manifest.release, revision: label.repeat(40), manifestSha256: sha(body) } };
}
states.a = make('a'); states.b = make('b');
let active = 'a', corrupt = false;
const source = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  if (request.url === '/live/current.json') {
    response.end(JSON.stringify(corrupt ? { ...states[active].pointer, manifestSha256: '0'.repeat(64) } : states[active].pointer)); return;
  }
  const match = request.url.match(/^\/([ab]{40})\/release\/(.+)$/);
  if (!match) { response.writeHead(404); response.end(); return; }
  const state = states[match[1][0]], file = decodeURIComponent(match[2].split('?')[0]);
  const body = state.overrides.get(file);
  if (body !== undefined) { response.end(body); return; }
  if (file.includes('..') || !fs.existsSync(path.join(root, file))) { response.writeHead(404); response.end(); return; }
  response.end(fs.readFileSync(path.join(root, file)));
});
await new Promise(resolve => source.listen(3204, '127.0.0.1', resolve));
const buildFile = path.join(process.env.NEXT_DIST_DIR || '.next', 'BUILD_ID');
const buildId = fs.readFileSync(buildFile, 'utf8');
const log = fs.openSync('/tmp/arkpedia-content-runtime-server.log', 'w');
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3193'], {
  env: { ...process.env, ARKPEDIA_CONTENT_URL: 'http://127.0.0.1:3204', ARKPEDIA_CONTENT_TEST: '1', ARKPEDIA_CONTENT_DISABLED: '0' }, stdio: ['ignore', log, log],
});
let browser;
async function waitFor(check, description, timeout = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await check()) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out: ${description}`);
}
try {
  await waitFor(async () => (await fetch('http://localhost:3193/api/health')).status > 0, 'production server', 30_000);
  browser = await chromium.launch({ headless: true });
  for (const [name, settings] of [['desktop', { viewport: { width: 1440, height: 1000 } }], ['mobile', devices['Pixel 7']]]) {
    const context = await browser.newContext(settings);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://raw.githubusercontent.com/arkpedia/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#1b2c34"/></svg>' }));
    const checkVoice = async (label) => {
      await page.goto('http://localhost:3193/operators/Runtime%20Content%20Test#voiceLines');
      const voice = page.locator('#operator-voiceLines');
      await voice.getByRole('button', { name: /^Play / }).first().click();
      const src = await voice.locator('audio').getAttribute('src');
      assert.ok(src?.includes(pinnedRevision(label.repeat(40))), `${name} voice URL did not use release ${label}`);
    };
    active = 'a'; corrupt = false;
    const visit = async () => { const url = 'http://localhost:3193/operators/Runtime%20Content%20Test#overview'; if (page.url() === url) await page.reload(); else await page.goto(url); return page.locator('body').innerText(); };
    await waitFor(async () => (await visit()).includes('Approved content release A'), `${name} release A`);
    await checkVoice('a');
    active = 'b';
    await waitFor(async () => (await visit()).includes('Approved content release B'), `${name} updated existing operator`);
    assert.ok(await page.locator('.site-nav-glyph').first().evaluate(el => el.style.maskImage.includes('b'.repeat(40))), `${name} CSS artwork did not adopt the release`);
    await checkVoice('b');
    const added = await page.goto('http://localhost:3193/operators/New%20Runtime%20Operator#overview');
    assert.equal(added.status(), 200);
    assert.match(await page.locator('h1').innerText(), /New Runtime Operator/i);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} page overflow`);
    await waitFor(async () => {
      await page.goto('http://localhost:3193/gacha');
      return page.evaluate(() => window.__NEXT_DATA__.props.pageProps.banners[0].name === 'Runtime Banner B'
        && window.__NEXT_DATA__.props.pageProps.pools.six[0].name === 'Runtime Pool Operator B');
    }, `${name} updated banners`, 75_000);
    const bannerImage = await page.locator('.gacha-banner-sidebar-bg').first().getAttribute('src');
    assert.ok(bannerImage?.includes(pinnedRevision('b'.repeat(40))), `${name} gacha banner artwork did not adopt the image release`);
    const operatorIcon = await page.locator('.gacha-featured-chip img').first().getAttribute('src');
    assert.ok(operatorIcon?.includes(pinnedRevision('b'.repeat(40))), `${name} gacha operator icon did not adopt the image release`);
    // Choosing a banner whose lineup is still to be confirmed must not shorten the page: its
    // note holds the height of the chip row it replaces (Anti-Page Jump). The reader sits at
    // the bottom of the page, where a shorter document would clamp the scroll.
    if (name === 'desktop') await page.locator('.gacha-category-row button', { hasText: /^Standard$/ }).click();
    else {
      // The phone's category picker is the site's StyledSelect (a combobox and a listbox
      // portalled to <body>), no longer a native <select>.
      await page.getByRole('combobox', { name: 'Banner category' }).click();
      await page.getByRole('listbox', { name: 'Banner category' }).getByRole('option', { name: /^Standard$/ }).click();
    }
    const sidebarItem = bannerName => page.locator(`.gacha-banner-sidebar-item[title="${bannerName.replace(/\s*\(Global\)\s*$/i, '')}"]`);
    await sidebarItem(shownBanner).click();
    await page.locator('.gacha-roster-section .gacha-featured-chip').first().waitFor({ timeout: 10_000 });
    const before = await page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight); return { height: document.documentElement.scrollHeight, y: Math.round(scrollY) }; });
    // Clicked in place, so reaching the button does not scroll the page first.
    await sidebarItem(pendingBanner).evaluate(button => button.click());
    await page.locator('.gacha-roster-section', { hasText: 'Lineup to be confirmed.' }).waitFor({ timeout: 10_000 });
    const after = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() =>
      resolve({ height: document.documentElement.scrollHeight, y: Math.round(scrollY) })))));
    assert.ok(after.height >= before.height, `${name} choosing the pending banner shortened the page from ${before.height} to ${after.height}px`);
    assert.equal(after.y, before.y, `${name} choosing the pending banner moved the reader's scroll`);
    await waitFor(async () => {
      await page.goto('http://localhost:3193/stages/browse?s=runtime-stage');
      // Rendered text, in any case: the stage name is also the page's h1, which the site
      // sets in capitals (innerText follows text-transform).
      return (await page.locator('body').innerText()).toLowerCase().includes('runtime stage b');
    }, `${name} new stage`, 75_000);
    const servedNow = await page.evaluate(() => window.__NEXT_DATA__.props.pageProps.now);
    assert.ok(Math.abs(servedNow - Date.now() / 1000) < 120, `${name} runtime stage clock is stale`);
    // The player's queue, song count and search come from the release's catalogue.
    const songs = JSON.parse(fs.readFileSync(path.join(root, 'public/music-catalogue.json'))).songs.length;
    const catalogueRequests = [];
    const noteCatalogue = request => { if (request.url().includes('/public/music-catalogue.json')) catalogueRequests.push(request.url()); };
    page.on('request', noteCatalogue);
    // The first stale /music request starts ISR and can still return the build's
    // page. Opening its player would save that old queue; restoreQueue correctly
    // keeps its chosen songs on later reloads instead of adding every new song.
    // Warm the page to B before its first browser visit, so this tests B's fresh
    // catalogue rather than depending on whether ISR beats the queue download.
    await waitFor(async () => {
      const response = await fetch(`http://localhost:3193/_next/data/${buildId}/music.json`);
      if (!response.ok) return false;
      const data = await response.json();
      return data.pageProps?.__contentRelease?.release === states.b.manifest.release;
    }, `${name} music page from release B`, 75_000);
    await waitFor(async () => {
      await page.goto('http://localhost:3193/music?view=queue');
      await page.locator('.music-queue-panel h2', { hasText: `Songs (${songs + 1})` }).waitFor({ timeout: 10_000 });
      return true;
    }, `${name} music queue from release B`, 75_000);
    // By role and name, not class: the queue search is the shared SearchInput now.
    await page.locator('.music-queue-panel').getByRole('searchbox', { name: 'Search songs' }).fill('Runtime Song B');
    await page.locator('.music-queue-row', { hasText: 'Runtime Song B' }).first().waitFor({ timeout: 10_000 });
    assert.ok(catalogueRequests.some(url => url.startsWith(`http://127.0.0.1:3204/${'b'.repeat(40)}/release/public/`)), `${name} music catalogue was not read from release B: ${catalogueRequests.join(', ')}`);
    page.off('request', noteCatalogue);
    active = 'a';
    await waitFor(async () => (await visit()).includes('Approved content release A'), `${name} rollback`);
    await checkVoice('a');
    active = 'b'; corrupt = true;
    await waitFor(async () => (await visit()).includes('Approved content release A'), `${name} corrupt pointer retains previous content`);
    assert.deepEqual(errors, [], `${name} client errors`);
    console.log(`${name}: existing operator updated, new operator, stage and song appeared, banners updated, rollback and corruption fallback passed`);
    await context.close();
  }
  assert.equal(fs.readFileSync(buildFile, 'utf8'), buildId);
  console.log(`All runtime checks passed against unchanged production build ${buildId}`);
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await new Promise(resolve => source.close(resolve));
  fs.closeSync(log);
}
