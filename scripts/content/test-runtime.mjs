import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { chromium, devices } from '@playwright/test';
const root = path.resolve(process.argv[2] || '.cache/content-export/release');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const initial = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
const states = {};
function make(label) {
  const manifest = structuredClone(initial), overrides = new Map();
  manifest.release = label.repeat(64);
  const readPage = route => JSON.parse(fs.readFileSync(path.join(root, initial.pages[route].path)));
  const setPage = (route, props) => {
    const file = `pages/${sha(route)}.json`, body = JSON.stringify({ props });
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
  setPage('/gacha', gacha);
  if (label === 'b') {
    const detail = JSON.parse(fs.readFileSync(path.join(root, 'public/stage-detail/1-7.json')));
    detail.stage.slug = 'runtime-stage'; detail.stage.name = 'Runtime Stage B'; detail.stage.code = 'RT-1';
    overrides.set('public/stage-detail/runtime-stage.json', JSON.stringify(detail));
  }
  const body = JSON.stringify(manifest);
  overrides.set('manifest.json', body);
  return { manifest, overrides, pointer: { schema: 1, release: manifest.release, revision: label.repeat(40), manifestSha256: sha(body) } };
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
const buildId = fs.readFileSync('.next/BUILD_ID', 'utf8');
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
    active = 'a'; corrupt = false;
    const visit = async () => { const url = 'http://localhost:3193/operators/Runtime%20Content%20Test#overview'; if (page.url() === url) await page.reload(); else await page.goto(url); return page.locator('body').innerText(); };
    await waitFor(async () => (await visit()).includes('Approved content release A'), `${name} release A`);
    active = 'b';
    await waitFor(async () => (await visit()).includes('Approved content release B'), `${name} updated existing operator`);
    const added = await page.goto('http://localhost:3193/operators/New%20Runtime%20Operator#overview');
    assert.equal(added.status(), 200);
    assert.match(await page.locator('h1').innerText(), /New Runtime Operator/i);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} page overflow`);
    await waitFor(async () => {
      await page.goto('http://localhost:3193/gacha');
      return page.evaluate(() => window.__NEXT_DATA__.props.pageProps.banners[0].name === 'Runtime Banner B');
    }, `${name} updated banners`, 75_000);
    await waitFor(async () => {
      await page.goto('http://localhost:3193/stages/browse?s=runtime-stage');
      return (await page.locator('body').innerText()).includes('Runtime Stage B');
    }, `${name} new stage`, 75_000);
    active = 'a';
    await waitFor(async () => (await visit()).includes('Approved content release A'), `${name} rollback`);
    active = 'b'; corrupt = true;
    await waitFor(async () => (await visit()).includes('Approved content release A'), `${name} corrupt pointer retains previous content`);
    assert.deepEqual(errors, [], `${name} client errors`);
    console.log(`${name}: existing operator updated, new operator and stage appeared, banners updated, rollback and corruption fallback passed`);
    await context.close();
  }
  assert.equal(fs.readFileSync('.next/BUILD_ID', 'utf8'), buildId);
  console.log(`All runtime checks passed against unchanged production build ${buildId}`);
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await new Promise(resolve => source.close(resolve));
  fs.closeSync(log);
}
