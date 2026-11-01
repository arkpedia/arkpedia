import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useAccount } from '@/lib/account/accountStore';
import { useContentUrl } from '@/lib/content/context';
import { useSiteSetting } from '@/lib/settings/useSiteSetting';
import { readPrivacy, requestExternalMedia } from '@/lib/privacy/preferences';
import { useMusicPlayer } from './musicPlayerContext';
import { AUDIO_MANUAL_KEY, GREETING_VISIT_KEY, markVisit, visitFlag } from './pageMusic';

/** One attempt per tab visit, with an explicit retry button only when sound was blocked. */
export function useWelcomeGreeting() {
  const mode = useSiteSetting('greeting'), chosen = useSiteSetting('greetingOperator');
  const account = useAccount(), url = useContentUrl(), router = useRouter();
  const player = useMusicPlayer(), latestPlayer = useRef(player); latestPlayer.current = player;
  const audio = useRef<HTMLAudioElement | null>(null), attempted = useRef(false);
  const [pending, setPending] = useState(''), [playing, setPlaying] = useState(false);
  const route = router.asPath.split(/[?#]/)[0];
  // A stable roster string: imports can unlock the owned choice without rerolling on renders.
  const owned = JSON.stringify(account?.operators ?? []);
  const stop = () => { audio.current?.pause(); setPending(''); setPlaying(false); };
  const play = () => {
    const element = audio.current;
    if (!element) return;
    requestExternalMedia(() => {
      if (audio.current !== element) return;
      void element.play().then(() => { if (audio.current === element) { setPending(''); setPlaying(true); } else element.pause(); }).catch(() => { setPlaying(false); });
    });
  };
  useEffect(() => {
    if (mode === 'off' || attempted.current || visitFlag(GREETING_VISIT_KEY) || visitFlag(AUDIO_MANUAL_KEY)) return;
    const controller = new AbortController();
    let element: HTMLAudioElement | null = null;
    const manual = () => { controller.abort(); element?.pause(); audio.current = null; setPending(''); setPlaying(false); };
    window.addEventListener('arkpedia:manual-audio', manual);
    void (async () => {
      let names: string[] = mode === 'chosen' ? (chosen ? [chosen] : []) : mode === 'owned' ? JSON.parse(owned) : [];
      if (mode === 'random') {
        const response = await fetch(url('/operator-search.json'), { signal: controller.signal });
        if (!response.ok) return;
        names = (await response.json()).operators.map((op: { name: string }) => op.name);
      }
      if (!names.length || controller.signal.aborted) return;
      const name = names[Math.floor(Math.random() * names.length)];
      const response = await fetch(`/api/greeting?operator=${encodeURIComponent(name)}`, { signal: controller.signal });
      if (!response.ok) return;
      const recording = await response.json();
      const current = latestPlayer.current;
      if (!recording?.url || controller.signal.aborted || visitFlag(AUDIO_MANUAL_KEY) || (!current.pageMusic && (current.isPlaying || current.starting || current.videoId))) return;
      attempted.current = true; markVisit(GREETING_VISIT_KEY);
      element = new Audio(); element.preload = 'none'; element.volume = 0.3;
      element.src = recording.url; audio.current = element;
      element.onended = () => { setPlaying(false); setPending(''); };
      element.onerror = () => { setPlaying(false); setPending(''); };
      setPending(`${recording.name} greeting`);
      if (readPrivacy().externalMedia) {
        try { await element.play(); if (!controller.signal.aborted) { setPending(''); setPlaying(true); } else element.pause(); }
        catch { /* Browser refusal keeps the explicit Play greeting button. */ }
      }
    })().catch(() => { /* Missing recordings leave the page quiet. */ });
    return () => { controller.abort(); element?.pause(); if (audio.current === element) audio.current = null; setPending(''); setPlaying(false); window.removeEventListener('arkpedia:manual-audio', manual); };
  }, [mode, chosen, owned, url, route]);
  return { pending, playing, play, stop };
}
