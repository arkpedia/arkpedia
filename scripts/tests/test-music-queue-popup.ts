import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NextRouter } from 'next/router';
import { isQueuePanelOpen, queuePanelHref } from '../../lib/music/queuePanelHref';

const router = (pathname: string, query: NextRouter['query'], asPath = pathname) => ({ pathname, query, asPath }) as NextRouter;

test('opening and closing the queue preserves the Music view, filters and fragment', () => {
  const current = router('/music', { view: 'library', scope: 'favorites', q: 'Paper Boat' }, '/music?view=library&scope=favorites&q=Paper%20Boat#songs');
  const opened = queuePanelHref(current);
  assert.deepEqual(opened, { pathname: '/music', query: { ...current.query, panel: 'queue' }, hash: 'songs' });
  assert.equal(isQueuePanelOpen(opened), true);
  assert.deepEqual(queuePanelHref(router(opened.pathname, opened.query, current.asPath), false), { pathname: current.pathname, query: current.query, hash: 'songs' });
});

test('queue on ordinary pages does not overwrite their own panel or filters', () => {
  const current = router('/account', { panel: 'friends', q: 'test' });
  const opened = queuePanelHref(current);
  assert.deepEqual(opened, { pathname: '/account', query: { panel: 'friends', q: 'test', musicQueue: '1' } });
  assert.equal(isQueuePanelOpen(opened), true);
  assert.deepEqual(queuePanelHref(router(opened.pathname, opened.query), false), { pathname: current.pathname, query: current.query });
  assert.equal(isQueuePanelOpen(current), false);
});

test('legacy full-page queue links open the popup over a normal Music view', () => {
  const legacy = router('/music', { view: 'queue' });
  assert.equal(isQueuePanelOpen(legacy), true);
  assert.deepEqual(queuePanelHref(legacy), { pathname: '/music', query: { view: 'player', panel: 'queue' } });
  assert.deepEqual(queuePanelHref(router('/music', { view: 'queue', playlist: 'mine' })), { pathname: '/music', query: { view: 'library', playlist: 'mine', panel: 'queue' } });
});
