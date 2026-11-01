import { useEffect } from 'react';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { useSiteSetting } from '@/lib/settings/useSiteSetting';
/** Lifetime belongs to the page, including same-template event-to-event navigation. */
export default function PageAudio({ cid, pageKey }: { cid: string | null; pageKey: string }) {
  const enabled = useSiteSetting('backgroundMusic');
  const { startPageMusic, stopPageMusic } = useMusicPlayer();
  useEffect(() => {
    if (!enabled || !cid) return;
    startPageMusic(cid, pageKey);
    return () => stopPageMusic(pageKey);
  }, [enabled, cid, pageKey, startPageMusic, stopPageMusic]);
  return null;
}
