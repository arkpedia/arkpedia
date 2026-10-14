/*
 * The one <audio data-music-audio> element Monster Siren's songs play through (lib/music/
 * playbackEngine.ts), and what it did, for the opt-in debug panel (components/music/
 * AudioDebugPanel.tsx).
 *
 * The element is made the first time anything asks for it -- at the latest, the press that first
 * plays a song -- not when YouTube's player API has loaded, which is when the engine that drives
 * it is made. An iPhone lets an element start sound by itself only once a press has asked it to
 * play (WebKit lifts the element's restriction inside play(), in the press); the engine's play()
 * comes after the song's address is fetched, outside the press, and before this the element did
 * not even exist during the first one -- the old one-time unlock ran when YouTube was ready,
 * seconds after the press, and never tried again. So every press that asks for music primes it
 * (primeMusicAudio): with no song's file set, play() and pause() there and then, in the press. A
 * press on the song already set plays it in the same task anyway (the engine's begin()).
 */

/** The element, made (hidden, preload none, in <body>) the first time it is asked for. One per
 *  document: an element already there (a hot reload of the provider) is taken, not doubled. */
let element: HTMLAudioElement | null = null;
export function musicAudioElement(): HTMLAudioElement {
  if (element && element.isConnected) return element;
  element = document.querySelector<HTMLAudioElement>('audio[data-music-audio]');
  if (!element) {
    element = document.createElement('audio');
    element.preload = 'none';
    element.hidden = true;
    element.setAttribute('data-music-audio', '');
    document.body.appendChild(element);
  }
  watch(element);
  return element;
}

/**
 * Called in a press that asks for music, before anything else it does: an element with no song's
 * file is asked to play and paused at once, in the press, so the play() that follows the address
 * fetch is let through. An element with a file set is left alone: a pause there would be heard as
 * the song's own, and a press for that song plays it in this same task anyway. Harmless outside a
 * press: the browser refuses it, and nothing waits on that.
 */
export function primeMusicAudio(): void {
  if (typeof document === 'undefined') return;
  const el = musicAudioElement();
  if (el.getAttribute('src')) return;
  logAudioEvent('prime: play() and pause() in the press');
  el.play().then(() => logAudioEvent('prime play() resolved'), (error: unknown) => {
    logAudioEvent(`prime play() rejected: ${(error as { name?: string })?.name ?? 'Error'}`);
  });
  el.pause();
}

/* ---- What the element did: the last few events, for the debug panel. Never sent anywhere. ---- */

export interface AudioLogEntry { at: number; text: string }
const LOG_SIZE = 30;
const log: AudioLogEntry[] = [];
export function logAudioEvent(text: string): void {
  log.push({ at: Date.now(), text });
  if (log.length > LOG_SIZE) log.splice(0, log.length - LOG_SIZE);
}
export function audioLog(): readonly AudioLogEntry[] {
  return log;
}

const LOGGED = ['loadstart', 'loadedmetadata', 'canplay', 'canplaythrough', 'play', 'playing', 'waiting', 'stalled', 'suspend',
  'pause', 'seeking', 'seeked', 'error', 'ended', 'abort', 'emptied'] as const;
const watched = new WeakSet<HTMLAudioElement>();
function watch(el: HTMLAudioElement) {
  if (watched.has(el)) return;
  watched.add(el);
  for (const type of LOGGED) {
    el.addEventListener(type, () => {
      const extra = type === 'error' && el.error ? ` ${el.error.code}${el.error.message ? ` ${el.error.message}` : ''}` : '';
      logAudioEvent(`${type} t=${el.currentTime.toFixed(1)} rs=${el.readyState}${extra}`);
    });
  }
}
