import { usePrivacyChoice } from '@/lib/privacy/preferences';
import { useEffect } from 'react';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { useSiteSetting } from '@/lib/settings/useSiteSetting';
/** Lifetime belongs to the page, including same-template event-to-event navigation. */
export default function PageAudio({ musicId, pageKey }: { musicId: string | null; pageKey: string }) {
  const enabled = useSiteSetting('backgroundMusic'), consent = usePrivacyChoice('externalMedia');
  const { startPageMusic, stopPageMusic } = useMusicPlayer();
  useEffect(() => {
    if (!enabled || !consent || !musicId) return;
    startPageMusic(musicId, pageKey);
    return () => stopPageMusic(pageKey);
  }, [enabled, consent, musicId, pageKey, startPageMusic, stopPageMusic]);
  return null;
}
