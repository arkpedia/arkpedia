import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ContentImg } from '@/components/content/ContentImage';
import SegmentedControl from '@/components/ui/SegmentedControl';
import XButton from '@/components/ui/XButton';
import EventHomeTheme from './EventHomeTheme';
import EventSceneCanvas from './EventSceneCanvas';
import type { CosmeticPreview } from '@/lib/events/cosmeticPreviews';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { MAIN_AUDIO_START } from '@/lib/music/pageMusic';
import { readPrivacy, requestExternalMedia } from '@/lib/privacy/preferences';
import { getSetting } from '@/lib/settings/siteSettings';

const WIDE = { x: 50, y: 50, zoom: 1 };
const clampPosition = (value: number) => Math.max(0, Math.min(100, value));
const clampZoom = (value: number) => Math.max(1, Math.min(5, value));

type SceneView = 'room' | 'theme';
type Drag = { id: number; x: number; y: number; camera: typeof WIDE };

function frameSize(stage: HTMLElement, ratio: number, contain: boolean) {
  const fit = contain ? Math.min : Math.max;
  const width = fit(stage.clientWidth, stage.clientHeight * ratio);
  return { width, height: width / ratio };
}

function positionAfterZoom(position: number, anchor: number, frame: number, art: number, before: number, after: number) {
  const overflow = art * after - frame;
  if (overflow <= 0) return 50;
  const inset = frame - art * before;
  const previousOffset = inset * (inset > 0 ? .5 : position / 100);
  return clampPosition(((anchor - previousOffset) * after / before - anchor) * 100 / overflow);
}

export default function EventCosmeticPreview({ preview, onOpenChange }: {
  preview: CosmeticPreview;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [animationStart, setAnimationStart] = useState(0);
  const [view, setView] = useState<SceneView>(preview.theme ? 'theme' : 'room');
  const [camera, setCamera] = useState(WIDE);
  const [sceneRatio, setSceneRatio] = useState(16 / 9);
  const [dragging, setDragging] = useState(false);
  const [sceneArt, setSceneArt] = useState<'loading' | 'ready' | 'error'>('loading');
  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const launch = useRef<HTMLButtonElement>(null);
  const drag = useRef<Drag | null>(null);
  const titleId = useId();
  const helpId = useId();
  const music = useMusicPlayer();
  const { scene, theme, music: track } = preview;
  const nativeHome = view === 'theme' && theme?.nativeLayout === 'persona';

  useEffect(() => {
    const element = audio.current;
    const pause = () => element?.pause();
    window.addEventListener(MAIN_AUDIO_START, pause);
    window.addEventListener('pagehide', pause);
    return () => {
      window.removeEventListener(MAIN_AUDIO_START, pause);
      window.removeEventListener('pagehide', pause);
      pause();
      if (element) {
        element.removeAttribute('src');
        element.load();
      }
      onOpenChange?.(false);
    };
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const trigger = launch.current;
    element?.showModal();
    return () => {
      element?.close();
      trigger?.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (audio.current) audio.current.volume = Math.min(music.volume, 15) / 100;
  }, [music.volume]);

  useEffect(() => {
    const element = stage.current;
    if (!open || !element) return;
    function zoom(event: WheelEvent) {
      if ((!event.ctrlKey && !event.metaKey) || !element) return;
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const art = frameSize(element, sceneRatio, nativeHome);
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1;
      const factor = Math.exp(-event.deltaY * unit * 0.002);
      setCamera(current => {
        const next = clampZoom(current.zoom * factor);
        if (next === current.zoom) return current;
        return {
          zoom: next,
          x: positionAfterZoom(current.x, event.clientX - bounds.left, bounds.width, art.width, current.zoom, next),
          y: positionAfterZoom(current.y, event.clientY - bounds.top, bounds.height, art.height, current.zoom, next),
        };
      });
    }
    element.addEventListener('wheel', zoom, { passive: false });
    return () => element.removeEventListener('wheel', zoom);
  }, [open, sceneRatio, nativeHome]);

  function playAudio() {
    const player = audio.current;
    if (!track || !player) return;
    setAudioError(false);
    if (music.isPlaying || music.starting || music.buffering) music.pausePlayback();
    if (!player.src || player.error) player.src = track.preview;
    void player.play().catch((error: unknown) => {
      if (audio.current !== player || (error instanceof DOMException && error.name === 'AbortError')) return;
      setPlaying(false);
      // A browser may reject autoplay. The visible Play BGM button retries with a gesture.
      setAudioError(!(error instanceof DOMException && error.name === 'NotAllowedError'));
    });
  }

  function enter() {
    setSceneArt('loading');
    setAnimationStart(performance.now());
    setOpen(true);
    onOpenChange?.(true);
    if (getSetting('eventMusic') && readPrivacy().externalMedia) playAudio();
  }

  function leave() {
    audio.current?.pause();
    if (audio.current) audio.current.currentTime = 0;
    setPlaying(false);
    drag.current = null;
    setDragging(false);
    setOpen(false);
    setView(theme ? 'theme' : 'room');
    setCamera(WIDE);
    onOpenChange?.(false);
  }

  function toggleBgm() {
    if (!track) return;
    if (audio.current && !audio.current.paused) {
      audio.current.pause();
      return;
    }
    requestExternalMedia(() => {
      if (dialog.current?.open) playAudio();
    }, undefined, track.provider);
  }

  function moveWithKeys(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setCamera(current => ({
        ...current,
        x: clampPosition(current.x + move[0]),
        y: clampPosition(current.y + move[1]),
      }));
    }
    if (['+', '=', '-'].includes(event.key)) {
      event.preventDefault();
      const factor = event.key === '-' ? 1 / 1.15 : 1.15;
      setCamera(current => ({ ...current, zoom: clampZoom(current.zoom * factor) }));
    }
    if (event.key === '0') setCamera(WIDE);
  }

  function beginDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || drag.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, camera };
    setDragging(true);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    const element = event.currentTarget;
    const art = frameSize(element, sceneRatio, nativeHome);
    const overflowX = art.width * start.camera.zoom - element.clientWidth;
    const overflowY = art.height * start.camera.zoom - element.clientHeight;
    setCamera({
      x: overflowX > 0 ? clampPosition(start.camera.x + (start.x - event.clientX) * 100 / overflowX) : start.camera.x,
      y: overflowY > 0 ? clampPosition(start.camera.y + (start.y - event.clientY) * 100 / overflowY) : start.camera.y,
      zoom: start.camera.zoom,
    });
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
  }

  const audioControl = track && <button type="button" className="ghost btn-sm" onClick={toggleBgm}>
    {playing ? 'Pause BGM' : 'Play BGM'}
  </button>;
  return <>
    <button ref={launch} type="button" className="primary" aria-haspopup="dialog" onClick={enter}>Enter {scene.title}</button>
    {track && <audio ref={audio} preload="none" loop onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onError={() => { setPlaying(false); setAudioError(true); }} />}
    {open && createPortal(
      <dialog ref={dialog} className="event-scene-dialog" aria-labelledby={titleId} data-native-home={nativeHome || undefined}
        onCancel={event => { event.preventDefault(); event.stopPropagation(); leave(); }}
        onKeyDown={event => event.stopPropagation()}>
        <div ref={stage} className="event-scene-stage" role="region" tabIndex={0} aria-label="Scene camera" aria-describedby={helpId}
          data-dragging={dragging ? 'true' : undefined}
          onKeyDown={moveWithKeys} onPointerDown={beginDrag} onPointerMove={moveDrag} onLostPointerCapture={endDrag}>
          {sceneArt !== 'error' && <div className="event-scene-image" style={{
            '--scene-ratio': sceneRatio,
            '--scene-x': camera.x / 100,
            '--scene-y': camera.y / 100,
            '--scene-zoom': camera.zoom,
          } as CSSProperties}>
            <ContentImg eager className="event-scene-background" src={scene.image} alt={scene.title} draggable={false}
              onLoad={({ currentTarget }) => {
                setSceneRatio(currentTarget.naturalWidth / currentTarget.naturalHeight);
                setSceneArt('ready');
              }}
              onError={() => setSceneArt('error')} />
            {scene.native && sceneArt === 'ready' && <EventSceneCanvas source={scene.native} background={scene.image} animationStart={animationStart} />}
            {view === 'theme' && theme && <EventHomeTheme theme={theme} animationStart={animationStart} />}
          </div>}
          {sceneArt !== 'ready' && <p className="event-scene-message" role="status">
            {sceneArt === 'loading' ? 'Loading scene artwork…' : 'Scene artwork unavailable.'}
          </p>}
        </div>
        <header className="event-scene-header">
          <div className="event-scene-title">
            <h2 id={titleId} className="entity-title">{scene.title}</h2>
            <span>{scene.name}{view === 'theme' && theme ? ` · ${theme.name}` : ''}</span>
          </div>
          <XButton label="Close scene" onClick={leave} />
        </header>
        <footer className="event-scene-dock">
          <div className="event-scene-controls">
            {theme && <SegmentedControl<SceneView> label="Preview mode" value={view}
              options={[{ value: 'room', label: 'Room' }, { value: 'theme', label: 'Home screen' }]}
              onChange={next => { setView(next); setCamera(WIDE); }} />}
            {audioControl}
          </div>
          <div className="event-scene-caption">
            <span id={helpId}>Drag to pan. Ctrl or ⌘ + scroll to zoom.</span>
            {audioError && <span role="status">BGM unavailable.</span>}
            {track && <a href={track.source} target="_blank" rel="noreferrer">{track.title}</a>}
          </div>
        </footer>
      </dialog>, document.body,
    )}
  </>;
}
