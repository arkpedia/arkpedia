import { useEffect, useState } from 'react';
import { isManagedPage, type ManagedPage, type PublicPageVisibility } from './settings';

const UNLISTED: ManagedPage[] = [];

export function usePageVisibility(enabled = true): readonly ManagedPage[] {
  const [listed, setListed] = useState<ManagedPage[]>(UNLISTED);
  useEffect(() => {
    if (!enabled) { setListed(UNLISTED); return; }
    const controller = new AbortController();
    let timer: number;
    let loading = false;
    async function read() {
      if (document.hidden || loading) return;
      loading = true;
      window.clearTimeout(timer);
      let delay = 60_000;
      try {
        const response = await fetch('/api/page-visibility', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Page visibility could not be loaded');
        const next: PublicPageVisibility = await response.json();
        if (controller.signal.aborted) return;
        const pages = next.listed.filter(isManagedPage);
        setListed(previous =>
          previous.length === pages.length && previous.every((id, index) => id === pages[index]) ? previous : pages);
        if (Number.isFinite(next.refreshAfterMs)) delay = Math.max(100, Math.min(delay, next.refreshAfterMs));
      } catch {
        if (!controller.signal.aborted) setListed(UNLISTED);
      } finally {
        loading = false;
        if (!controller.signal.aborted) timer = window.setTimeout(read, delay);
      }
    }
    void read();
    window.addEventListener('focus', read);
    document.addEventListener('visibilitychange', read);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      window.removeEventListener('focus', read);
      document.removeEventListener('visibilitychange', read);
    };
  }, [enabled]);
  return enabled ? listed : UNLISTED;
}
