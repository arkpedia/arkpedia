import { useSyncExternalStore } from 'react';

// Only the active page owns this transient retry action. The on/off preference
// stays in siteSettings; closing Settings must not affect playback.
type PagePlayback = { owner: object; needsPlay: boolean; play: () => void } | null;
let current: PagePlayback = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function publishPagePlayback(value: NonNullable<PagePlayback>) {
  current = value; listeners.forEach(listener => listener());
}
export function clearPagePlayback(owner: object) {
  if (current?.owner !== owner) return;
  current = null; listeners.forEach(listener => listener());
}
export function usePagePlayback() {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
