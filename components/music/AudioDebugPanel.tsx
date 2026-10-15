import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { audioLog } from '@/lib/music/audioElement';
import type { EngineKind } from '@/lib/music/playbackEngine';

/** localStorage key that keeps the panel on across visits once ?audio-debug=1 was visited. */
export const AUDIO_DEBUG_KEY = 'arkpediaAudioDebug';
const SHOWN_EVENTS = 15;

/** On with ?audio-debug=1 (remembered), off with ?audio-debug=0 or the panel's Hide. */
function readFlag(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get('audio-debug');
    if (param === '1') window.localStorage.setItem(AUDIO_DEBUG_KEY, '1');
    if (param === '0') window.localStorage.removeItem(AUDIO_DEBUG_KEY);
    return window.localStorage.getItem(AUDIO_DEBUG_KEY) === '1';
  } catch {
    return new URLSearchParams(window.location.search).get('audio-debug') === '1';
  }
}

const NETWORK = ['EMPTY', 'IDLE', 'LOADING', 'NO_SOURCE'];
const READY = ['NOTHING', 'METADATA', 'CURRENT', 'FUTURE', 'ENOUGH'];

function ranges(list: TimeRanges): string {
  const parts: string[] = [];
  for (let i = 0; i < list.length; i += 1) parts.push(`${list.start(i).toFixed(1)}-${list.end(i).toFixed(1)}`);
  return parts.join(' ') || 'none';
}

/** The phone's own clock, to the millisecond, as its screenshot shows it. */
function clockTime(at: number): string {
  const time = new Date(at);
  return `${time.toTimeString().slice(0, 8)}.${String(time.getMilliseconds()).padStart(3, '0')}`;
}

function host(el: HTMLAudioElement): string {
  const src = el.getAttribute('src');
  if (!src) return 'none';
  try { return new URL(src, window.location.href).host; } catch { return 'unreadable'; }
}

/**
 * The music player's audio, as the page sees it, for a phone that cannot be inspected (iOS): the
 * <audio data-music-audio> element's state, the last media events with their times, the engine and
 * what the player and the lock screen are told. Off unless the address had ?audio-debug=1 (kept in
 * localStorage until ?audio-debug=0 or Hide). Text only, selectable for a screenshot; nothing is
 * sent anywhere. A fixed panel over the page, so turning it on moves nothing.
 */
export default function AudioDebugPanel({ engineKind, isPlaying, buffering, engineState }: {
  engineKind: EngineKind;
  isPlaying: boolean;
  buffering: boolean;
  engineState: () => Record<string, string | number | boolean> | null;
}) {
  const router = useRouter();
  const [on, setOn] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const check = () => setOn(readFlag());
    check();
    router.events.on('routeChangeComplete', check);
    return () => router.events.off('routeChangeComplete', check);
  }, [router.events]);

  useEffect(() => {
    if (!on) return;
    const timer = window.setInterval(() => setTick((n) => n + 1), 500);
    return () => window.clearInterval(timer);
  }, [on]);

  if (!on) return null;
  const el = document.querySelector<HTMLAudioElement>('audio[data-music-audio]');
  const session = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
  const engine = engineState();
  const rows: [string, string][] = el ? [
    ['paused', String(el.paused)],
    ['readyState', `${el.readyState} ${READY[el.readyState] ?? ''}`],
    ['networkState', `${el.networkState} ${NETWORK[el.networkState] ?? ''}`],
    ['error', el.error ? `${el.error.code} ${el.error.message || ''}`.trim() : 'none'],
    ['currentTime', el.currentTime.toFixed(2)],
    ['duration', Number.isFinite(el.duration) ? el.duration.toFixed(1) : String(el.duration)],
    ['buffered', ranges(el.buffered)],
    ['src host', host(el)],
  ] : [['audio', 'no element yet']];
  rows.push(
    ['engine', engineKind],
    ['isPlaying', String(isPlaying)],
    ['loading', String(buffering)],
    ['lock screen', session ? session.playbackState : 'no Media Session'],
  );
  if (engine) rows.push(['watchdog', Object.entries(engine).map(([key, value]) => `${key}=${value}`).join(' ')]);
  const events = audioLog().slice(-SHOWN_EVENTS).reverse();
  const hide = () => {
    try { window.localStorage.removeItem(AUDIO_DEBUG_KEY); } catch { /* this visit only */ }
    setOn(false);
  };

  return (
    <aside className="audio-debug-panel" aria-label="Audio debug" data-audio-debug>
      <div className="audio-debug-head">
        <strong>Audio debug</strong>
        <button type="button" className="ghost btn-sm" onClick={hide}>Hide</button>
      </div>
      <dl>
        {rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}
      </dl>
      <ol className="audio-debug-events" aria-label="Last media events, newest first">
        {events.map((entry, index) => (
          <li key={`${entry.at}-${index}`}>{clockTime(entry.at)} {entry.text}</li>
        ))}
        {!events.length && <li>No events yet.</li>}
      </ol>
    </aside>
  );
}
