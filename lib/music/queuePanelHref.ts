import type { NextRouter } from 'next/router';

export function queuePanelHref(router: NextRouter, open = true) {
  const query = { ...router.query };
  if (open) query.panel = 'queue';
  else delete query.panel;
  return { pathname: router.pathname, query };
}
