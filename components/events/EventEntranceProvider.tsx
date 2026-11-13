import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { useRouter } from 'next/router';
import { useSiteServer } from '@/lib/time/siteServer';
import { useSiteSetting } from '@/lib/settings/useSiteSetting';
import { usePrivacyChoice } from '@/lib/privacy/preferences';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { fetchAsset } from '@/lib/assets/assetRetry';
import { MAIN_AUDIO_START } from '@/lib/music/pageMusic';
import { EventEntranceContext } from '@/lib/events/eventEntranceContext';
import { entranceAsset, entranceForUrl, type EventEntrance } from '@/lib/events/eventEntrance';
import type { GameUiPlayer, GameUiScene } from '@/lib/events/gameUiPlayer';

type Prepared = { scene: GameUiScene; textures: Blob[]; sound: Promise<ArrayBuffer | null> | null; url: string };
type Session = { id: number; entry: EventEntrance; pathname: string };
type Phase = 'black' | 'playing' | 'docking' | 'fading';
const BLACK_MS = 160, DOCK_MS = 560, FADE_MS = 180, LOAD_BUDGET_MS = 1800;

export default function EventEntranceProvider({ children }: { children: ReactNode }) {
  const router = useRouter(), server = useSiteServer();
  const enabled = useSiteSetting('eventMusic'), consent = usePrivacyChoice('externalMedia');
  const { isPlaying, starting, buffering, volume } = useMusicPlayer();
  const audioAllowed = enabled && consent && !isPlaying && !starting && !buffering && volume > 0;
  const preferences = useRef({ server, audioAllowed, volume }); preferences.current = { server, audioAllowed, volume };
  const [session, setSession] = useState<Session | null>(null), [phase, setPhase] = useState<Phase>('black'), [holding, setHolding] = useState(false);
  const [target, setTarget] = useState<CSSProperties>({});
  const dialog = useRef<HTMLDialogElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const serial = useRef(0), intent = useRef<{ pathname: string; at: number } | null>(null);
  const active = useRef<Session | null>(null); active.current = session;
  const control = useRef<{ stop: () => void } | null>(null);
  const cache = useRef<{ id: string; abort: AbortController; promise: Promise<Prepared> } | null>(null);
  const sound = useRef<{ context: AudioContext; source: AudioBufferSourceNode | null; gain: GainNode } | null>(null);

  const stopSound = useCallback(() => {
    const audio = sound.current;
    if (!audio) return;
    try { audio.source?.stop(); } catch { /* already ended */ }
    audio.source = null;
    void audio.context.suspend().catch(() => {});
  }, []);
  const finish = useCallback((cancelSound = true) => {
    control.current?.stop(); control.current = null;
    if (cancelSound) stopSound();
    active.current = null; setHolding(false); setSession(null);
  }, [stopSound]);

  const prepare = useCallback((entry: EventEntrance): Promise<Prepared> => {
    if (cache.current?.id === entry.id) return cache.current.promise;
    cache.current?.abort.abort();
    const abort = new AbortController(), url = entranceAsset(entry, 'scene.json');
    const promise = (async () => {
      const response = await fetchAsset(url, { signal: abort.signal });
      if (!response.ok) throw new Error('Entrance unavailable');
      const scene: GameUiScene = await response.json();
      if (scene.schemaVersion !== 1) throw new Error('Unsupported entrance scene');
      const base = new URL('.', url);
      const soundBytes = preferences.current.audioAllowed && scene.sound
        ? fetchAsset(new URL(scene.sound.file, base).href, { signal: abort.signal }).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null) : null;
      const textures = await Promise.all(scene.textures.map(async t => {
        const r = await fetchAsset(new URL(t.file, base).href, { signal: abort.signal });
        if (!r.ok) throw new Error('Entrance artwork unavailable');
        return r.blob();
      }));
      return { scene, textures, sound: soundBytes, url };
    })();
    cache.current = { id: entry.id, abort, promise };
    void promise.catch(() => { if (cache.current?.promise === promise) cache.current = null; });
    return promise;
  }, []);

  useEffect(() => {
    if (!audioAllowed) stopSound();
    if (sound.current) sound.current.gain.gain.value = Math.min(volume, 15) / 100;
  }, [audioAllowed, volume, stopSound]);

  useEffect(() => {
    let warmTimer: ReturnType<typeof setTimeout> | undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const anchor = (event: Event) => event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    const warm = (event: Event) => {
      if (active.current || reduced.matches) return;
      const a = anchor(event);
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const entry = entranceForUrl(a.href, window.location.origin, preferences.current.server);
      clearTimeout(warmTimer);
      if (entry) warmTimer = setTimeout(() => { void prepare(entry).catch(() => {}); }, 150);
    };
    const arm = (event: MouseEvent) => {
      if (event.defaultPrevented || !event.isTrusted || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || reduced.matches) return;
      const a = anchor(event);
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href), entry = entranceForUrl(a.href, window.location.origin, preferences.current.server);
      if (!entry || url.pathname === window.location.pathname) return;
      intent.current = { pathname: url.pathname, at: performance.now() };
      void prepare(entry).catch(() => {});
      if (preferences.current.audioAllowed) {
        try {
          stopSound();
          if (!sound.current || sound.current.context.state === 'closed') {
            const context = new AudioContext(), gain = context.createGain(); gain.connect(context.destination);
            sound.current = { context, gain, source: null };
          }
          // Resume inside the real click/keyboard activation, before async routing.
          void sound.current.context.resume().catch(() => {});
        } catch { /* Silent animation when native audio is unavailable. */ }
      }
    };
    const start = (href: string, options: { shallow: boolean }) => {
      const next = new URL(href, window.location.origin), armed = intent.current;
      intent.current = null;
      if (options.shallow) return;
      if (!armed || armed.pathname !== next.pathname || performance.now() - armed.at > 500 || reduced.matches) { finish(); return; }
      const entry = entranceForUrl(href, window.location.origin, preferences.current.server);
      if (!entry) { finish(); return; }
      finish(false); setTarget({}); setPhase('black'); setHolding(true);
      const nextSession = { id: ++serial.current, entry, pathname: next.pathname };
      active.current = nextSession; setSession(nextSession);
    };
    const cancel = (_error: unknown, href: string) => { if (active.current?.pathname === new URL(href, location.origin).pathname) finish(); };
    const pop = () => { intent.current = null; finish(); };
    const motion = () => { if (reduced.matches) finish(); };
    document.addEventListener('pointerover', warm, true); document.addEventListener('focusin', warm, true);
    document.addEventListener('click', arm, true); window.addEventListener('popstate', pop, true);
    reduced.addEventListener('change', motion); window.addEventListener(MAIN_AUDIO_START, stopSound);
    router.events.on('routeChangeStart', start); router.events.on('routeChangeError', cancel);
    return () => {
      clearTimeout(warmTimer); document.removeEventListener('pointerover', warm, true); document.removeEventListener('focusin', warm, true);
      document.removeEventListener('click', arm, true); window.removeEventListener('popstate', pop, true);
      reduced.removeEventListener('change', motion); window.removeEventListener(MAIN_AUDIO_START, stopSound);
      router.events.off('routeChangeStart', start); router.events.off('routeChangeError', cancel);
    };
  }, [router.events, finish, prepare, stopSound]);

  useEffect(() => {
    if (!session || !dialog.current || !canvas.current) return;
    const box = dialog.current, element = canvas.current, abort = new AbortController();
    let disposed = false, raf = 0, player: GameUiPlayer | null = null, docked = false;
    let timer: ReturnType<typeof setTimeout> | undefined, watchdog: ReturnType<typeof setTimeout> | undefined;
    const overflow = document.documentElement.style.overflow, entered = performance.now();
    box.showModal(); box.focus({ preventScroll: true }); document.documentElement.style.overflow = 'hidden';
    control.current = { stop: () => { disposed = true; abort.abort(); cancelAnimationFrame(raf); clearTimeout(timer); clearTimeout(watchdog); } };
    const updateTarget = () => {
      const art = document.querySelector<HTMLElement>(`[data-event-entrance-art="${session.entry.id}"]`);
      const rect = art?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= innerHeight) return false;
      setTarget({ '--entrance-x': `${rect.left}px`, '--entrance-y': `${rect.top}px`, '--entrance-scale-x': rect.width / innerWidth, '--entrance-scale-y': rect.height / innerHeight } as CSSProperties);
      return true;
    };
    const resize = () => { if (docked) updateTarget(); };
    window.addEventListener('resize', resize);
    const contextLost = () => finish();
    element.addEventListener('webglcontextlost', contextLost);
    const load = (async () => {
      const [prepared, module] = await Promise.all([prepare(session.entry), import('@/lib/events/gameUiPlayer')]);
      if (disposed) return;
      player = new module.GameUiPlayer(element, prepared.scene);
      await player.load(new URL('.', prepared.url), abort.signal, prepared.textures);
      let buffer: AudioBuffer | null = null;
      const audio = sound.current;
      // Hover may have warmed the art before the reader enabled Event Music.
      if (preferences.current.audioAllowed && audio && prepared.scene.sound && !prepared.sound) {
        prepared.sound = fetchAsset(new URL(prepared.scene.sound.file, new URL('.', prepared.url)).href, { signal: abort.signal })
          .then(r => r.ok ? r.arrayBuffer() : null).catch(() => null);
      }
      if (preferences.current.audioAllowed && audio && prepared.sound) {
        const bytes = await Promise.race([prepared.sound, new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 120); })]);
        clearTimeout(timer);
        if (bytes && !disposed) { try { buffer = await audio.context.decodeAudioData(bytes.slice(0)); } catch { /* silent fallback */ } }
      }
      if (disposed) return;
      clearTimeout(watchdog);
      const begin = () => {
        if (disposed || !player) return;
        const began = performance.now();
        setPhase('playing');
        if (buffer && audio && preferences.current.audioAllowed && audio.context.state === 'running' && prepared.scene.sound) {
          const source = audio.context.createBufferSource(); source.buffer = buffer; source.connect(audio.gain);
          audio.gain.gain.value = Math.min(preferences.current.volume, 15) / 100;
          audio.source = source; source.start(audio.context.currentTime + prepared.scene.sound.offset);
          source.onended = () => {
            source.disconnect();
            if (audio.source === source) { audio.source = null; void audio.context.suspend().catch(() => {}); }
          };
        } else if (audio) void audio.context.suspend().catch(() => {});
        const frame = (now: number) => {
          if (disposed || !player) return;
          const elapsed = (now - began) / 1000;
          try { player.draw(Math.min(elapsed, prepared.scene.duration)); } catch { finish(); return; }
          if (elapsed >= prepared.scene.duration && !docked) {
            docked = true;
            setHolding(false); // Cue the already prepared event theme at the handoff.
            const canDock = updateTarget();
            setPhase(canDock ? 'docking' : 'fading');
            timer = setTimeout(() => {
              if (disposed) return;
              setPhase('fading'); timer = setTimeout(() => finish(false), FADE_MS);
            }, canDock ? DOCK_MS : 0);
          }
          raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
      };
      timer = setTimeout(begin, Math.max(0, BLACK_MS - (performance.now() - entered)));
    })();
    watchdog = setTimeout(() => finish(), LOAD_BUDGET_MS);
    void load.catch(() => { if (!disposed) finish(); });
    return () => {
      disposed = true; abort.abort(); cancelAnimationFrame(raf); clearTimeout(timer); clearTimeout(watchdog);
      player?.dispose(); window.removeEventListener('resize', resize); element.removeEventListener('webglcontextlost', contextLost);
      box.close(); document.documentElement.style.overflow = overflow;
      document.getElementById('page-content')?.focus({ preventScroll: true });
    };
  }, [session, prepare, finish]);

  useEffect(() => () => { cache.current?.abort.abort(); stopSound(); void sound.current?.context.close().catch(() => {}); }, [stopSound]);
  const value = useMemo(() => holding, [holding]);
  return <EventEntranceContext.Provider value={value}>
    {children}
    <dialog ref={dialog} className="event-entrance" data-phase={phase} aria-label={session ? `Opening ${session.entry.title}` : 'Event entrance'} tabIndex={-1}
      onCancel={e => { e.preventDefault(); e.stopPropagation(); finish(); }}>
      <div className="event-entrance-stage" style={target}><canvas ref={canvas} aria-hidden="true" /></div>
      <button type="button" className="btn btn-sm event-entrance-skip" onClick={() => finish()}>Skip intro</button>
    </dialog>
  </EventEntranceContext.Provider>;
}
