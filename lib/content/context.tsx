import { createContext, useCallback, useContext } from 'react';
import type { ContentRelease } from './types';
import { contentUrl } from './urls';

export const ContentContext = createContext<ContentRelease | null>(null);
export function useContentUrl() {
  const release = useContext(ContentContext);
  return useCallback((src: string) => contentUrl(src, release), [release]);
}

export const ContentTablesContext = createContext<Record<string, unknown>>({});
export function useContentTable<T>(name: string, fallback: T): T {
  const tables = useContext(ContentTablesContext);
  return (tables[name] as T | undefined) ?? fallback;
}
