import { useEffect, useRef, type PointerEvent } from 'react';
import type { spine as Spine } from '@/lib/vendor/spine-3.8/spine-webgl';
import { ANIMATION_MIX, INTRO_ANIMATION, TOUCH_ANIMATION, openingPlan, parseDynamicModel, pressPlan, type DynamicModel } from '@/lib/skins/dynamicArt';

/*
 * One animated artwork (a dynamic illustration), drawn with the official Spine 3.8 runtime into
 * a canvas over the still picture in the focused artwork view (SkinZoomOverlay).
 *
 * Loaded only when the reader presses Animated: SkinZoomOverlay brings this file in with
 * next/dynamic, and this file brings in the runtime (lib/vendor/spine-3.8) with import() once it
 * mounts, so neither is ever part of a page's bundle (scripts/tests/test-dynamic-art.ts). Then
 * the model: model.json, its skeleton, atlas and texture pages, from the folder model.json is in
 * (arkpedia-l2d-assets at a pinned commit; raw.githubusercontent.com answers with CORS, which a
 * WebGL texture needs). The textures are premultiplied at import, so they are drawn that way.
 *
 * An outfit with an entrance (model.json `entrance`) also loads that sequence: a second skeleton,
 * drawn in the illustration's coordinates with the same camera, and its soundtrack. Intro plays
 * it, then the illustration's Start, then Idle, as the game does; while the soundtrack plays, the
 * entrance follows the soundtrack's clock, so the two stay together.
 *
 * Closing the view unmounts this: the loop stops, the textures, buffers and shaders are freed, the
 * soundtrack stops and the WebGL context is let go (WEBGL_lose_context), so a reader who opens
 * twenty outfits does not hold twenty contexts.
 */

export type DynamicArtworkStatus =
  | { kind: 'loading' }
  /** The first frame is on the canvas: the still picture can step aside. `sound`: the outfit's
   *  entrance has a soundtrack (the view then offers a Sound switch). */
  | { kind: 'ready'; animations: string[]; sound: boolean }
  | { kind: 'error'; message: string };

interface Props {
  /** The model.json URL, from the page's pointer (data/dynamic-art.json). */
  model: string;
  /** The artwork's name, for the canvas's accessible name. */
  label: string;
  /** The still picture's zoom and pan as a CSS transform: the canvas takes the same one. */
  transform: string;
  /** The zoom factor, so the canvas draws at a resolution that keeps up with it (to a cap). */
  scale: number;
  /** A button press: play this animation. A new id plays it again. */
  request: { name: string; id: number } | null;
  /** Whether the entrance's soundtrack is heard (the view's Sound switch). */
  sound: boolean;
  onStatus: (status: DynamicArtworkStatus) => void;
  /** The animation now playing, for the buttons' pressed state; null while it stands still. */
  onPlaying: (name: string | null) => void;
}

interface Player {
  press: (name: string) => void;
  resize: () => void;
  setSound: (on: boolean) => void;
  dispose: () => void;
}

type SpineRuntime = typeof Spine;

async function fetchOk(url: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(url, { signal, mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response;
}

function loadImage(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  const image = new Image();
  // Cross-origin pixels may only reach WebGL through CORS.
  image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  signal.addEventListener('abort', () => { image.src = ''; }, { once: true });
  image.src = url;
  return image.decode().then(() => image);
}

type SkeletonPart = Pick<DynamicModel, 'skeleton' | 'atlas' | 'textures'>;

/** One skeleton's files (the illustration's or the entrance's), fetched side by side. */
async function loadSkeleton(part: SkeletonPart, file: (name: string) => string, signal: AbortSignal) {
  const [skeleton, atlas, pages] = await Promise.all([
    fetchOk(file(part.skeleton.file), signal).then((response): Promise<ArrayBuffer | string> => part.skeleton.format === 'binary' ? response.arrayBuffer() : response.text()),
    fetchOk(file(part.atlas.file), signal).then((response) => response.text()),
    Promise.all(part.textures.map(async (texture) => [texture.file, await loadImage(file(texture.file), signal)] as const)),
  ]);
  return { skeleton, atlas, pages: new Map(pages) };
}

/** The soundtrack, ready to play from its start (a failure only means a silent entrance). */
function loadAudio(url: string, signal: AbortSignal): Promise<HTMLAudioElement | null> {
  const audio = new Audio();
  audio.crossOrigin = 'anonymous';
  audio.preload = 'auto';
  signal.addEventListener('abort', () => { audio.removeAttribute('src'); audio.load(); }, { once: true });
  return new Promise((resolve) => {
    audio.addEventListener('canplaythrough', () => resolve(audio), { once: true });
    audio.addEventListener('error', () => resolve(null), { once: true });
    audio.src = url;
    audio.load();
  });
}

/** The model's files, fetched side by side from the folder its model.json is in: the
 *  illustration, and its entrance and soundtrack when it has one. */
async function loadModel(url: string, signal: AbortSignal) {
  const model = parseDynamicModel(await (await fetchOk(url, signal)).json());
  const file = (name: string) => new URL(name, url).href;
  const [illustration, entrance, audio] = await Promise.all([
    loadSkeleton(model, file, signal),
    model.entrance ? loadSkeleton(model.entrance, file, signal) : null,
    model.entrance?.audio ? loadAudio(file(model.entrance.audio.file), signal) : null,
  ]);
  return { model, ...illustration, entrance, audio };
}

type SpineContext = InstanceType<SpineRuntime['webgl']['ManagedWebGLRenderingContext']>;

/** A skeleton and its animation state, read from loaded files. */
function readSkeleton(spine: SpineRuntime, context: SpineContext, files: Awaited<ReturnType<typeof loadSkeleton>>, track: Spine.TextureAtlas[]) {
  const atlas = new spine.TextureAtlas(files.atlas, (page) => {
    const image = files.pages.get(page);
    if (!image) throw new Error(`The atlas names a page model.json does not list: ${page}`);
    return new spine.webgl.GLTexture(context, image);
  });
  track.push(atlas);
  const loader = new spine.AtlasAttachmentLoader(atlas);
  const data = typeof files.skeleton === 'string'
    ? new spine.SkeletonJson(loader).readSkeletonData(files.skeleton)
    : new spine.SkeletonBinary(loader).readSkeletonData(new Uint8Array(files.skeleton));
  const skeleton = new spine.Skeleton(data);
  skeleton.setToSetupPose();
  skeleton.updateWorldTransform();
  const stateData = new spine.AnimationStateData(data);
  stateData.defaultMix = ANIMATION_MIX;
  return { data, skeleton, state: new spine.AnimationState(stateData) };
}

function createPlayer(spine: SpineRuntime, host: HTMLElement, files: Awaited<ReturnType<typeof loadModel>>, options: {
  reducedMotion: boolean;
  sound: boolean;
  scale: () => number;
  onFirstFrame: (animations: string[], sound: boolean) => void;
  onPlaying: (name: string | null) => void;
}): Player {
  const { model } = files;
  const canvas = document.createElement('canvas');
  canvas.className = 'skin-zoom-canvas-surface';
  host.appendChild(canvas);
  const context = new spine.webgl.ManagedWebGLRenderingContext(canvas, { alpha: true, premultipliedAlpha: true, antialias: true });
  const gl = context.gl;
  const atlases: Spine.TextureAtlas[] = [];
  let renderer: Spine.webgl.SceneRenderer | null = null;
  const audio = files.audio;
  const release = () => {
    audio?.pause();
    for (const atlas of atlases) atlas.dispose();
    renderer?.dispose();
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.remove();
  };
  try {
    if (!gl) throw new Error('WebGL is not available');
    const { data, skeleton, state } = readSkeleton(spine, context, files, atlases);
    // The entrance: its own skeleton and state, drawn instead of the illustration while it plays.
    const entrance = files.entrance ? readSkeleton(spine, context, files.entrance, atlases) : null;
    renderer = new spine.webgl.SceneRenderer(canvas, context, true);
    const names = data.animations.map((animation) => animation.name);
    const scene = renderer;
    const reduced = options.reducedMotion;
    const hasEntrance = entrance !== null;
    let inEntrance = false;
    let then: { play: string; rest: string | null } | null = null;
    if (audio) audio.muted = !options.sound;

    state.addListener({
      start: (entry) => options.onPlaying(entry.animation.name),
      complete: (entry) => { if (reduced && !entry.loop && state.getCurrent(0) === entry) options.onPlaying(null); },
      interrupt: () => {}, end: () => {}, dispose: () => {}, event: () => {},
    });
    // The entrance over: the illustration takes over with what was queued after it (its Start,
    // then Idle). The soundtrack plays on to its own end.
    entrance?.state.addListener({
      start: () => {}, interrupt: () => {}, end: () => {}, dispose: () => {}, event: () => {},
      complete: () => {
        if (!inEntrance || !then) return;
        inEntrance = false;
        const next = then;
        then = null;
        state.setAnimation(0, next.play, false);
        if (next.rest) state.addAnimation(0, next.rest, true, 0);
      },
    });

    /** Plays the entrance from its start (and its soundtrack), then `play` and `rest`. */
    const startEntrance = (play: string, rest: string | null) => {
      if (!entrance) return;
      inEntrance = true;
      then = { play, rest };
      entrance.skeleton.setToSetupPose();
      entrance.state.setAnimation(0, INTRO_ANIMATION, false);
      options.onPlaying(INTRO_ANIMATION);
      if (audio) {
        audio.currentTime = 0;
        // A browser may refuse sound it was not asked for in a click: the entrance plays silent.
        audio.play().catch(() => {});
      }
    };
    const stopEntrance = () => {
      inEntrance = false;
      then = null;
      audio?.pause();
    };

    const draw = () => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      scene.begin();
      scene.drawSkeleton(inEntrance && entrance ? entrance.skeleton : skeleton, model.premultipliedAlpha);
      scene.end();
    };

    // Under reduced motion the loop runs only while something the reader asked for plays.
    const moving = () => {
      if (!reduced || inEntrance) return true;
      const current = state.getCurrent(0);
      return !!current && (!!current.mixingFrom || (current.timeScale !== 0 && (current.loop || !current.isComplete())));
    };
    let frameId = 0;
    let last = 0;
    let firstFrame = true;
    const frame = (now: number) => {
      frameId = 0;
      const delta = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      if (inEntrance && entrance) {
        // While the soundtrack plays, the entrance keeps to its clock: it catches up after the tab
        // was hidden (no frames) and never runs ahead of the music.
        const current = entrance.state.getCurrent(0);
        const heard = audio && !audio.paused && current;
        entrance.state.update(heard ? Math.min(Math.max(audio.currentTime - current.trackTime, 0), 0.25) : delta);
        entrance.state.apply(entrance.skeleton);
        entrance.skeleton.updateWorldTransform();
      }
      if (!inEntrance) {
        state.update(delta);
        state.apply(skeleton);
        skeleton.updateWorldTransform();
      }
      draw();
      if (firstFrame) { firstFrame = false; options.onFirstFrame(names, !!audio); }
      if (moving()) frameId = requestAnimationFrame(frame);
      else last = 0;
    };
    const run = () => { if (!frameId) frameId = requestAnimationFrame(frame); };

    // Framed by the model's bounds (setup pose and Idle at its first frame, from model.json),
    // contained in the canvas, which has the still picture's box.
    let size = '';
    const resize = () => {
      const width = host.clientWidth, height = host.clientHeight;
      if (!width || !height) return;
      const max = Math.min(4096, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number || 4096);
      const density = Math.min(window.devicePixelRatio || 1, 2) * Math.min(Math.max(options.scale(), 1), 2.5);
      const fit = Math.min(1, max / (Math.max(width, height) * density));
      const w = Math.max(1, Math.round(width * density * fit)), h = Math.max(1, Math.round(height * density * fit));
      if (`${w}x${h}` === size) return;
      size = `${w}x${h}`;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      const { x, y, width: bw, height: bh } = model.bounds;
      let viewWidth = bw * 1.02, viewHeight = bh * 1.02;
      if (viewWidth / viewHeight < w / h) viewWidth = viewHeight * (w / h);
      else viewHeight = viewWidth / (w / h);
      scene.camera.position.x = x + bw / 2;
      scene.camera.position.y = y + bh / 2;
      scene.camera.viewportWidth = viewWidth;
      scene.camera.viewportHeight = viewHeight;
      if (!frameId) frame(performance.now());
    };

    const press = (name: string) => {
      if (!names.includes(name)) return;
      const plan = pressPlan(name, names, reduced, hasEntrance);
      if (plan.entrance) {
        startEntrance(plan.play, plan.then);
      } else {
        stopEntrance();
        state.setAnimation(0, plan.play, plan.loop);
        if (plan.then) state.addAnimation(0, plan.then, true, 0);
      }
      run();
    };

    const plan = openingPlan(names, reduced, hasEntrance);
    if (plan.entrance && plan.loop) {
      // The illustration waits at its resting pose behind the entrance, then plays Start and Idle.
      state.setAnimation(0, plan.loop, true);
      startEntrance(plan.intro ?? plan.loop, plan.intro ? plan.loop : null);
    } else if (plan.intro && plan.loop) {
      state.setAnimation(0, plan.intro, false);
      state.addAnimation(0, plan.loop, true, 0);
    } else if (plan.loop) {
      state.setAnimation(0, plan.loop, true);
    } else if (plan.pose) {
      // Reduced motion: the resting pose, standing still at its first frame. Nothing is playing
      // (the start event fired inside setAnimation, before the entry was stopped).
      state.setAnimation(0, plan.pose, false).timeScale = 0;
      options.onPlaying(null);
    }
    const observer = new ResizeObserver(() => resize());
    observer.observe(host);
    resize();
    run();
    return {
      press,
      resize,
      setSound: (on: boolean) => { if (audio) audio.muted = !on; },
      dispose: () => {
        if (frameId) cancelAnimationFrame(frameId);
        frameId = 0;
        observer.disconnect();
        state.clearListeners();
        entrance?.state.clearListeners();
        release();
      },
    };
  } catch (error) {
    release();
    throw error;
  }
}

export default function DynamicArtwork({ model, label, transform, scale, request, sound, onStatus, onPlaying }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const scaleRef = useRef(scale);
  const soundRef = useRef(sound);
  const handlers = useRef({ onStatus, onPlaying });
  const tap = useRef<{ x: number; y: number; at: number } | null>(null);

  useEffect(() => { handlers.current = { onStatus, onPlaying }; }, [onStatus, onPlaying]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const controller = new AbortController();
    let player: Player | null = null;
    handlers.current.onStatus({ kind: 'loading' });
    (async () => {
      const [{ spine }, files] = await Promise.all([import('@/lib/vendor/spine-3.8/spine-webgl'), loadModel(model, controller.signal)]);
      if (controller.signal.aborted) return;
      player = createPlayer(spine, host, files, {
        reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
        sound: soundRef.current,
        scale: () => scaleRef.current,
        onFirstFrame: (animations, hasSound) => { if (!controller.signal.aborted) handlers.current.onStatus({ kind: 'ready', animations, sound: hasSound }); },
        onPlaying: (name) => { if (!controller.signal.aborted) handlers.current.onPlaying(name); },
      });
      playerRef.current = player;
    })().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      console.warn('[dynamic art]', model, error);
      const webgl = error instanceof Error && /WebGL/.test(error.message);
      handlers.current.onStatus({ kind: 'error', message: webgl ? 'This browser cannot draw the animated art.' : 'The animated art could not be loaded.' });
    });
    return () => {
      controller.abort();
      player?.dispose();
      playerRef.current = null;
    };
  }, [model]);

  useEffect(() => {
    if (request) playerRef.current?.press(request.name);
  }, [request]);

  useEffect(() => {
    scaleRef.current = scale;
    playerRef.current?.resize();
  }, [scale]);

  useEffect(() => {
    soundRef.current = sound;
    playerRef.current?.setSound(sound);
  }, [sound]);

  // A tap on the artwork is Touch, as in the game; a drag (panning the zoomed view) is not.
  function onPointerDown(event: PointerEvent) {
    tap.current = { x: event.clientX, y: event.clientY, at: event.timeStamp };
  }
  function onPointerUp(event: PointerEvent) {
    const start = tap.current;
    tap.current = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6 || event.timeStamp - start.at > 600) return;
    playerRef.current?.press(TOUCH_ANIMATION);
  }

  return (
    <div ref={hostRef} className="skin-zoom-canvas" role="img" aria-label={`${label}, animated`} style={{ transform }}
      onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { tap.current = null; }} />
  );
}

