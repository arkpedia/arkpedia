import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import XButton from '../../components/ui/XButton';

/*
 * components/ui/XButton as the server renders it (ui-primitives rule 21; the rendered
 * look -- no border, square, the press off the glyph -- is tests/browser/x-buttons.spec.ts).
 * A × is a button with a name, never a submit, drawn as a path, and a page's class only
 * adds to .btn-x: it never replaces it.
 */

(globalThis as { React?: typeof React }).React = React;

const render = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(XButton, props as never));

test('a × is a named button of type button, drawn as a path', () => {
  const html = render({ label: 'Close banner details', onClick: () => {} });
  assert.match(html, /^<button type="button" aria-label="Close banner details" class="btn-x">/);
  assert.match(html, /<svg aria-hidden="true" focusable="false" viewBox="0 0 16 16"[^>]*><path d="m4 4 8 8M12 4l-8 8"><\/path><\/svg><\/button>$/);
  assert.doesNotMatch(html, /[×✕✖]/, 'no text glyph: its line differs from face to face');
});

test('dense and a page class add to .btn-x, and the caller cannot make it a submit or rename it', () => {
  const html = render({ label: 'Remove Amiya', dense: true, className: 'base-room-team-x', type: 'submit', 'aria-label': 'x', title: 'Remove Amiya' });
  assert.match(html, /type="button"/);
  assert.doesNotMatch(html, /type="submit"/);
  assert.match(html, /aria-label="Remove Amiya"/);
  assert.match(html, /class="btn-x btn-x-dense base-room-team-x"/);
  assert.match(html, /title="Remove Amiya"/);
});

test('the ref reaches the button, for a dialog that focuses its close', () => {
  const ref = createRef<HTMLButtonElement>();
  // Server rendering does not attach refs; this holds the component to forwardRef's type.
  const html = renderToStaticMarkup(createElement(XButton, { label: 'Close', ref }));
  assert.match(html, /^<button /);
  assert.equal(typeof (XButton as unknown as { render?: unknown }).render, 'function', 'XButton forwards its ref');
});
