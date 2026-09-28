import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Tabs, { panelId, tabId, tabPanelProps } from '../../components/ui/Tabs';

/*
 * components/ui/Tabs as the server renders it (the browser half -- the keyboard, the
 * panels, the planner's Delete -- is tests/browser/tabs.spec.ts). The markup is what a
 * screen reader gets before any script runs, and it has to be the same markup the
 * browser hydrates: ids from props, never from useId or a counter.
 */

// tsx compiles the components' JSX to React.createElement (tsconfig keeps JSX for Next).
(globalThis as { React?: typeof React }).React = React;

const render = (value: string, extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(Tabs<string>, {
  label: 'Event sections',
  id: 'event-section',
  value,
  onChange: () => {},
  options: [
    { value: 'banner', label: 'Banner' },
    { value: 'rewards', label: 'Rewards', count: 12 },
    { value: 'skins', label: 'Skins', disabled: true },
  ],
  ...extra,
}));

const tabs = (html: string) => [...html.matchAll(/<button([^>]*)>/g)].map((m) => Object.fromEntries(
  [...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]),
));

test('the strip is a named tablist of tabs, each naming its panel', () => {
  const html = render('rewards');
  assert.match(html, /^<div role="tablist" aria-label="Event sections" class="tabs">/);
  const list = tabs(html);
  assert.equal(list.length, 3);
  for (const [i, value] of ['banner', 'rewards', 'skins'].entries()) {
    assert.equal(list[i].role, 'tab');
    assert.equal(list[i].id, tabId('event-section', value));
    assert.equal(list[i]['aria-controls'], panelId('event-section', value));
    assert.equal(list[i].class, 'btn-bare tab', 'the tab look, and none of the base button rule');
  }
  assert.deepEqual(list.map((t) => t['aria-selected']), ['false', 'true', 'false']);
  assert.match(html, /Rewards<span class="tab-count">12<\/span>/);
  assert.ok('disabled' in list[2]);
});

test('one Tab stop: the current tab, or the first enabled one when none is current', () => {
  assert.deepEqual(tabs(render('rewards')).map((t) => t.tabindex), ['-1', '0', '-1']);
  assert.deepEqual(tabs(render('nothing-yet')).map((t) => t.tabindex), ['0', '-1', '-1']);
});

test('ids come from the props alone: no counter and no useId, so hydration matches', () => {
  // A module-level counter makes a second render differ from the first. useId does not
  // (two server renders give the same :R...: ids), but its ids never match what the
  // browser's own tree gives a component rendered in a different place, and they carry
  // colons: every id and every id reference here is the `id` prop's stem.
  const html = render('banner');
  assert.equal(html, render('banner'), 'a second render is the same markup');
  const refs = [...html.matchAll(/\b(?:id|aria-controls|aria-labelledby|aria-describedby)="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 6, 'the tabs carry ids and name their panels');
  for (const ref of refs) assert.match(ref, /^event-section-/, `${ref} comes from the id prop`);
  assert.doesNotMatch(html, /="[^"]*:[rR][^"]*"/, 'no useId-style :r0: id');
});

test('a panel names its tab, and odd values still make valid ids', () => {
  assert.deepEqual(tabPanelProps('planner-operator', 'Amiya (Guard)'), {
    id: 'planner-operator-panel-Amiya__Guard_',
    role: 'tabpanel',
    'aria-labelledby': 'planner-operator-tab-Amiya__Guard_',
  });
  assert.equal(tabId('planner-operator', ''), 'planner-operator-tab-');
});

test('removable tabs say Delete removes them, except the one that stays', () => {
  const html = render('banner', { removable: { onRemove: () => {}, label: (o: { value: string }) => (o.value === 'banner' ? null : `Remove ${o.value}`) } });
  const list = tabs(html);
  assert.equal(list[0]['aria-keyshortcuts'], undefined);
  assert.equal(list[1]['aria-keyshortcuts'], 'Delete Backspace');
  assert.equal(list[1]['aria-describedby'], 'event-section-remove-hint');
  // The × is the × buttons' drawn glyph (components/ui/XButton's XGlyph), not a "×" in
  // whatever face the tab has: the span holds the one path and nothing else.
  assert.match(html, /<span class="tab-remove" aria-hidden="true" title="Remove rewards"><svg aria-hidden="true"[^>]*><path d="m4 4 8 8M12 4l-8 8"><\/path><\/svg><\/span>/);
  assert.match(html, /<span id="event-section-remove-hint" hidden="">Press Delete to remove it\.<\/span>/);
  assert.doesNotMatch(html, /<button[^>]*>[^<]*<button/, 'no button inside a tab');
});
