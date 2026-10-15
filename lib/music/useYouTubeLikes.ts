import { useEffect, useState } from 'react';
import { validYouTubeLikes, type YouTubeLikes } from './youtubeLikes';

/** Runtime data, independent of the content release and with no credentials in the client. */
export function useYouTubeLikes() {
  const [data, setData] = useState<YouTubeLikes | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/music/youtube-likes', { signal: controller.signal });
        if (!response.ok) throw new Error('Unavailable');
        const result: unknown = await response.json();
        if (!validYouTubeLikes(result, Date.now())) throw new Error('Unavailable');
        if (!controller.signal.aborted) setData(result);
      } catch { /* Ordinary browsing still works when YouTube is unavailable. */ }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, []);
  return { data, loading };
}
