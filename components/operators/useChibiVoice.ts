import { useCallback, useEffect, useRef } from 'react';
import { assetAudioUrl, retryAssetAudioOnNextPress } from '@/lib/assets/assetRetry';
import type { ChibiTapVoices } from '@/lib/operators/chibiVoice';
import { useContentUrl } from '@/lib/content/context';

// A second pet's tap replaces the first; automatic animations never play audio.
let active: HTMLAudioElement | null = null;
export function useChibiVoice(voices: ChibiTapVoices | undefined, enabled = true) {
  const resolve = useContentUrl();
  const audio = useRef<HTMLAudioElement | null>(null);
  const stop = useCallback(() => {
    const current = audio.current;
    if (current) { current.pause(); current.removeAttribute('src'); current.load(); }
    if (active === current) active = null;
    audio.current = null;
  }, []);
  useEffect(() => {
    if (!enabled) { stop(); return; }
    const hide = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hide);
    return () => { document.removeEventListener('visibilitychange', hide); stop(); };
  }, [stop, voices, enabled]);
  return useCallback((trust: boolean) => {
    const clip = trust ? voices?.trust : voices?.tap;
    if (!enabled || !clip) return;
    stop(); active?.pause();
    const url = resolve(clip.url), address = assetAudioUrl(url);
    const heard = new Audio(address);
    audio.current = active = heard;
    try {
      const saved = localStorage.getItem('arkpedia.voiceVolume');
      const volume = saved === null ? 1 : Number(saved);
      heard.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;
    } catch { heard.volume = 1; }
    void heard.play().catch(error => {
      if (audio.current === heard && error?.name !== 'AbortError') retryAssetAudioOnNextPress(url, address);
    });
  }, [voices, resolve, stop, enabled]);
}
