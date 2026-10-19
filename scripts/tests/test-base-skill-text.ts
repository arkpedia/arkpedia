import test from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';
import type { NextRouter } from 'next/router';
import BaseSkillText from '../../components/operators/BaseSkillText';

// The tooltip closes on navigation (useAnchoredPopover), so it needs a router to listen to.
const router = { events: { on() {}, off() {} } } as unknown as NextRouter;
const render = (props: Parameters<typeof BaseSkillText>[0]) => renderToStaticMarkup(createElement(RouterContext.Provider, { value: router }, createElement(BaseSkillText, props)));

// tsx compiles the component's JSX to React.createElement (tsconfig keeps JSX for Next).
(globalThis as { React?: typeof React }).React = React;

const special = { text: "Closure's Special Order", term: 'cc.tra.closure', name: "Closure's Special Order", definition: 'Special Precious Metal orders offered by Closure that have fixed earnings' };

test('a base skill keyword is a button in the text, the numbers keep their highlight, and the first mention alone carries it', () => {
  const html = render({
    text: "order acquisition efficiency +10%, Closure's Special Order will be obtained (Closure's Special Order)", keywords: [special],
  });
  assert.equal((html.match(/class="btn-bare base-skill-keyword"/g) ?? []).length, 1);
  assert.match(html, /<button[^>]*class="btn-bare base-skill-keyword"[^>]*>Closure&#x27;s Special Order<\/button>/);
  assert.match(html, /<span class="op-stat-highlight">\+10%<\/span>/);
  assert.match(html, /\(Closure&#x27;s Special Order\)/, 'the repeat reads as plain words');
});

test('a description with no keywords renders as before, and none renders nothing', () => {
  assert.equal(render({ text: 'Morale +0.05', keywords: undefined }), 'Morale <span class="op-stat-highlight">+0</span>.<span class="op-stat-highlight">05</span>');
  assert.equal(render({ text: null, keywords: [special] }), '');
});
