import { useEffect, useRef, type PointerEvent } from 'react';
import { useContentUrl } from '@/lib/content/context';
import { assetAudioUrl, fetchAsset, loadAssetImage, retryAssetAudioOnNextPress, retryAssetMedia } from '@/lib/assets/assetRetry';
import { alphaBox, visibleWorldBox, posterView, type ArtworkBox } from '@/lib/skins/artworkFraming';
import { selectableAnimations, voiceActionEnd, voiceAnimation, VoiceChoreography, type ArtworkVoice } from '@/lib/skins/dynamicPlayback';
import type { spine as Spine } from '@/lib/vendor/spine-3.8/spine-webgl';
import { premultipliedTexture } from '@/lib/spine/premultipliedTexture';
import {
  ANIMATION_MIX, HANDOVER_SECONDS, INTRO_ANIMATION, TOUCH_ANIMATION, cameraAt, fadesAt, handoverIn, handoverOut, openingPlan,
  parseDynamicModel, pressPlan, restingView, viewBetween, type DynamicModel, type View,
} from '@/lib/skins/dynamicArt';
import { layerClock, parseDynamicLayers, partRanges, type DynamicLayers, type LayerClock } from '@/lib/skins/dynamicLayers';
import { parseParticleText, type ParticleDocument, type ParticleSystemData } from '@/lib/skins/particleData';
import { followPlacement } from '@/lib/skins/particleGeometry';
import { ACTION_END, MODEL_SEED, ParticleDirector } from '@/lib/skins/particleSim';
import { createLayerRenderer, type LayerRenderer } from './dynamicLayerRenderer';
import { createParticleRenderer, type ParticleRenderer } from './particleRenderer';

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
 * entrance follows the soundtrack's clock, so the two stay together. It is seen through the game's
 * own camera (model.json entrance.camera: its pans, zooms, roll and the full-screen fades that hide
 * its cuts, drawn as a veil over the canvas), and the view then settles onto the illustration's
 * framing as the hand-over colour clears.
 *
 * The illustration prefab's own mesh layers (model.json `layers`: the skies, windows, frames and
 * glows the game draws with the skeleton, lib/skins/dynamicLayers.ts) load with the rest and draw in
 * the game's order around the skeleton's parts (SkeletonPartsRenderer slot ranges), each with its
 * blend, on its own timeline, on the bone it follows, and the Interact/Special/Start groups only while
 * their animation plays. Layers drawn with one of the game's effect shaders (flow distortion,
 * dissolve, ramps, vertex noise) go through programs ported from that shader's GLSL, one that does
 * not build here leaving only its own layers out. Under reduced motion they stand at their first
 * frame. The view frames the skeleton and its layers together. A layers file that fails to load
 * only leaves them out.
 *
 * Its particle systems (layers.json's pointer to layerParticles.json, lib/skins/particleData.ts) are
 * simulated on the CPU (lib/skins/particleSim.ts's director, on the layers' clock: a group's systems
 * while its animation plays, a fixed 1/60 s step, ACTION_END when an action ends) and drawn where
 * layers.json's particle runs stand (components/skins/particleRenderer.ts). The file and the idle
 * textures load beside the layers; the first frame waits for them at most PARTICLE_GRACE_MS after
 * everything else is ready, and if they come later they fade in over PARTICLE_FADE_MS, already
 * prewarmed. An action's textures load in the background (its systems draw once they are in). Under
 * reduced motion the looping idle systems stand still at 3 s (the director's REDUCED_STILL) and a
 * pressed animation's play out and stop. A particle file or texture that fails to load, or a program
 * that does not build, only leaves particles out.
 *
 * Closing the view unmounts this: the loop stops, the textures, buffers and shaders are freed, the
 * soundtrack stops and the WebGL context is let go (WEBGL_lose_context), so a reader who opens
 * twenty outfits does not hold twenty contexts.
 */

export type DynamicArtworkStatus =
  | { kind: 'loading' }
  /** The first frame is on the canvas: the still picture can step aside. `sound`: the outfit's
   *  entrance has a soundtrack (the view then offers a Sound switch). */
  | { kind: 'ready'; animations: string[]; labels: Record<string, string>; sound: boolean }
  | { kind: 'error'; message: string };

interface Props {
  /** The model.json URL, from the page's pointer (data/dynamic-art.json). */
  model: string;
  /** The still image used to keep the two views in the same frame. */
  poster: string;
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
  voiceOperator?: string;
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
  const response = await fetchAsset(url, { signal, mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response;
}

function loadImage(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  // Cross-origin pixels may only reach WebGL through CORS.
  return loadAssetImage(url, { crossOrigin: 'anonymous', signal });
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

/** One small alpha mask; no full-resolution image pixels are retained. */
async function loadPoster(url: string, signal: AbortSignal): Promise<ArtworkBox | null> {
  try {
    const image = await loadImage(url, signal);
    const mask = document.createElement('canvas');
    const density = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
    mask.width = Math.max(1, Math.round(image.naturalWidth * density));
    mask.height = Math.max(1, Math.round(image.naturalHeight * density));
    const context = mask.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, mask.width, mask.height);
    return alphaBox(context.getImageData(0, 0, mask.width, mask.height).data, mask.width, mask.height);
  } catch { return null; }
}

/** The soundtrack, ready to play from its start (a failure only means a silent entrance). */
function loadAudio(url: string, signal: AbortSignal): Promise<HTMLAudioElement | null> {
  const audio = new Audio();
  audio.crossOrigin = 'anonymous';
  audio.preload = 'auto';
  signal.addEventListener('abort', () => { audio.removeAttribute('src'); audio.load(); }, { once: true });
  return new Promise((resolve) => {
    audio.addEventListener('canplaythrough', () => resolve(audio), { once: true });
    // A false 404 is tried again at another encoding of the file (lib/assets/assetRetry.ts).
    audio.addEventListener('error', () => { if (signal.aborted || !retryAssetMedia(audio)) resolve(null); });
    audio.src = url;
    audio.load();
  });
}

/** How long the first frame waits for the particles after everything else is ready, and how long they fade in
 *  when they come after it (plan section 4). */
const PARTICLE_GRACE_MS = 1500;
const PARTICLE_FADE_MS = 400;

/** The particle file and its textures: the idle ones loaded, an action's (Start, Interact, Special) still
 *  loading, each image or null when it fails. */
interface ParticleFiles {
  doc: ParticleDocument;
  idle: Map<number, HTMLImageElement>;
  later: { index: number; image: Promise<HTMLImageElement | null> }[];
}

/** The particles: the file and the idle textures (null, and particles left out, when either fails to load). */
async function loadParticles(file: string, layerTextures: number, url: (name: string) => string, signal: AbortSignal): Promise<ParticleFiles | null> {
  try {
    const doc = parseParticleText(await (await fetchOk(url(file), signal)).text(), layerTextures);
    if (doc.skipped.length) console.warn('[particles] systems this reader does not draw were left out:', doc.skipped.length);
    const at = (i: number) => layerTextures + i;
    const later = doc.textures.flatMap((texture, i) => (texture.phase === 'idle' ? [] : [{
      index: at(i), image: loadImage(url(texture.file), signal).catch((error: unknown) => {
        if (!signal.aborted) console.warn('[particles] a texture could not be loaded; its systems are left out', texture.file, error);
        return null;
      }),
    }]));
    const idle = new Map(await Promise.all(doc.textures.flatMap((texture, i) => (texture.phase === 'idle' ? [loadImage(url(texture.file), signal).then((image) => [at(i), image] as const)] : []))));
    return { doc, idle, later };
  } catch (error) {
    if (!signal.aborted) console.warn('[particles] the particles could not be loaded; the artwork plays without them', error);
    return null;
  }
}

/** The mesh layers and their textures, and their particles (loading beside the textures, never waited on here);
 *  null (the artwork plays without them) when the layers fail to load. */
async function loadLayers(file: string, url: (name: string) => string, signal: AbortSignal): Promise<{ layers: DynamicLayers; images: HTMLImageElement[]; particles: Promise<ParticleFiles | null> | null } | null> {
  try {
    const layers = parseDynamicLayers(await (await fetchOk(url(file), signal)).json());
    if (layers.skipped) console.warn('[dynamic art] layers this reader does not understand were left out:', layers.skipped);
    const particles = layers.particles ? loadParticles(layers.particles.file, layers.textures.length, url, signal) : null;
    const images = await Promise.all(layers.textures.map((texture) => loadImage(url(texture.file), signal)));
    return { layers, images, particles };
  } catch (error) {
    if (signal.aborted) throw error;
    console.warn('[dynamic art] the layers could not be loaded; the artwork plays without them', error);
    return null;
  }
}

/** The model's files, fetched side by side from the folder its model.json is in: the
 *  illustration, its mesh layers, and its entrance and soundtrack when it has one. */
async function loadModel(url: string, signal: AbortSignal, operator: string | undefined, resolveUrl: (url: string) => string, poster: string) {
  url = resolveUrl(url);
  const model = parseDynamicModel(await (await fetchOk(url, signal)).json());
  const file = (name: string) => new URL(name, url).href;
  const voices: ArtworkVoice[] = operator && model.playback?.voiceActions.length ? await fetchOk(`/api/artwork-voices?operator=${encodeURIComponent(operator)}&skinId=${encodeURIComponent(model.skinId.replace(/\^sp_dyn$/, ''))}`, signal)
    .then(r => r.json()).then((records: ArtworkVoice[]) => records.map(v => ({ ...v, url: resolveUrl(v.url) }))).catch(() => []) : [];
  const [illustration, entrance, audio, layers, posterBounds] = await Promise.all([
    loadSkeleton(model, file, signal),
    model.entrance ? loadSkeleton(model.entrance, file, signal) : null,
    model.entrance?.audio ? loadAudio(file(model.entrance.audio.file), signal) : null,
    model.layers ? loadLayers(model.layers.file, file, signal) : null,
    loadPoster(resolveUrl(poster), signal),
  ]);
  return { model, ...illustration, entrance, audio, layers, voices, posterBounds };
}

type SpineContext = InstanceType<SpineRuntime['webgl']['ManagedWebGLRenderingContext']>;

/** A skeleton and its animation state, read from loaded files. */
function readSkeleton(spine: SpineRuntime, context: SpineContext, files: Awaited<ReturnType<typeof loadSkeleton>>, track: Spine.TextureAtlas[]) {
  const atlas = new spine.TextureAtlas(files.atlas, (page) => {
    const image = files.pages.get(page);
    if (!image) throw new Error(`The atlas names a page model.json does not list: ${page}`);
    return premultipliedTexture(spine, context, image);
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
  onFirstFrame: (animations: string[], sound: boolean, labels: Record<string, string>) => void;
  onPlaying: (name: string | null) => void;
  /** The particles, when they came within the grace; else the load still running (they fade in), or null. */
  particles: { ready: ParticleFiles | null; later: Promise<ParticleFiles | null> | null };
}): Player {
  const { model } = files;
  const canvas = document.createElement('canvas');
  canvas.className = 'skin-zoom-canvas-surface';
  host.appendChild(canvas);
  const context = new spine.webgl.ManagedWebGLRenderingContext(canvas, { alpha: true, premultipliedAlpha: true, antialias: true });
  const gl = context.gl;
  const atlases: Spine.TextureAtlas[] = [];
  let renderer: Spine.webgl.SceneRenderer | null = null;
  let layerRenderer: LayerRenderer | null = null;
  let particleRenderer: ParticleRenderer | null = null;
  let disposed = false;
  const audio = files.audio;
  let voiceAudio: HTMLAudioElement | null = null;
  let sound = options.sound;
  let voiceTimeout: ReturnType<typeof setTimeout> | null = null;
  // The entrance camera's full-screen fades and hand-over colour, over the canvas.
  const veil = document.createElement('div');
  veil.className = 'skin-zoom-canvas-veil';
  host.appendChild(veil);
  const release = () => {
    audio?.pause();
    if (voiceTimeout) clearTimeout(voiceTimeout);
    voiceAudio?.pause();
    voiceAudio?.removeAttribute('src');
    voiceAudio?.load();
    veil.remove();
    for (const atlas of atlases) atlas.dispose();
    particleRenderer?.dispose();
    particleRenderer = null;
    layerRenderer?.dispose();
    renderer?.dispose();
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.remove();
  };
  try {
    if (!gl) throw new Error('WebGL is not available');
    const { data, skeleton, state } = readSkeleton(spine, context, files, atlases);
    for (const mix of model.mixes) state.data.setMix(mix.from, mix.to, mix.duration);
    // The entrance: its own skeleton and state, drawn instead of the illustration while it plays.
    const entrance = files.entrance ? readSkeleton(spine, context, files.entrance, atlases) : null;
    renderer = new spine.webgl.SceneRenderer(canvas, context, true);
    let layers = files.layers?.layers ?? null;
    if (files.layers) {
      // A layer program that fails to build (or a lost context) leaves the layers out; the skeleton still plays.
      try {
        layerRenderer = createLayerRenderer(context, files.layers.layers, files.layers.images, skeleton);
      } catch (error) {
        console.warn('[dynamic art] layers left out', error);
        layerRenderer = null;
        layers = null;
      }
    }
    // The illustration is framed with its layers (their bounds include the skeleton's).
    const restBounds = layers?.bounds ?? model.bounds;
    let visibleArtwork: ArtworkBox | null = null;
    const restView = () => visibleArtwork && files.posterBounds ? posterView(visibleArtwork, files.posterBounds, aspect) : restingView(restBounds, aspect);
    // How many skeleton parts the ranges are worked out for (the parts are numbered from 0).
    const parts = layers ? layers.draw.reduce((most, entry) => (entry.kind === 'part' ? Math.max(most, entry.index + 1) : most), 0) : 0;
    // The particle systems: their simulation on the layers' clock and their renderer, once the file is in.
    let director: ParticleDirector | null = null;
    let particleDoc: ParticleDocument | null = null;
    // When late particles began to fade in (performance.now()), or null: shown in full.
    let fadeFrom: number | null = null;
    const placed = (data: ParticleSystemData) => {
      const bone = data.follow ? skeleton.findBone(data.follow.bone) : null;
      return !data.follow || (!!bone && bone.active);
    };
    const placements = (data: ParticleSystemData) => {
      const bone = data.follow ? skeleton.findBone(data.follow.bone) : null;
      return data.follow && bone && bone.active && particleDoc ? followPlacement(data.follow, bone, particleDoc.unit, data.clock.scaling) : null;
    };
    const attachParticles = (loaded: ParticleFiles, late: boolean) => {
      if (disposed || !layers || !layerRenderer || particleRenderer) return;
      const layerTextures = layerRenderer;
      try {
        const runs = layers.draw.flatMap((entry) => (entry.kind === 'particles' ? [entry.systems] : []));
        particleRenderer = createParticleRenderer(context, loaded.doc, runs, layers.textures, (index) => layerTextures.texture(index));
        for (const [index, image] of loaded.idle) particleRenderer.addTexture(index, image);
        director = new ParticleDirector(loaded.doc, { reduced: options.reducedMotion, actionEnd: ACTION_END, modelSeed: MODEL_SEED, precision: 32 });
        particleDoc = loaded.doc;
      } catch (error) {
        console.warn('[particles] left out', error);
        particleRenderer?.dispose();
        particleRenderer = null;
        director = null;
        return;
      }
      // An action's textures, as they arrive (its systems simulate meanwhile, and draw once they are in).
      for (const { index, image } of loaded.later) {
        image.then((img) => { if (img && particleRenderer && !disposed) particleRenderer.addTexture(index, img); }, () => {});
      }
      // Late (after the first frame): fade in; under reduced motion they simply appear, drawn once.
      fadeFrom = late && !options.reducedMotion ? performance.now() : null;
      if (late) run();
    };
    // How long the illustration has run since it took over (the layers' clock).
    let illustrationTime = 0;
    const names = selectableAnimations(data.animations.map((animation) => animation.name), model.playback);
    const labels = Object.fromEntries((model.playback?.voiceActions ?? []).map((action, i) => [voiceAnimation(action.id), files.voices.find(v => v.id === action.id)?.title ?? `Dialogue ${i + 1}`]));
    const scene = renderer;
    const reduced = options.reducedMotion;
    const hasEntrance = entrance !== null;
    let inEntrance = false;
    let then: { play: string; rest: string | null } | null = null;
    if (audio) audio.muted = !options.sound;
    const camera = model.entrance?.camera ?? null;
    const entranceLength = entrance?.data.findAnimation(INTRO_ANIMATION)?.duration ?? 0;
    let aspect = 1;
    let lastView: View | null = null;
    // After the entrance: from its last view onto the illustration's, the hand-over colour clearing.
    let handover: { from: View; colour: [number, number, number, number] | null; start: number } | null = null;

    let speech: { key: string; choreography: VoiceChoreography; time: number; end: number; waiting: boolean; heard: boolean } | null = null;
    const stopSpeech = () => {
      speech = null;
      if (voiceTimeout) clearTimeout(voiceTimeout);
      voiceTimeout = null;
      voiceAudio?.pause();
      voiceAudio?.removeAttribute('src');
      voiceAudio?.load();
      voiceAudio = null;
      if (state.getCurrent(1)) state.setEmptyAnimation(1, 0.1);
    };
    state.addListener({
      start: (entry) => { if (entry.trackIndex === 0 && !speech) options.onPlaying(entry.animation.name); },
      complete: (entry) => { if (reduced && !speech && !entry.loop && state.getCurrent(0) === entry) options.onPlaying(null); },
      interrupt: () => {}, end: () => {}, dispose: () => {}, event: () => {},
    });
    // The entrance over: the illustration takes over with what was queued after it (its Start,
    // then Idle). The soundtrack plays on to its own end.
    entrance?.state.addListener({
      start: () => {}, interrupt: () => {}, end: () => {}, dispose: () => {}, event: () => {},
      complete: () => {
        if (!inEntrance || !then) return;
        inEntrance = false;
        if (camera) handover = { from: lastView ?? restView(), colour: handoverOut(camera, entranceLength), start: performance.now() };
        illustrationTime = 0;
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
      handover = null;
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
      handover = null;
      audio?.pause();
    };

    /** What the camera shows now, and the veil's layers (bottom to top, [r, g, b, alpha]). */
    const framing = (now: number): { view: View; layers: [number, number, number, number][] } => {
      const rest = restView();
      if (inEntrance && camera) {
        const t = entrance?.state.getCurrent(0)?.trackTime ?? 0;
        const view = cameraAt(camera, t);
        lastView = view;
        const layers = fadesAt(camera, t);
        const rising = handoverIn(camera, t, entranceLength);
        return { view, layers: rising ? [...layers, rising] : layers };
      }
      if (handover) {
        const k = (now - handover.start) / 1000 / HANDOVER_SECONDS;
        if (k >= 1) {
          handover = null;
          return { view: rest, layers: [] };
        }
        const colour = handover.colour;
        return { view: viewBetween(handover.from, rest, k), layers: colour ? [[colour[0], colour[1], colour[2], colour[3] * (1 - k)]] : [] };
      }
      return { view: rest, layers: [] };
    };
    let veilCss = '';
    const show = ({ view, layers }: ReturnType<typeof framing>) => {
      scene.camera.position.x = view.x;
      scene.camera.position.y = view.y;
      scene.camera.viewportHeight = view.height;
      scene.camera.viewportWidth = view.height * aspect;
      const roll = (view.roll * Math.PI) / 180;
      scene.camera.up.set(-Math.sin(roll), Math.cos(roll), 0);
      const css = layers.slice().reverse().map(([r, g, b, a]) => {
        const c = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a.toFixed(3)})`;
        return `linear-gradient(${c}, ${c})`;
      }).join(', ');
      if (css !== veilCss) {
        veilCss = css;
        veil.style.background = css;
      }
    };

    /** The layers' clock now (the particles run on it too). */
    const clockNow = (): LayerClock => {
      const current = state.getCurrent(0);
      return layerClock(reduced, current ? { name: current.animation.name, trackTime: current.trackTime,
        animationEnd: current.animationEnd, timeScale: current.timeScale } : null, illustrationTime);
    };

    const draw = (clock: LayerClock, particles = true) => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (inEntrance && entrance) {
        scene.begin();
        scene.drawSkeleton(entrance.skeleton, true);
        scene.end();
        return;
      }
      if (!layers || !layerRenderer) {
        scene.begin();
        scene.drawSkeleton(skeleton, true);
        scene.end();
        return;
      }
      // The game's order: each skeleton part's slot range, and the layers and particle runs around them. The
      // skeleton's batcher is ended once before a stretch of layers and runs, and begun again for the next part.
      const ranges = partRanges(skeleton.drawOrder.map((slot) => ({ name: slot.data.name, index: slot.data.index, active: slot.bone.active })), layers.separators, parts);
      // The batcher updates the camera when it begins; a layer or run before the first part needs this frame's too.
      scene.camera.update();
      const projection = scene.camera.projectionView.values;
      let open = false;
      for (const entry of layers.draw) {
        if (entry.kind === 'part') {
          if (!open) { scene.begin(); open = true; }
          const range = ranges[entry.index];
          if (range && parts === 1 && !layers.separators.length) scene.drawSkeleton(skeleton, true);
          else if (range) scene.drawSkeleton(skeleton, true, range[0], range[1]);
          continue;
        }
        if (open) { scene.end(); open = false; }
        if (entry.kind === 'layer') layerRenderer.draw(entry.layer, clock, projection);
        else if (particles) particleRenderer?.drawRun(entry.systems, projection);
      }
      if (open) scene.end();
    };

    // Under reduced motion the loop runs only while something the reader asked for plays.
    const moving = () => {
      if (!reduced || inEntrance || handover || speech) return true;
      const current = state.getCurrent(0);
      return !!current && (!!current.mixingFrom || (current.timeScale !== 0 && (current.loop || !current.isComplete())));
    };
    /** The particles one frame: stepped on the layers' clock, then expanded and uploaded for draw(). */
    const stepParticles = (clock: LayerClock, delta: number, now: number) => {
      if (!director || !particleRenderer || inEntrance) return;
      try {
        director.frame(clock, delta, placements);
        let fade = 1;
        if (fadeFrom !== null) {
          fade = Math.min(1, (now - fadeFrom) / PARTICLE_FADE_MS);
          if (fade >= 1) fadeFrom = null;
        }
        particleRenderer.prepare(director, { viewHeight: scene.camera.viewportHeight, fade, placed });
      } catch (error) {
        // Never the artwork: the particles alone are left out (and a fade in progress with them, so the loop
        // stops again under reduced motion).
        console.warn('[particles] left out', error);
        particleRenderer.dispose();
        particleRenderer = null;
        director = null;
        fadeFrom = null;
      }
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
        if (speech) {
          const current = speech;
          if (!current.waiting) current.time = current.heard && voiceAudio ? voiceAudio.currentTime : current.time + delta;
          if ((current.heard && voiceAudio?.ended) || (!current.heard && !current.waiting && current.time >= current.end)) {
            stopSpeech();
            const rest = pressPlan('Idle', names, reduced, hasEntrance);
            state.setAnimation(0, rest.play, rest.loop);
          } else {
            const steps = current.choreography.apply(current.time);
            const body = state.getCurrent(0), mouth = state.getCurrent(1);
            if (body && steps.body) body.trackTime = Math.max(0, current.time - steps.body.time);
            if (mouth && steps.mouth) mouth.trackTime = Math.max(0, current.time - steps.mouth.time);
          }
        }
        state.apply(skeleton);
        skeleton.updateWorldTransform();
        illustrationTime += delta;
      }
      show(framing(now));
      const clock = clockNow();
      stepParticles(clock, delta, now);
      draw(clock);
      if (firstFrame) { firstFrame = false; options.onFirstFrame(names, !!audio || files.voices.length > 0, labels); }
      if (moving() || fadeFrom !== null) frameId = requestAnimationFrame(frame);
      else last = 0;
    };
    const run = () => { if (!frameId) frameId = requestAnimationFrame(frame); };

    // Measure Idle once, with concurrent tracks and layers, then match the still image's visible
    // box. Setup bounds can include hidden attachments far outside the actual picture. Exclude
    // moving particles; later animations must not change the camera. Entrances keep their camera.
    let calibrated = false;
    const calibrate = () => {
      calibrated = true;
      if (!files.posterBounds) return;
      const width = canvas.width, height = canvas.height, wasEntrance = inEntrance;
      try {
        const density = Math.min(1, 1024 / Math.max(width, height));
        canvas.width = Math.max(1, Math.round(width * density));
        canvas.height = Math.max(1, Math.round(height * density));
        gl.viewport(0, 0, canvas.width, canvas.height);
        const reference = new spine.AnimationState(state.data);
        reference.setAnimation(0, 'Idle', true);
        for (const track of model.playback?.extraTracks ?? []) reference.setAnimation(track.track, track.name, true);
        skeleton.setToSetupPose();
        reference.apply(skeleton);
        skeleton.updateWorldTransform();
        inEntrance = false;
        const view = restingView(restBounds, aspect);
        show({ view, layers: [] });
        draw({ playing: 'Idle', animationTime: 0, time: 0 }, false);
        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const box = alphaBox(pixels, canvas.width, canvas.height, true);
        if (box) visibleArtwork = visibleWorldBox(view, aspect, box);
      } catch { /* The normal model framing still works when a reference cannot be measured. */ }
      finally {
        inEntrance = wasEntrance;
        skeleton.setToSetupPose();
        state.apply(skeleton);
        skeleton.updateWorldTransform();
        canvas.width = width; canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };
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
      aspect = w / h;
      if (!calibrated) calibrate();
      if (!frameId) frame(performance.now());
    };

    const press = (name: string) => {
      if (!names.includes(name)) return;
      stopSpeech();
      for (const track of model.playback?.extraTracks ?? []) { const entry = state.getCurrent(track.track); if (entry) entry.timeScale = 1; }
      const action = model.playback?.voiceActions.find(a => voiceAnimation(a.id) === name);
      if (action) {
        stopEntrance();
        speech = { key: name, choreography: new VoiceChoreography(action, state), time: 0, end: voiceActionEnd(action, model.animations), waiting: false, heard: false };
        speech.choreography.apply(0);
        options.onPlaying(name);
        const clip = files.voices.find(v => v.id === action.id);
        if (clip) {
          const current = speech;
          // Played inside the press, as a phone requires: from the clip's own address, or from the
          // encoding an earlier press's false 404 left for this one (lib/assets/assetRetry.ts).
          const address = assetAudioUrl(clip.url);
          const heard = voiceAudio = new Audio(address);
          heard.muted = !sound;
          current.waiting = true;
          const silent = () => { if (speech === current && !current.heard) { current.waiting = false; heard.pause(); heard.removeAttribute('src'); heard.load(); } };
          voiceTimeout = setTimeout(silent, 8000);
          heard.play().then(() => {
            if (speech === current && current.waiting) { current.waiting = false; current.heard = true; if (voiceTimeout) clearTimeout(voiceTimeout); }
          }, silent);
          heard.addEventListener('error', () => {
            // GitHub sometimes refuses a file it has: the next press of this line asks at another encoding.
            retryAssetAudioOnNextPress(clip.url, address);
            if (speech === current) { current.heard = false; current.waiting = false; current.time = heard.currentTime; heard.pause(); }
          }, { once: true });
        }
        run();
        return;
      }
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
    for (const track of model.playback?.extraTracks ?? []) {
      const entry = state.setAnimation(track.track, track.name, true);
      entry.mixDuration = 0;
      entry.timeScale = reduced ? 0 : 1;
    }
    // The particles: drawn from the first frame when they came in time, else faded in when they come.
    if (options.particles.ready) attachParticles(options.particles.ready, false);
    else options.particles.later?.then((loaded) => { if (loaded) attachParticles(loaded, true); }, () => {});
    const observer = new ResizeObserver(() => resize());
    observer.observe(host);
    resize();
    run();
    return {
      press,
      resize,
      setSound: (on: boolean) => { sound = on; if (audio) audio.muted = !on; if (voiceAudio) voiceAudio.muted = !on; },
      dispose: () => {
        disposed = true;
        if (frameId) cancelAnimationFrame(frameId);
        frameId = 0;
        observer.disconnect();
        stopSpeech();
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

export default function DynamicArtwork({ model, poster, label, transform, scale, request, sound, voiceOperator, onStatus, onPlaying }: Props) {
  const resolveVoiceUrl = useContentUrl();
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
      const [{ spine }, files] = await Promise.all([import('@/lib/vendor/spine-3.8/spine-webgl'), loadModel(model, controller.signal, voiceOperator, resolveVoiceUrl, poster)]);
      if (controller.signal.aborted) return;
      // Everything else is ready: the particles get PARTICLE_GRACE_MS more, then come in (faded) when they are.
      const pending = files.layers?.particles ?? null;
      let ready: ParticleFiles | null = null;
      if (pending) {
        let timer = 0;
        const late = new Promise<'late'>((resolve) => { timer = window.setTimeout(() => resolve('late'), PARTICLE_GRACE_MS); });
        const first = await Promise.race([pending, late]);
        window.clearTimeout(timer);
        if (controller.signal.aborted) return;
        ready = first === 'late' ? null : first;
      }
      player = createPlayer(spine, host, files, {
        particles: { ready, later: pending && !ready ? pending : null },
        reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
        sound: soundRef.current,
        scale: () => scaleRef.current,
        onFirstFrame: (animations, hasSound, labels) => { if (!controller.signal.aborted) handlers.current.onStatus({ kind: 'ready', animations, labels, sound: hasSound }); },
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
  }, [model, poster, voiceOperator, resolveVoiceUrl]);

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

