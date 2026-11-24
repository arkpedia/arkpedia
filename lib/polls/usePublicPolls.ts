import { useEffect, useState } from 'react';
import type { PublicPolls } from './settings';

export function usePublicPolls() {
  const [polls, setPolls] = useState<PublicPolls | null>(null), [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: number, loading = false;
    async function load() {
      if (loading || document.hidden) return;
      loading = true;
      window.clearTimeout(timer);
      let delay = 30_000;
      try {
        const response = await fetch('/api/polls/settings',{cache:'no-store',signal:controller.signal});
        if (!response.ok) throw Error();
        const next: PublicPolls = await response.json();
        if (controller.signal.aborted) return;
        setPolls(next); setError(false);
        for (const poll of Object.values(next)) {
          if (poll.open && poll.closesAt !== null) delay = Math.min(delay, Math.max(500, poll.closesAt - Date.now()));
        }
      } catch { if (!controller.signal.aborted) { setPolls(null); setError(true); } }
      finally {
        loading = false;
        if (!controller.signal.aborted) timer = window.setTimeout(load,delay);
      }
    }
    void load(); window.addEventListener('focus',load); document.addEventListener('visibilitychange',load);
    return () => { controller.abort(); window.clearTimeout(timer); window.removeEventListener('focus',load); document.removeEventListener('visibilitychange',load); };
  },[]);
  return {polls,error};
}
