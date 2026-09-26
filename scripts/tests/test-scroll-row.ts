import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import ScrollRow from '../../components/ui/ScrollRow';

(globalThis as { React?: typeof React }).React = React;

// The /skins "Available now" shelf had previous/next arrows (kukki PR #66) until it moved
// onto the shared ScrollRow, which had none: a mouse with only a vertical wheel had the
// drawn bar alone, and iOS, which ignores ::-webkit-scrollbar, had nothing to see. ScrollRow
// now draws the pair on request. What a click does is checked in a browser
// (tests/browser/skins.spec.ts); this pins the markup the server sends.
const cards = Array.from({ length: 3 }, (_, i) => createElement('div', { key: i }, `Card ${i}`));
const render = (controls?: boolean) => renderToString(createElement(ScrollRow, { label: 'Outfits available now', controls }, cards));

test('with controls, the row gets a named previous/next pair, both disabled and hidden until measured', () => {
  const html = render(true);
  const buttons = html.match(/<button[^>]*>/g) ?? [];
  assert.equal(buttons.length, 2, html);
  const id = html.match(/<div id="([^"]+)" class="scroll-row sidescroll"/)?.[1];
  assert.ok(id, 'the row has an id for the buttons to control');
  assert.match(buttons[0], /aria-label="Scroll back through Outfits available now"/);
  assert.match(buttons[1], /aria-label="Scroll on through Outfits available now"/);
  for (const button of buttons) {
    assert.ok(button.includes(`aria-controls="${id}"`) && button.includes('disabled=""') && button.includes('class="ghost btn-sm"'), button);
  }
  // Server and first client render agree: nothing is measured yet, so the pair keeps its
  // space but is hidden (styles/core/shared.css).
  assert.match(html, /<div class="scroll-row-controls" data-idle="">/);
  assert.match(fs.readFileSync('styles/core/shared.css', 'utf8'), /\.scroll-row-controls\[data-idle\] \{ visibility: hidden; \}/);
});

test('without controls, the row is as it was: no buttons, no id', () => {
  const html = render();
  assert.doesNotMatch(html, /<button/);
  assert.match(html, /^<div class="scroll-row sidescroll">/);
});

test('the /skins shelf asks for the controls', () => {
  assert.match(fs.readFileSync('pages/skins.tsx', 'utf8'), /<ScrollRow label="Outfits available now" controls>/);
});
