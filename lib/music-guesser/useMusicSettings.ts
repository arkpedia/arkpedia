import { useEffect, useState } from 'react';
import { DEFAULT_MUSIC_SETTINGS, MUSIC_SETTINGS_KEY, readMusicSettings } from './selection';
import type { MusicGroup, MusicSettings } from './selection';

export function useMusicSettings(groups: MusicGroup[]) {
  const [settings, setSettings] = useState<MusicSettings>(DEFAULT_MUSIC_SETTINGS);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { setSettings(readMusicSettings(localStorage.getItem(MUSIC_SETTINGS_KEY), groups)); } catch { /* storage may be unavailable */ }
    setReady(true);
  }, [groups]);
  useEffect(() => {
    if (ready) try { localStorage.setItem(MUSIC_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* keep session choices */ }
  }, [ready, settings]);
  return { settings, setSettings, ready };
}
