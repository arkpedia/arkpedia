import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrivalOf } from '../../lib/ui/imageArrival';

/*
 * lib/ui/imageArrival's sorting (r11 quiet polish, docs/development/ui-primitives.md
 * rule 23): only an image that has drawn nothing is held for its fade, so holding it
 * changes nothing on screen, and an image already in when it enters the page is never
 * faded (the browser half is tests/browser/motion.spec.ts).
 */

const img = (complete: boolean, naturalWidth: number) => ({ complete, naturalWidth });

test('an image the browser already has is shown as it is, not faded', () => {
  // The server's, found when the watch starts after hydration, and one put in later whose
  // picture is in already: the operator artwork's cross-fade puts the outgoing picture in
  // again inside the box that fades it out, and a fade from nothing blinked it off.
  assert.equal(arrivalOf(img(true, 180)), 'shown');
});

test('an image whose size is known is drawing its first rows: shown as it is, never held', () => {
  // On a slow line the browser draws an image as its bytes come in; holding it, or fading
  // it from nothing at its load, would blank the half-drawn picture.
  assert.equal(arrivalOf(img(false, 180)), 'shown');
});

test('an image that has drawn nothing is held until it arrives', () => {
  assert.equal(arrivalOf(img(false, 0)), 'held');
});

test('a broken image, or one with no address, is shown: there is nothing to wait for', () => {
  assert.equal(arrivalOf(img(true, 0)), 'shown');
});
