import { useEffect, useState } from 'react';
import type { BattleplanData } from '@/lib/ccb/types';
import BattleplanLoading from './BattleplanLoading';
import BattleplanWorkspace from './BattleplanWorkspace';

export default function BattleplanLoader({ catalogueUrl }: { catalogueUrl: string }) {
  const [data, setData] = useState<BattleplanData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const request = new AbortController();
    async function load() {
      try {
        const response = await fetch(catalogueUrl, { signal: request.signal });
        if (!response.ok) throw new Error(`Catalogue responded with ${response.status}`);
        const catalogue = await response.json() as BattleplanData;
        setData(catalogue);
      } catch {
        if (!request.signal.aborted) setFailed(true);
      }
    }
    void load();
    return () => request.abort();
  }, [catalogueUrl, attempt]);

  if (data) return <BattleplanWorkspace {...data} />;
  return <BattleplanLoading retry={failed ? () => {
    setFailed(false);
    setAttempt(previous => previous + 1);
  } : undefined} />;
}
