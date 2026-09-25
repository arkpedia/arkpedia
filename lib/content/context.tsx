import { createContext, useCallback, useContext } from 'react';
import type { ContentRelease } from './types';
import { contentUrl } from './urls';

export const ContentContext = createContext<ContentRelease | null>(null);
export function useContentUrl() {
  const release = useContext(ContentContext);
  return useCallback((src: string) => contentUrl(src, release), [release]);
}

export const ContentTablesContext = createContext<Record<string, unknown>>({});
/** A table the page's props carry, or the bundled copy passed as `fallback`. Only for
 *  the tables that already had a bundled browser fallback; new ones use useReleaseTable. */
export function useContentTable<T>(name: string, fallback: T): T {
  const tables = useContext(ContentTablesContext);
  return (tables[name] as T | undefined) ?? fallback;
}
/** A table the page's props carry, with no bundled copy behind it. withContentPage
 *  attaches every table the route declares in lib/content/tables.mjs on every path, so a
 *  missing one is a page that never declared it -- said loudly rather than rendered empty. */
export function useReleaseTable<T>(name: string): T {
  const table = useContext(ContentTablesContext)[name];
  if (table == null) throw new Error(`This page's props carry no ${name} table; declare it in lib/content/tables.mjs and the page's withContentPage tables.`);
  return table as T;
}
