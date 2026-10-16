import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deadResponsiveOverrides } from '../audits/dead-responsive-overrides.mjs';

const check = (a, b) => deadResponsiveOverrides([{ file: 'shared.css', css: a }, { file: 'feature.css', css: b }]);

test('a later global rule defeats only the matching responsive property', () => {
  const found = check('@media (max-width: 700px) { .card { padding: 4px; display: grid; } }', '.card { padding: 12px; }');
  assert.deepEqual(found.map((f) => [f.selector, f.property, f.winner]), [['.card', 'padding', 'feature.css']]);
});

test('important priority is independent of stylesheet order', () => {
  const early = '@media (max-width: 700px) { .card { padding: 4px !important; } }';
  assert.equal(check(early, '.card { padding: 12px; }').length, 0);
  assert.equal(check(early, '.card { padding: 12px !important; }').length, 1);
  assert.equal(check(early, '.card { padding: 12px !important; } .card { padding: 8px; }').length, 1);
});

test('conditional later rules and different selectors do not prove a dead override', () => {
  const early = '@media (max-width: 700px) { .card { padding: 4px; } }';
  assert.equal(check(early, '@media (min-width: 800px) { .card { padding: 12px; } }').length, 0);
  assert.equal(check(early, '@supports (display: grid) { .card { padding: 12px; } }').length, 0);
  assert.equal(check(early, '.page .card { padding: 12px; }').length, 0);
});

test('layers and keyframes are excluded; nested media queries remain detectable', () => {
  assert.equal(check('@layer shared { @media (max-width: 700px) { .card { padding: 4px; } } }', '.card { padding: 12px; }').length, 0);
  assert.equal(check('@keyframes pulse { from { opacity: 0; } }', 'from { opacity: 1; }').length, 0);
  assert.equal(check('@media screen { @media (max-width: 700px) { .card { padding: 4px; } } }', '.card { padding: 12px; }').length, 1);
});

test('selector lists respect functional selectors and quoted attribute commas', () => {
  const found = check('@media print { .card:is(.a, .b), [data-name="a,b"] { width: 10px; } }', '.card:is(.a, .b) { width: 20px; }');
  assert.deepEqual(found.map((f) => f.selector), ['.card:is(.a, .b)']);
});

test('a later unconditional rule in the same sheet also defeats a media override', () => {
  assert.equal(check('@media print { .card { width: 10px; } } .card { width: 20px; }', '').length, 1);
  assert.equal(check('.card { width: 20px; } @media print { .card { width: 10px; } }', '').length, 0);
});

test('semicolons in quoted values do not invent properties', () => {
  assert.equal(check('@media print { .card { content: "label; width: 10px"; } }', '.card { width: 20px; }').length, 0);
});

test('an identically named later media rule stays live after an unconditional override', () => {
  const found = check('@media print { .card { width: 10px; } } .card { width: 20px; } @media print { .card { width: 10px; } }', '');
  assert.equal(found.length, 1);
  assert.equal(found[0].ruleIndex, 0, 'only the earlier occurrence is dead');
});
