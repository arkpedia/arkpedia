import { useCallback, useEffect, useRef } from 'react';
import { assetAudioUrl, retryAssetAudioOnNextPress } from '@/lib/assets/assetRetry';
import type { ChibiTapVoices } from '@/lib/operators/chibiVoice';
import { useContentUrl } from '@/lib/content/context';

// A second pet's tap replaces the first; automatic animations never play audio.
let active: HTMLAudioElement[] = [];
export function useChibiVoice(voices: ChibiTapVoices | undefined, { language, volume }: { language: string; volume: number }, enabled = true) {
  const resolve = useContentUrl();
  const audio = useRef<HTMLAudioElement[]>([]);
  const stop = useCallback(() => {
    const current = audio.current;
    for (const sound of current) { sound.pause(); sound.removeAttribute('src'); sound.load(); }
    if (active === current) active = [];
    audio.current = [];
  }, []);
  useEffect(() => {
    if (!enabled) { stop(); return; }
    const hide = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hide);
    return () => { document.removeEventListener('visibilitychange', hide); stop(); };
  }, [stop, voices, language, enabled]);
  useEffect(() => { for (const sound of audio.current) sound.volume = volume; }, [volume]);
  return useCallback((trust: boolean) => {
    const selected = voices?.languages?.find(pack => pack.id === language) ?? voices;
    const clip = trust ? selected?.trust : selected?.tap;
    if (!enabled) return;
    stop(); for (const sound of active) sound.pause();
    // Original base UI click/trust sounds; both follow the quiet chibi volume.
    const urls = [trust ? '/audio/chibi-trust.mp3' : '/audio/chibi-tap.mp3', ...(clip ? [resolve(clip.url)] : [])];
    const sounds = urls.map(url => {
      const address = assetAudioUrl(url), heard = new Audio(address);
      heard.volume = volume;
      void heard.play().catch(error => {
        if (audio.current.includes(heard) && error?.name !== 'AbortError') retryAssetAudioOnNextPress(url, address);
      });
      return heard;
    });
    audio.current = active = sounds;
  }, [voices, language, volume, resolve, stop, enabled]);
}
