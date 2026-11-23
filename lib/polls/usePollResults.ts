import { useCallback, useEffect, useState } from 'react';

const REFRESH_MS = 30_000;

export function usePollResults<T>(url: string, validate: (value: T) => boolean, enabled = true) {
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let lastRequest = -Infinity;
    let loading = false;
    const refresh = async () => {
      if (document.hidden || loading || performance.now() - lastRequest < REFRESH_MS) return;
      loading = true;
      lastRequest = performance.now();
      try {
        const response = await fetch(url, { credentials: 'omit', cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !validate(data)) throw Error(data?.error ?? 'Results are temporarily unavailable.');
        if (!controller.signal.aborted) {
          setResult(data);
          setError('');
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load results.');
      } finally {
        loading = false;
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [attempt, enabled, url, validate]);
  return { result, error, retry };
}
