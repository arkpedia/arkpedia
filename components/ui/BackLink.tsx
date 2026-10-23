import type { MouseEvent } from 'react';
import Router from 'next/router';
import { previousPage } from '@/lib/nav/pageTrail';
import { restoreScrollOnReturn } from '@/lib/nav/scrollRestoration';

/**
 * A detail page's Back: to the page this tab showed before it (lib/nav/pageTrail.ts),
 * else -- a link opened directly, or no storage -- to the list the page belongs to (`href`,
 * named by `label`). A real link to that list, so it works before the script runs and opens a
 * new tab on a modified click. Drawn as every back on the site is (.back-btn, "‹ Back"): the
 * sheets' and panels' in-page ones and this page-level one alike. A page renders it through
 * PageHeader's `back` and nowhere else, because the header's class is what places it
 * (.page-header > .back-btn: room under it, its own width); scripts/tests/test-page-trail.ts
 * fails on any other importer.
 */
export default function BackLink({ href, label }: { href: string; label: string }) {
  // The router singleton, used only on a press: no hook, so the link renders anywhere,
  // a test's server render included.
  function goBack(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const destination = previousPage() ?? href;
    restoreScrollOnReturn(destination);
    void Router.push(destination);
  }
  return (
    <a className="back-btn" href={href} onClick={goBack} title={`Back (or to ${label})`}>
      ‹ Back
    </a>
  );
}
