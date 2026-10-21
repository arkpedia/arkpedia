import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sampledBands, texelsPremultiplied } from '../../lib/spine/premultipliedTexture';

// Every Spine renderer uploads its pages through lib/spine/premultipliedTexture.ts and draws
// premultiplied: spine-ts 3.8 blends Screen and Multiply slots as premultiplied whatever the flag,
// so a straight page drawn straight paints its transparent pixels (Mudrock's Silent Night DN06
// candle light, a solid yellow blob, 2026-10-20).
function sources(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'vendor' ? [] : sources(file);
    return /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

test('no renderer makes a Spine texture except through premultipliedTexture', () => {
  const offenders = ['components', 'lib', 'pages'].flatMap(sources)
    .filter(file => file !== path.join('lib', 'spine', 'premultipliedTexture.ts'))
    .filter(file => /new\s+spine\.webgl\.GLTexture\s*\(/.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, []);
});

test('every skeleton is drawn premultiplied', () => {
  const offenders = ['components', 'lib', 'pages'].flatMap(sources).flatMap(file => {
    const text = fs.readFileSync(file, 'utf8');
    return [...text.matchAll(/\.drawSkeleton\(\s*[\w.]+\s*,\s*([^,)]+)/g)].filter(match => match[1].trim() !== 'true').map(match => `${file}: ${match[0]}`);
  });
  assert.deepEqual(offenders, []);
});

// Whether a page is premultiplied is read from its texels, not a manifest flag: the SD manifest
// called Kal'tsit the Esperanta's straight battle pages premultiplied (2026-10-21), so they went up
// straight and drew the colour their transparent pixels hold, an opaque yellow-white patch behind her.
// These soft discs stand in for her F_G_Light glow: colour fading out over alpha, as each kind of file holds it.
function disc(size: number, premultiplied: boolean): Uint8Array {
  const texels = new Uint8Array(size * size * 4);
  const colour = [255, 240, 90];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const alpha = Math.max(0, Math.round(255 * (1 - Math.hypot(x - size / 2, y - size / 2) / (size / 3))));
    const i = (y * size + x) * 4;
    // A straight export keeps the glow's colour under alpha 0; a premultiplied one cannot.
    for (let c = 0; c < 3; c++) texels[i + c] = premultiplied ? Math.round(colour[c] * alpha / 255) : colour[c];
    texels[i + 3] = alpha;
  }
  return texels;
}

test('a straight page is told from a premultiplied one by its texels', () => {
  assert.equal(texelsPremultiplied(disc(64, false)), false);
  assert.equal(texelsPremultiplied(disc(64, true)), true);
  // A little compression noise under alpha 0 is not colour.
  const noisy = disc(64, true);
  for (let i = 0; i < noisy.length; i += 4 * 7) if (noisy[i + 3] === 0) noisy[i] = 12;
  assert.equal(texelsPremultiplied(noisy), true);
  // Nor is a stray coloured texel or two on a premultiplied page.
  const stray = disc(64, true);
  stray.set([255, 255, 255, 0], 0);
  assert.equal(texelsPremultiplied(stray), true);
  // A page with no transparent texel is left as it is.
  assert.equal(texelsPremultiplied(new Uint8Array([200, 100, 50, 255, 10, 10, 10, 255])), true);
});

test('large pages are read back in bands that stay inside the page', () => {
  assert.deepEqual(sampledBands(528, 528), [[0, 528]]);
  for (const [width, height] of [[4096, 4096], [8192, 2048], [2048, 8192], [1 << 21, 4]]) {
    const bands = sampledBands(width, height);
    const rows = bands.reduce((sum, [, count]) => sum + count, 0);
    assert.ok(rows * width <= 1 << 20 || bands.every(([, count]) => count === 1), `${width}x${height} reads ${rows} rows`);
    for (const [y, count] of bands) assert.ok(y >= 0 && count >= 1 && y + count <= height, `${width}x${height}: ${y}+${count}`);
    const [lastY, lastCount] = bands.at(-1)!;
    assert.equal(lastY + lastCount, height, 'the last band reaches the last row');
  }
});

test('no renderer hands premultipliedTexture a manifest flag', () => {
  const offenders = ['components', 'lib', 'pages'].flatMap(sources)
    .filter(file => file !== path.join('lib', 'spine', 'premultipliedTexture.ts'))
    .flatMap(file => [...fs.readFileSync(file, 'utf8').matchAll(/premultipliedTexture\(([^)]*)\)/g)]
      .filter(match => match[1].split(',').length !== 3).map(match => `${file}: ${match[0]}`));
  assert.deepEqual(offenders, []);
});
