/*
 * The one <audio data-music-audio> element Monster Siren's songs play through (lib/music/
 * playbackEngine.ts), and what it did, for the opt-in debug panel (components/music/
 * AudioDebugPanel.tsx).
 *
 * The element is made the first time anything asks for it -- at the latest, the press that first
 * plays a song -- not when YouTube's player API has loaded, which is when the engine that drives
 * it is made. An iPhone lets an element start sound only inside a press, so a press that asks for
 * a Monster Siren song before the engine can play it sets that song's file and plays it in the
 * press (primeMusicAudio); once the engine is up, its own play() runs in the press too (the
 * address needs no request first: msrAudioAddress).
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

/** The audio relay (arkpedia-app infra/audio-relay): Monster Siren's file streamed through our
 *  own server, for a device whose route to Monster Siren's nearest CDN edge does not deliver (an
 *  iPhone on a Korean mobile network got a song's first bytes and then nothing, 2026-10-14; over
 *  a VPN it played). A device uses it after a song made no sound from the CDN, for a week. */
export const AUDIO_RELAY = 'https://relay.arkpedia.net';
const RELAY_KEY = 'arkpediaAudioRelay';
const RELAY_DAYS = 7;
/** Whether this device plays through the relay: remembered after a silent song, or asked for
 *  with ?audio-relay=1 (and ended with ?audio-relay=0). */
export function audioRelayOn(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const asked = new URLSearchParams(window.location.search).get('audio-relay');
    if (asked === '1') rememberAudioRelay();
    if (asked === '0') localStorage.removeItem(RELAY_KEY);
    return Number(localStorage.getItem(RELAY_KEY) ?? 0) > Date.now();
  } catch { return false; }
}
export function rememberAudioRelay(): void {
  try { localStorage.setItem(RELAY_KEY, String(Date.now() + RELAY_DAYS * 86_400_000)); } catch { /* private mode: this visit only */ }
}

/** The player's address for a Monster Siren song's audio: our redirect to Monster Siren's signed
 *  address (pages/api/music-audio), or the relay on a device that needs it; either is set and
 *  played in a press, with no request first. `fresh` asks past any kept copy of the address,
 *  after a file made no sound. */
export function msrAudioAddress(cid: string, fresh = false): string {
  const song = encodeURIComponent(cid);
  const base = audioRelayOn() ? `${AUDIO_RELAY}/msr/${song}` : `/api/music-audio/${song}`;
  return `${base}${fresh ? `?retry=${Date.now()}` : ''}`;
}
/** The song an element's address (msrAudioAddress) is the audio of, or null. */
export function msrAudioCid(src: string | null | undefined): string | null {
  const match = /(?:\/api\/music-audio|relay\.arkpedia\.net\/msr)\/(\d+)(?:[?#]|$)/.exec(src ?? '');
  return match ? match[1] : null;
}

/**
 * Called in a press that asks for music before the player can (YouTube's player API, which the
 * player waits for, can take seconds on a phone): the song's own file is set and played there and
 * then, in the press, and the engine takes it over when it loads that song (createMsrAudioEngine's
 * load). An iPhone starts sound only inside a press; before 2026-10-14 the press only played and
 * paused the empty element, and the song's file played seconds later, said it played, and stayed
 * silent at 0:00. Without a Monster Siren song to play (one played from YouTube) it does nothing.
 */
export function primeMusicAudio(cid?: string | null, seconds = 0): void {
  if (typeof document === 'undefined' || !cid) return;
  const el = musicAudioElement();
  // From where the song is to go on (a reload's resume), not heard from its start first: the
  // engine seeks there exactly once it takes the file over.
  if (msrAudioCid(el.getAttribute('src')) !== cid) el.src = `${msrAudioAddress(cid)}${seconds > 0 ? `#t=${seconds.toFixed(1)}` : ''}`;
  logAudioEvent(`prime: ${cid}, play() in the press`);
  el.play().then(() => logAudioEvent('prime play() resolved'), (error: unknown) => {
    logAudioEvent(`prime play() rejected: ${(error as { name?: string })?.name ?? 'Error'}`);
  });
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
