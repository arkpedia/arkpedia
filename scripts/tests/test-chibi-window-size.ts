import test from 'node:test';
import assert from 'node:assert/strict';
import { resizeChibiWindow, type ChibiWindowEdge } from '../../lib/operators/chibiWindowSize';

const initial = { x: 120, y: 100, width: 380, height: 400 };
const viewport = { width: 1280, height: 720 };

test('each edge and corner keeps its opposite edges anchored', () => {
  for (const edge of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as ChibiWindowEdge[]) {
    const next = resizeChibiWindow(initial, edge, 30, 25, viewport);
    if (edge.includes('w')) assert.equal(next.x + next.width, initial.x + initial.width, edge);
    else assert.equal(next.x, initial.x, edge);
    if (edge.includes('n')) assert.equal(next.y + next.height, initial.y + initial.height, edge);
    else assert.equal(next.y, initial.y, edge);
    if (!/[ew]/.test(edge)) assert.equal(next.width, initial.width, edge);
    if (!/[ns]/.test(edge)) assert.equal(next.height, initial.height, edge);
  }
});

test('large drags cannot flip the window or move it outside the viewport', () => {
  for (const edge of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as ChibiWindowEdge[]) {
    for (const delta of [-10000, 10000]) {
      const next = resizeChibiWindow(initial, edge, delta, delta, viewport);
      assert.ok(next.width >= 300 && next.height >= 320, edge);
      assert.ok(next.x >= 8 && next.y >= 8, edge);
      assert.ok(next.x + next.width <= viewport.width - 8, edge);
      assert.ok(next.y + next.height <= viewport.height - 8, edge);
    }
  }
});

test('minimum size adapts to a short phone viewport', () => {
  const phone = { width: 320, height: 280 };
  const next = resizeChibiWindow({ x: 8, y: 8, width: 304, height: 264 }, 'se', -10000, -10000, phone);
  assert.deepEqual(next, { x: 8, y: 8, width: 300, height: 264 });
});

test('resizing out and back restores the starting size', () => {
  const bigger = resizeChibiWindow(initial, 'se', 100, 80, viewport);
  assert.deepEqual(resizeChibiWindow(bigger, 'se', -100, -80, viewport), initial);
});
