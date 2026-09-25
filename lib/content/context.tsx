import { createContext, useCallback, useContext } from 'react';
import type { ContentRelease } from './types';
import { contentUrl } from './urls';

export const ContentContext = createContext<ContentRelease | null>(null);
export function useContentUrl() {
  const release = useContext(ContentContext);
  return useCallback((src: string) => contentUrl(src, release), [release]);
}

export const ContentTablesContext = createContext<Record<string, unknown>>({});
/* There is no bundled fallback any more (useContentTable took one and answered from the last
   deploy whenever a table was missing): browser code may not import data/ at all
   (scripts/build/client-bundle-guard.cjs). */
/** A table the page's props carry, with no bundled copy behind it. withContentPage
 *  attaches every table the route declares in lib/content/tables.mjs on every path, so a
 *  missing one is a page that never declared it -- said loudly rather than rendered empty. */
export function useReleaseTable<T>(name: string): T {
  const table = useContext(ContentTablesContext)[name];
  if (table == null) throw new Error(`This page's props carry no ${name} table; declare it in lib/content/tables.mjs and the page's withContentPage tables.`);
  return table as T;
}
