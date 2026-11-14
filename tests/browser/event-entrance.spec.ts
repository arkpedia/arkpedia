import { expect, test, type Page } from '@playwright/test';
import { stubYouTube, youtube } from './youtube-stub';
import { signedHeads, stubMonsterSiren } from './monster-siren-stub';

const eventPath = '/events/' + encodeURIComponent("[Rerun] The Masses' Travels Rerun");
const dialog = (page: Page) => page.getByRole('dialog', { name: "Opening The Masses' Travels" });
// A short, data-only native timeline keeps lifecycle tests independent of CDN availability.
// Real recovered shader/art packs are reviewed separately on the checked-source Preview.
const scene = { schemaVersion: 1, width: 1280, height: 720, duration: 4,
  clip: 'fixture', nodes: [], curves: [], textures: [], materials: [], shaders: [],
  sound: { file: 'entrance.wav', offset: .05, duration: .1 } };
async function media(page: Page, fail: boolean | 'slow' = false) {
  const requests: string[] = [];
  const wav = Buffer.alloc(44 + 9600);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(96000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(9600, 40);
  await page.route('**/event-transitions/players/**', async route => {
    const file = new URL(route.request().url()).pathname.split('/').at(-1)!;
    requests.push(file);
    if (file === 'menu.webp' && fail !== true) return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1cAAAAASUVORK5CYII=', 'base64') });
    if (fail === 'slow') await new Promise(resolve => setTimeout(resolve, 2500));
    if (fail) return route.fulfill({ status: 404, body: 'unavailable' });
    if (file === 'scene.json') return route.fulfill({ json: scene });
    return route.fulfill({ contentType: 'audio/wav', body: wav });
  });
  return requests;
}
async function open(page: Page) {
  await page.goto('/schedule');
  const link = page.locator(`a[href="${eventPath}"]`).first();
  await expect(link).toBeVisible();
  return link;
}
async function unlocked(page: Page) {
  await expect(dialog(page)).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).not.toBe('hidden');
  await expect.poll(() => page.evaluate(() => document.documentElement.style.scrollbarGutter)).toBe('');
}
for (const theme of ['dark', 'light']) {
  test(`native entrance uses the viewport, docks and leaves Back usable (${theme})`, async ({ page }) => {
    const requests = await media(page);
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    const link = await open(page); await link.click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toHaveAttribute('data-phase', 'playing');
    const bounds = await dialog(page).boundingBox();
    const viewport = page.viewportSize()!;
    expect(Math.abs(bounds!.width - viewport.width)).toBeLessThan(2);
    expect(Math.abs(bounds!.height - viewport.height)).toBeLessThan(2);
    expect(await page.evaluate(() => document.elementFromPoint(innerWidth - 2, innerHeight / 2)?.tagName)).toBe('CANVAS');
    await expect(dialog(page)).toHaveAttribute('data-phase', 'docking');
    await unlocked(page);
    await expect(page.locator('[data-event-entrance-art="act42sre"] img')).toHaveAttribute('src', /menu.webp/);
    expect(requests).not.toContain('entrance.wav'); // Audio is opt-in.
    await page.goBack(); await expect(page).toHaveURL(/\/schedule$/); await unlocked(page);
    await page.goForward(); await expect(page).toHaveURL(/\/events\//); await unlocked(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
test('skip and Escape release the modal, focus and scroll lock', async ({ page }) => {
  await media(page);
  let link = await open(page); await link.focus(); await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeVisible(); await page.keyboard.press('Escape'); await unlocked(page);
  await expect(page.locator('#page-content')).toBeFocused();
  await expect(page).toHaveURL(/\/events\//); await page.goBack(); await expect(page).toHaveURL(/\/schedule$/); link = page.locator(`a[href="${eventPath}"]`).first(); await link.click();
  await expect(dialog(page)).toBeVisible(); await page.getByRole('button', { name: 'Skip intro', exact: true }).click();
  await unlocked(page); await expect(page.locator('#page-content')).toBeFocused();
});
test('reduced motion avoids the entrance and its downloads', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const requests = await media(page); const link = await open(page); await link.click();
  await expect(page).toHaveURL(/\/events\//); await unlocked(page);
  expect(requests).not.toContain('scene.json');
});
test('missing entrance assets leave a usable event page', async ({ page }) => {
  await media(page, true); const link = await open(page); await link.click();
  await expect(page).toHaveURL(/\/events\//); await unlocked(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText("Masses' Travels");
  await expect(page.locator('.event-page-art img')).not.toHaveAttribute('src', /menu.webp/);
});
test('Back and a reduced-motion change cancel an active entrance', async ({ page }) => {
  await media(page); const link = await open(page); await link.click();
  await expect(dialog(page)).toHaveAttribute('data-phase', 'playing');
  await expect(page).toHaveURL(/\/events\//); await page.goBack(); await expect(page).toHaveURL(/\/schedule$/); await unlocked(page);
  await page.locator(`a[href="${eventPath}"]`).first().click();
  await expect(dialog(page)).toHaveAttribute('data-phase', 'playing');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await unlocked(page);
});
test('cold-tap SFX waits for its download, uses its cue and holds event music', async ({ page }) => {
  await stubYouTube(page, 'allow', { mediaConsent: true, dataSaver: true });
  await page.addInitScript(() => {
    localStorage.setItem('arkpedia:settings', JSON.stringify({ version: 1, values: { eventMusic: true } }));
    const starts: number[] = []; Object.assign(window, { __entranceStarts: starts });
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(when = 0, ...rest) {
      starts.push(when - this.context.currentTime); return original.call(this, when, ...rest);
    };
  });
  const requests = await media(page);
  await page.route('**/entrance.wav', async route => {
    // Real cold taps can take longer than the old 120 ms sound-only deadline.
    await new Promise(resolve => setTimeout(resolve, 350));
    await route.fallback();
  });
  const link = await open(page); await link.click();
  await expect(dialog(page)).toHaveAttribute('data-phase', 'playing');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __entranceStarts: number[] }).__entranceStarts.length)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { __entranceStarts: number[] }).__entranceStarts[0])).toBeCloseTo(.05, 2);
  expect(requests).toContain('entrance.wav');
  expect(await page.evaluate(() => (window as unknown as { __pageYt?: { state: number } }).__pageYt?.state)).not.toBe(1);
  await unlocked(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __pageYt?: { state: number } }).__pageYt?.state)).toBe(1);
});

test('a slow pack cannot leave a blocking black screen', async ({ page }) => {
  await media(page, 'slow'); const link = await open(page); await link.click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toBeHidden({ timeout: 2300 });
  await expect(page).toHaveURL(/\/events\//); await unlocked(page);
});
test('modified event links leave the current page without an intro', async ({ page }) => {
  await media(page); const link = await open(page);
  await link.click({ modifiers: ['Control'] });
  await expect(page).toHaveURL(/\/schedule$/); await unlocked(page);
});

test('unavailable SFX leaves animation and theme handoff usable without an idle audio context', async ({ page }) => {
  await stubYouTube(page);
  await page.addInitScript(() => {
    localStorage.setItem('arkpedia:settings', JSON.stringify({ version: 1, values: { eventMusic: true } }));
    const contexts: AudioContext[] = []; Object.assign(window, { __entranceContexts: contexts });
    const resume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = function() { contexts.push(this); return resume.call(this); };
  });
  await media(page);
  await page.route('**/entrance.wav', route => route.fulfill({ status: 404, body: 'unavailable' }));
  const link = await open(page); await link.click();
  await expect(dialog(page)).toHaveAttribute('data-phase', 'playing');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __entranceContexts: AudioContext[] }).__entranceContexts[0]?.state)).toBe('suspended');
  await unlocked(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __pageYt?: { state: number } }).__pageYt?.state)).toBe(1);
});

test('official event music prepares its address under the intro and starts from the CDN at handoff', async ({ page }) => {
  await stubYouTube(page, 'allow', { dataSaver: false });
  const siren = await stubMonsterSiren(page); await signedHeads(page);
  await page.addInitScript(() => localStorage.setItem('arkpedia:settings', JSON.stringify({ version: 2, values: { eventMusic: true } })));
  await media(page); const link = await open(page); await link.click();
  await expect(dialog(page)).toHaveAttribute('data-phase', 'playing');
  await expect.poll(() => siren.links).toContain('232236');
  expect(siren.resolves).toEqual([]);
  expect(siren.cdn.filter(request => request.method === 'GET')).toEqual([]);
  await unlocked(page);
  await expect(page.locator('[data-page-audio]')).toHaveAttribute('data-page-audio', 'playing');
  expect(siren.resolves).toEqual([]);
  expect(siren.cdn.some(request => request.method === 'GET' && request.url.includes('/232236.wav'))).toBe(true);
});

test('native shader buffers, animated material values and soft masks render on the GPU', async ({ page }) => {
  await media(page);
  const transform = { name: 'mask', parent: null, active: true, alpha: 1, position: [0, 0], z: 0,
    size: [400, 400], pivot: [.5, .5], anchorMin: [.5, .5], anchorMax: [.5, .5], scale: [1, 1, 1], rotation: [0, 0, 0, 1] };
  const vertex = `#version 300 es
#define HLSLCC_ENABLE_UNIFORM_BUFFERS 1
#if HLSLCC_ENABLE_UNIFORM_BUFFERS
layout(std140) uniform UnityPerDraw { vec4 hlslcc_mtx4x4unity_ObjectToWorld[4]; };
#else
uniform vec4 hlslcc_mtx4x4unity_ObjectToWorld[4];
#endif
uniform vec4 hlslcc_mtx4x4unity_MatrixVP[4]; in vec4 in_POSITION0;
void main(){gl_Position=mat4(hlslcc_mtx4x4unity_MatrixVP[0],hlslcc_mtx4x4unity_MatrixVP[1],hlslcc_mtx4x4unity_MatrixVP[2],hlslcc_mtx4x4unity_MatrixVP[3])*mat4(hlslcc_mtx4x4unity_ObjectToWorld[0],hlslcc_mtx4x4unity_ObjectToWorld[1],hlslcc_mtx4x4unity_ObjectToWorld[2],hlslcc_mtx4x4unity_ObjectToWorld[3])*in_POSITION0;}`;
  const fragment = `#version 300 es
uniform vec4 _Tint; uniform vec2 _Offset; out vec4 result;
void main(){result=vec4(_Tint.r,_Offset.x,0.0,1.0);}`;
  await page.route('**/scene.json', route => route.fulfill({ json: { ...scene, nodes: [
    { ...transform, rectMask: true, maskSoftness: [80, 80] },
    { ...transform, name: 'art', parent: 0, size: [800, 800], localPosition: [0, 0, 0],
      uniforms: { _Tint: [0, 0, 0, 1], _Offset: [.75, 0, 0, 0] },
      image: { texture: null, rect: { x: 0, y: 0, width: 1, height: 1 }, offset: { x: 0, y: 0 }, spriteSize: [1, 1], border: [0, 0, 0, 0], color: [1, 1, 1, 1], material: 0, type: 0, preserveAspect: false, fill: 1, fillMethod: 0, clockwise: true, origin: 0 } },
  ], curves: [{ node: 1, property: 'uniforms._Tint.0', keys: [[0, 0, .25, .25, 0, 1/3, 1/3], [4, 1, .25, .25, 0, 1/3, 1/3]] }],
  shaders: [{ name: 'native buffer/mask fixture', vertex, fragment, defaults: {}, samplers: {}, blend: [{ name: '<noninit>', val: 5 }, { name: '<noninit>', val: 10 }] }],
  materials: [{ name: 'shared material', shader: 0, values: { _Tint: [1, 0, 0, 1] }, textures: {} }],
  } }));
  const link = await open(page); await link.click();
  await expect(dialog(page)).toHaveAttribute('data-phase', 'playing');
  await page.waitForTimeout(900);
  const pixels = await page.locator('.event-entrance canvas').evaluate(canvas => new Promise<{ center: number[]; edge: number[]; outside: number[]; error: number }>(resolve => {
    requestAnimationFrame(() => {
      const element = canvas as HTMLCanvasElement, gl = element.getContext('webgl2')!;
      const fit = Math.max(element.width / 1280, element.height / 720);
      const read = (y: number) => { const pixel = new Uint8Array(4); gl.readPixels(Math.floor(element.width / 2), Math.round(y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); return [...pixel]; };
      resolve({ center: read(element.height / 2), edge: read(element.height / 2 + 180 * fit), outside: read(1), error: gl.getError() });
    });
  }));
  expect(pixels.error).toBe(0);
  expect(pixels.center[0]).toBeGreaterThan(20); expect(pixels.center[0]).toBeLessThan(200);
  expect(pixels.center[1]).toBeCloseTo(191, -1);
  expect(pixels.edge[1]).toBeGreaterThan(20); expect(pixels.edge[1]).toBeLessThan(pixels.center[1] - 30);
  expect(pixels.outside.slice(0, 3)).toEqual([0, 0, 0]);
});

test('native channel masks reveal artwork without drawing masks or retaining the previous frame', async ({ page }) => {
  await media(page);
  const transform = { name: 'art', parent: null, active: true, alpha: 1, position: [0, 0], z: 0,
    size: [1280, 720], pivot: [.5, .5], anchorMin: [.5, .5], anchorMax: [.5, .5], scale: [1, 1, 1], rotation: [0, 0, 0, 1] };
  const image = (color: number[]) => ({ texture: null, rect: { x: 0, y: 0, width: 1, height: 1 }, offset: { x: 0, y: 0 }, spriteSize: [1, 1], border: [0, 0, 0, 0], color, material: null, type: 0, preserveAspect: false, fill: 1, fillMethod: 0, clockwise: true, origin: 0 });
  await page.route('**/scene.json', route => route.fulfill({ json: { ...scene, duration: 4, nodes: [
    { ...transform, image: image([0, 1, 0, 1]) },
    { ...transform, name: 'invisible channel writer', size: [200, 200], image: image([1, 0, 0, 1]), stencil: { compare: 0, operation: 2, readMask: 0, writeMask: 8, colorMask: 0 } },
    { ...transform, name: 'outside matte', image: image([0, 0, 0, 1]), stencil: { compare: 2, operation: 0, readMask: 8, writeMask: 0, colorMask: 15 } },
    { ...transform, name: 'inside artwork', size: [60, 60], image: image([0, 0, 1, 1]), stencil: { compare: 1, operation: 0, readMask: 8, writeMask: 0, colorMask: 15 } },
  ], textures: [], materials: [], shaders: [], curves: [{ node: 1, property: 'position.1', keys: [[0, 0, null, null, 0, 1/3, 1/3], [2, 250, null, null, 0, 1/3, 1/3]] }] } }));
  const link = await open(page); await link.click();
  await expect(dialog(page)).toHaveAttribute('data-phase', 'playing');
  const pixels = () => page.locator('.event-entrance canvas').evaluate(canvas => new Promise<{ center: number[]; edge: number[]; moved: number[]; error: number }>(resolve => requestAnimationFrame(() => {
    const element = canvas as HTMLCanvasElement, gl = element.getContext('webgl2')!, fit = Math.max(element.width / 1280, element.height / 720);
    const read = (y: number) => { const pixel = new Uint8Array(4); gl.readPixels(Math.floor(element.width / 2), Math.round(element.height / 2 + y * fit), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); return [...pixel].slice(0, 3); };
    resolve({ center: read(0), edge: read(70), moved: read(250), error: gl.getError() });
  })));
  await expect.poll(async () => (await pixels()).center).toEqual([0, 0, 255]);
  expect((await pixels()).edge).toEqual([0, 255, 0]);
  expect((await pixels()).moved).toEqual([0, 0, 0]);
  await expect.poll(async () => (await pixels()).moved, { timeout: 3000 }).toEqual([0, 255, 0]);
  const final = await pixels(); expect(final.center).toEqual([0, 0, 0]); expect(final.error).toBe(0);
  await page.keyboard.press('Escape'); await unlocked(page);
});


test('native entrance takes audio from a playing personal song and restores it on Back', async ({page}) => {
  await stubYouTube(page);
  await page.addInitScript(() => {
    localStorage.setItem('arkpedia:settings', JSON.stringify({ version: 3, values: { eventMusic: true } }));
    Object.assign(window, { __entranceStarts: [] as number[] });
    const start=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(when=0,...rest){
      (window as unknown as {__entranceStarts:number[]}).__entranceStarts.push(when-this.context.currentTime);
      return start.call(this,when,...rest);
    };
  });
  await media(page); await page.goto('/music?view=library');
  await page.locator('.music-library-row .music-song-row-main').first().click();
  await expect.poll(async()=>(await youtube(page))?.state).toBe(1);
  const song=(await youtube(page))!.videoId;
  await page.evaluate(()=>(window as unknown as {next:{router:{push:(path:string)=>Promise<void>}}}).next.router.push('/schedule'));
  await page.locator(`a[href="${eventPath}"]`).first().click();
  await expect(dialog(page)).toHaveAttribute('data-phase','playing');
  await expect.poll(async()=>(await youtube(page))?.state).toBe(2);
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {__entranceStarts:number[]}).__entranceStarts.length)).toBe(1);
  await unlocked(page);
  await expect(page.locator('[data-page-audio]')).toHaveAttribute('data-page-audio','playing');
  await page.goBack(); await expect(page).toHaveURL(/\/schedule$/);
  await expect.poll(async()=>(await youtube(page))?.state).toBe(1);
  expect((await youtube(page))?.videoId).toBe(song);
});
