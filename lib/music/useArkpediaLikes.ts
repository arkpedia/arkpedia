import { useEffect, useState } from 'react';
import { validArkpediaLikes, type ArkpediaLikes } from './arkpediaLikes';

/** Runtime data, independent of the content release and with no credentials in the client. */
export function useArkpediaLikes() {
  const [data, setData] = useState<ArkpediaLikes | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/music/likes', { signal: controller.signal });
        if (!response.ok) throw new Error('Unavailable');
        const result: unknown = await response.json();
        if (!validArkpediaLikes(result)) throw new Error('Unavailable');
        if (!controller.signal.aborted) setData(result);
      } catch { /* Ordinary browsing still works when the chart is unavailable. */ }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, []);
  return { data, loading };
}
