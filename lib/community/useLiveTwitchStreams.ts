import { useEffect, useState } from 'react';
import type { TwitchStream } from './twitch';

/** Live status is verified separately from the page's static content release. */
export function useLiveTwitchStreams() {
  const [state, setState] = useState<{ streams: TwitchStream[]; available: boolean; loading: boolean }>({ streams: [], available: true, loading: true });
  useEffect(() => {
    let disposed = false;
    let request: AbortController | null = null;
    let expires: ReturnType<typeof setTimeout> | undefined;
    const clear = () => setState({ streams: [], available: false, loading: false });
    const refresh = async () => {
      if (document.visibilityState === 'hidden' || request) return;
      const controller = new AbortController();
      request = controller;
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch('/api/twitch-streams', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Live feed unavailable');
        const data = await response.json();
        if (!Array.isArray(data.streams)) throw new Error('Invalid live feed');
        if (!disposed && request === controller && !controller.signal.aborted) {
          clearTimeout(expires);
          setState({ streams: data.streams, available: data.available === true, loading: false });
          // A stalled or sleeping tab must not retain a LIVE badge indefinitely.
          expires = setTimeout(clear, 60000);
        }
      } catch {
        if (!disposed && request === controller) clear();
      } finally {
        clearTimeout(timeout);
        if (request === controller) request = null;
      }
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        request?.abort();
        request = null;
        clearTimeout(expires);
        clear();
      } else void refresh();
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 30000);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', refresh);
    return () => {
      disposed = true;
      request?.abort();
      clearTimeout(expires);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return state;
}
