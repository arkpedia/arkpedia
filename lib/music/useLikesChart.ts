import { useEffect, useState } from 'react';
import { validYouTubeLikes } from './youtubeLikes';
import { validArkpediaLikes, type ArkpediaLikes } from './arkpediaLikes';

/** Runtime data, independent of the content release and with no credentials in the client. */
export function useLikesChart(source: 'Arkpedia' | 'YouTube') {
  const [data, setData] = useState<ArkpediaLikes | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const options = { signal: controller.signal };
        const response = source === 'Arkpedia' ? await fetch('/api/music/likes', options) : await fetch('/api/music/youtube-likes', options);
        if (!response.ok) throw new Error('Unavailable');
        const result: unknown = await response.json();
        if (controller.signal.aborted) return;
        if ((source === 'Arkpedia' && validArkpediaLikes(result)) || (source === 'YouTube' && validYouTubeLikes(result, Date.now()))) setData(result);
      } catch { /* Ordinary browsing still works when the chart is unavailable. */ }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [source]);
  return { data, loading };
}
