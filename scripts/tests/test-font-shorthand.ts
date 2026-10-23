import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error a plain .mjs module, no types
import { fontShorthandPx } from '../audits/font-shorthand.mjs';

/*
 * audit-styles.mjs's fontSizes key reads the size in `font:` shorthands too: eight
 * off-scale sizes on /pull-planner hid in `font: 600 23px/1.2 var(--font-display)` and the like,
 * where a `font-size:` scan never looked.
 */
test('the size is read from a font shorthand, with or without a line height', () => {
  assert.equal(fontShorthandPx('700 20px var(--font-display)'), 20);
  assert.equal(fontShorthandPx('600 23px/1.2 var(--font-display)'), 23);
  assert.equal(fontShorthandPx("italic small-caps 600 13px/1.4 'Inter', sans-serif"), 13);
  assert.equal(fontShorthandPx('500 12.5px var(--font-mono)'), 12.5);
});

test('a shorthand without a px size has none', () => {
  assert.equal(fontShorthandPx('inherit'), null);
  assert.equal(fontShorthandPx('var(--font-body)'), null);
  assert.equal(fontShorthandPx('600 1.2rem var(--font-display)'), null);
  assert.equal(fontShorthandPx("'Font 12px', sans-serif"), null);
});
