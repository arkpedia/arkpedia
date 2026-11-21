import { useEffect, useState } from 'react';
import type { SponsorCampaignTable } from './campaigns';

/** One check for the entire page, including an open drawer. Keep the last
 * successful snapshot during a temporary network or storage failure. */
export function useLiveCampaigns(enabled: boolean) {
  const [table, setTable] = useState<SponsorCampaignTable>();
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const response = await fetch('/api/sponsor-campaigns', { signal: controller.signal });
        if (response.ok) setTable(await response.json());
      } catch { /* Keep the campaign already on screen. */ }
      finally { pending = false; }
    }
    void refresh();
    const timer = window.setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [enabled]);
  return enabled ? table : undefined;
}
