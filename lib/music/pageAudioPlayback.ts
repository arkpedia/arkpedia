import { useSyncExternalStore } from 'react';

// The active page owns this transient display/retry state. It never enters the
// personal queue. The on/off preference stays in siteSettings.
type PagePlayback = {
  owner: object;
  title: string;
  status: 'loading' | 'playing' | 'paused' | 'blocked' | 'error';
  needsPlay: boolean;
  play: () => void;
} | null;
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
