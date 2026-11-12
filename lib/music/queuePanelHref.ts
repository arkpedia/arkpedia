import type { NextRouter } from 'next/router';

export function isQueuePanelOpen(router: Pick<NextRouter, 'pathname' | 'query'>) {
  if (router.pathname === '/music') return router.query.panel === 'queue' || router.query.view === 'queue';
  if (router.pathname === '/music/discover') return router.query.panel === 'queue';
  return router.query.musicQueue === '1';
}

export function queuePanelHref(router: NextRouter, open = true) {
  const query = { ...router.query };
  const musicPage = router.pathname === '/music' || router.pathname === '/music/discover';
  if (router.pathname === '/music' && query.view === 'queue') query.view = query.scope || query.playlist ? 'library' : 'player';
  const key = musicPage ? 'panel' : 'musicQueue';
  if (open) query[key] = musicPage ? 'queue' : '1';
  else delete query[key];
  const hash = router.asPath?.split('#')[1];
  return { pathname: router.pathname, query, ...(hash ? { hash } : {}) };
}
