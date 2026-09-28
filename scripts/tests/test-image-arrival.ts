import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrivalOf } from '../../lib/ui/imageArrival';

/*
 * lib/ui/imageArrival's sorting (r11 quiet polish, docs/development/ui-primitives.md
 * rule 23): only an image that has drawn nothing is held for its fade, so holding it
 * changes nothing on screen, and an image already there when the page hydrates is never
 * faded (the browser half is tests/browser/motion.spec.ts).
 */

const img = (complete: boolean, naturalWidth: number) => ({ complete, naturalWidth });

test('when the watch starts, what the server put in and has loaded is shown, not faded', () => {
  assert.equal(arrivalOf(img(true, 180), true), 'shown');
});

test('put in later, an image the browser already has fades in now', () => {
  // Its load event may already have gone (a picture loaded before it was put in).
  assert.equal(arrivalOf(img(true, 180), false), 'fade');
});

test('an image whose size is known is drawing its first rows: shown as it is, never held', () => {
  // On a slow line the browser draws an image as its bytes come in; holding it, or fading
  // it from nothing at its load, would blank the half-drawn picture.
  assert.equal(arrivalOf(img(false, 180), true), 'shown');
  assert.equal(arrivalOf(img(false, 180), false), 'shown');
});

test('an image that has drawn nothing is held until it arrives', () => {
  assert.equal(arrivalOf(img(false, 0), true), 'held');
  assert.equal(arrivalOf(img(false, 0), false), 'held');
});

test('a broken image, or one with no address, is shown: there is nothing to wait for', () => {
  assert.equal(arrivalOf(img(true, 0), true), 'shown');
  assert.equal(arrivalOf(img(true, 0), false), 'shown');
});
