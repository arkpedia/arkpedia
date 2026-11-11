import { useSyncExternalStore } from 'react';

type Visibility = 'auto' | 'open' | 'minimized';
let visibility: Visibility = 'auto';
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => visibility;
const serverSnapshot = (): Visibility => 'auto';

function setVisibility(value: Visibility) {
  if (visibility === value) return;
  visibility = value;
  listeners.forEach(listener => listener());
}

/** Presentation only: minimizing never pauses, reloads or changes the queue. */
export function usePlayerVisibility() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export function openMusicPlayer() { setVisibility('open'); }
export function minimizeMusicPlayer() {
  setVisibility('minimized');
  requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.music-collapse-toggle')?.focus({ preventScroll: true }));
}

export function playerIsVisible(mode: Visibility, onMusicPage: boolean, active: boolean) {
  return onMusicPage || mode === 'open' || (mode === 'auto' && active);
}
