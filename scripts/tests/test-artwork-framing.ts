import test from 'node:test';
import assert from 'node:assert/strict';
import { alphaBox, posterView, visibleWorldBox, type ArtworkBox } from '../../lib/skins/artworkFraming';
import type { View } from '../../lib/skins/dynamicArt';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
function project(view: View, aspect: number, box: ArtworkBox): ArtworkBox {
  return { x: (box.x - view.x) / (view.height * aspect) + 0.5,
    y: (box.y - view.y) / view.height + 0.5, width: box.width / (view.height * aspect), height: box.height / view.height };
}

test('still alpha masks and WebGL masks use the same bottom-up coordinates', () => {
  const image = new Uint8Array(4 * 4 * 4);
  image[(0 * 4 + 1) * 4 + 3] = 255;
  image[(1 * 4 + 2) * 4 + 3] = 16;
  image[(3 * 4 + 3) * 4 + 3] = 15; // Do not frame barely visible edge noise.
  assert.deepEqual(alphaBox(image, 4, 4), { x: 0.25, y: 0.5, width: 0.5, height: 0.5 });
  const webgl = new Uint8Array(image.length);
  for (let row = 0; row < 4; row++) webgl.set(image.subarray(row * 16, row * 16 + 16), (3 - row) * 16);
  assert.deepEqual(alphaBox(webgl, 4, 4, true), alphaBox(image, 4, 4));
  assert.equal(alphaBox(new Uint8Array(16), 2, 2), null);
});

test('hidden setup attachments do not shrink or offset visible artwork', () => {
  const art = { x: 200, y: 30, width: 100, height: 50 };
  const poster = { x: 0.1, y: 0.2, width: 0.8, height: 0.5 };
  const aspect = 1.25;
  // The exporter can include unattached sleeves far to the left of the picture.
  for (const probe of [{ x: 0, y: 0, height: 1000, roll: 0 }, { x: -500, y: 0, height: 2000, roll: 0 }]) {
    const measured = visibleWorldBox(probe, aspect, project(probe, aspect, art));
    const aligned = project(posterView(measured, poster, aspect), aspect, art);
    for (const key of ['x', 'y', 'width', 'height'] as const) close(aligned[key], poster[key]);
  }
});

test('alignment contains a differently proportioned illustration without stretching or clipping', () => {
  const art = { x: -200, y: 50, width: 120, height: 90 };
  const poster = { x: 0.15, y: 0.1, width: 0.7, height: 0.8 };
  for (const aspect of [0.5, 1, 2]) {
    const view = posterView(art, poster, aspect), result = project(view, aspect, art);
    close(result.x + result.width / 2, poster.x + poster.width / 2);
    close(result.y + result.height / 2, poster.y + poster.height / 2);
    assert.ok(result.width <= poster.width + 1e-9 && result.height <= poster.height + 1e-9);
    close(result.width * aspect / result.height, art.width / art.height);
    assert.equal(view.roll, 0);
  }
});
