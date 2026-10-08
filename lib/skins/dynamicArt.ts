import { parsePlayback, type AnimationPlayback } from './dynamicPlayback';
import type { Skin } from './skinTypes';

/*
 * Animated outfit art: the game's dynamic illustrations, drawn with the official Spine 3.8
 * runtime in the focused artwork view (components/skins/SkinZoomOverlay.tsx, which lazy-loads
 * components/skins/DynamicArtwork.tsx when the reader presses Animated).
 *
 * The models live in arkpedia/arkpedia-l2d-assets, one immutable folder per source bundle.
 * scripts/sync/sync-dynamic-art.mjs writes data/dynamic-art.json each refresh: every skin id
 * that has a model, mapped to its model.json at that repository's commit, so a new model
 * reaches the site with the next content release and no deploy. A page attaches only the
 * pointer for each artwork it shows (getStaticProps); nothing here reads the data file, so
 * browser code may import this module.
 */

/** data/dynamic-art.json. */
export interface DynamicArtIndex {
  schemaVersion: 1;
  repository: string;
  /** The assets repository's commit the pointers are pinned to; null while it has no manifest. */
  commit: string | null;
  /** Skin id ("char_1044_hsgma2#2", "char_113_cqbw@epoque#7") -> model.json URL at `commit`. */
  models: Record<string, string>;
}

const own = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

const MODEL_URL = /^https:\/\/raw\.githubusercontent\.com\/arkpedia\/arkpedia-l2d-assets\/([a-f0-9]{40})\/models\/[A-Za-z0-9_]+\/[a-f0-9]{12}\/model\.json$/;
/** A model served from this machine, which only a local check may point at (ARKPEDIA_CONTENT_TEST=1,
 *  as lib/content/server.ts lets such a check read a local content origin). */
const LOCAL_MODEL_URL = /^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/(?:[\w.-]+\/)*model\.json$/;

/**
 * data/dynamic-art.json as the pages read it, checked: thrown from getStaticProps, so a file the
 * stage did not write that way fails the build and the content export instead of handing the
 * browser an address it should not fetch. Every pointer is a model.json in arkpedia-l2d-assets
 * at the file's own commit, which lib/content/urls.ts contentUrl() leaves as it is.
 */
export function assertDynamicArtIndex(value: unknown): DynamicArtIndex {
  const index = value as Partial<DynamicArtIndex> | null;
  if (!index || index.schemaVersion !== 1 || index.repository !== 'arkpedia/arkpedia-l2d-assets'
    || !(index.commit === null || /^[a-f0-9]{40}$/.test(String(index.commit)))
    || !index.models || typeof index.models !== 'object' || Array.isArray(index.models)) {
    throw new Error('data/dynamic-art.json is not schemaVersion 1 of arkpedia-l2d-assets (scripts/sync/sync-dynamic-art.mjs)');
  }
  for (const [skinId, url] of Object.entries(index.models)) {
    if (process.env.ARKPEDIA_CONTENT_TEST === '1' && typeof url === 'string' && LOCAL_MODEL_URL.test(url)) continue;
    const commit = typeof url === 'string' ? url.match(MODEL_URL)?.[1] : undefined;
    if (!commit || commit !== index.commit) throw new Error(`data/dynamic-art.json: ${skinId} is not a model.json at ${index.commit}: ${String(url)}`);
  }
  return index as DynamicArtIndex;
}

/** The model.json URL for one skin id, or null when that artwork has no animated version. */
export function dynamicArtFor(index: DynamicArtIndex, skinId: string | null | undefined): string | null {
  if (!skinId || !own(index.models, skinId)) return null;
  return index.models[skinId];
}

/** /skins: the pointer of every listed skin that has a model, by skin id. Only those, so the
 *  page's props (already the site's largest) grow by a line per animated outfit. */
export function skinDynamicArt(index: DynamicArtIndex, skins: readonly Pick<Skin, 'skinId'>[]): Record<string, string> {
  const pointers: Record<string, string> = {};
  for (const skin of skins) {
    const url = dynamicArtFor(index, skin.skinId);
    if (url && skin.skinId) pointers[skin.skinId] = url;
  }
  return pointers;
}

interface OperatorIdentity { name: string; internalName?: string | null }
interface ShownAppearance { label: string; fullPath: string | null }
type SkinRecord = Pick<Skin, 'model' | 'name' | 'image' | 'skinId'>;

/**
 * The skin id behind one artwork on an operator page. An outfit is its skin record's, found the
 * way the artwork credits find it (lib/operators/operatorArtworkCredits.ts): the record of this
 * operator with the appearance's name, or whose art is the appearance's file. The promotion art
 * is the operator's own: Base is `<internalName>#1`, Elite 2 `<internalName>#2`, as the game's
 * skin table names them. Anything else (Elite 1, an operator with no internal name) has none.
 */
export function appearanceSkinId(operator: OperatorIdentity, appearance: ShownAppearance, skins: readonly SkinRecord[]): string | null {
  const label = appearance.label.trim();
  if (/^base$/i.test(label)) return operator.internalName ? `${operator.internalName}#1` : null;
  if (/^elite\s*2$/i.test(label)) return operator.internalName ? `${operator.internalName}#2` : null;
  if (/^elite\s*\d+$/i.test(label)) return null;
  const image = appearance.fullPath ? decodeURIComponent(appearance.fullPath) : null;
  const skin = skins.find((candidate) => candidate.model === operator.name
    && (candidate.name === appearance.label || Boolean(image && candidate.image === image)));
  return skin?.skinId ?? null;
}

/** /operators/[name]: the pointer of every artwork that has a model, by appearance label. */
export function operatorDynamicArt(index: DynamicArtIndex, operator: OperatorIdentity, appearances: readonly ShownAppearance[],
  skins: readonly SkinRecord[]): Record<string, string> {
  const pointers: Record<string, string> = {};
  for (const appearance of appearances) {
    const url = dynamicArtFor(index, appearanceSkinId(operator, appearance, skins));
    if (url) pointers[appearance.label] = url;
  }
  return pointers;
}

/* --- playing a model ------------------------------------------------------------------ */

/** The game's own names for the animations most models share, in the order the buttons show
 *  them, and the names the buttons give them. Any other animation keeps its own name. */
const KNOWN: readonly (readonly [name: string, label: string])[] = [
  ['Start', 'Intro'],
  ['Idle', 'Idle'],
  ['Interact', 'Touch'],
  ['Special', 'Special'],
];
/** What a tap on the artwork plays, as tapping it does in the game. */
export const TOUCH_ANIMATION = 'Interact';
export const INTRO_ANIMATION = 'Start';
const IDLE_ANIMATION = 'Idle';
/** Seconds one animation blends into the next. */
export const ANIMATION_MIX = 0.3;

export interface AnimationButton { name: string; label: string }

/** A button for each of the model's animations: Intro, Idle, Touch and Special first where the
 *  model has them, then the rest by their own names, in the model's order. */
export function animationButtons(names: readonly string[], labels: Record<string, string> = {}): AnimationButton[] {
  const known = KNOWN.filter(([name]) => names.includes(name)).map(([name, label]) => ({ name, label }));
  const rest = names.filter((name) => !KNOWN.some(([known]) => known === name)).map((name) => ({ name, label: labels[name] ?? name }));
  return [...known, ...rest];
}

/** The animation the model rests in: Idle, else its first. */
export function restingAnimation(names: readonly string[]): string | null {
  return names.includes(IDLE_ANIMATION) ? IDLE_ANIMATION : names[0] ?? null;
}

export interface OpeningPlan {
  /** Shown first, standing still at its first frame, until anything plays. */
  pose: string | null;
  /** The entrance sequence plays first (with its soundtrack), before the intro. */
  entrance: boolean;
  /** Played once on opening, before the loop. */
  intro: string | null;
  /** Looped after the intro (or from the start); null under reduced motion, where nothing
   *  moves until the reader presses a button. */
  loop: string | null;
}

/** On opening, as the game does: the entrance where the outfit has one (`hasEntrance`, required
 *  so every caller says), then Start once and Idle on a loop where the model has a Start, else
 *  Idle on a loop. Under prefers-reduced-motion the Idle pose stands still and nothing plays,
 *  the entrance included, until the reader presses a button. */
export function openingPlan(names: readonly string[], reducedMotion: boolean, hasEntrance: boolean): OpeningPlan {
  const rest = restingAnimation(names);
  if (reducedMotion) return { pose: rest, entrance: false, intro: null, loop: null };
  return { pose: rest, entrance: hasEntrance, intro: names.includes(INTRO_ANIMATION) && rest !== INTRO_ANIMATION ? INTRO_ANIMATION : null, loop: rest };
}

export interface PressPlan {
  /** The entrance sequence plays first, then `play`. */
  entrance: boolean;
  /** The animation the press starts. */
  play: string;
  /** Whether it loops itself (the resting animation, with motion allowed). */
  loop: boolean;
  /** Queued after a one-off, on a loop: the resting animation; null under reduced motion,
   *  where the one-off plays once and then holds its last frame. */
  then: string | null;
}

/** A button (or a tap, which is Touch): the resting animation loops; anything else plays once
 *  and blends back into it. Intro on an outfit with an entrance plays the whole sequence: the
 *  entrance, then Start. Under reduced motion nothing loops on its own. */
export function pressPlan(name: string, names: readonly string[], reducedMotion: boolean, hasEntrance: boolean): PressPlan {
  const rest = restingAnimation(names);
  if (name === rest) return { entrance: false, play: name, loop: !reducedMotion, then: null };
  return { entrance: hasEntrance && name === INTRO_ANIMATION, play: name, loop: false, then: reducedMotion ? null : rest };
}

/* --- model.json ---------------------------------------------------------------------- */

interface SkeletonFiles {
  skeleton: { file: string; format: 'binary' | 'json' };
  atlas: { file: string };
  textures: { file: string; width: number; height: number }[];
  animations: Record<string, number>;
}

/** The camera the game plays an entrance through (decoded from its Unity camera rig by
 *  arkpedia-l2d-assets' scripts/entrance_camera.py): keyframes of the view's centre, visible
 *  height (skeleton units) and roll (degrees), to interpolate linearly; the full-screen fades
 *  that hide its cuts and flash at the end; and the colour it hands over to the illustration. */
export interface EntranceCamera {
  frames: [t: number, x: number, y: number, height: number, roll: number][];
  fades: { color: [number, number, number]; keys: [t: number, alpha: number][] }[];
  handover: [number, number, number] | null;
}

/** The entrance sequence an outfit with a dynEntranceId plays before its illustration: its own
 *  skeleton (one animation, Start) drawn in the illustration's coordinates, its camera (null when
 *  the game names none: the illustration's framing is used) and its soundtrack. */
export interface DynamicEntrance extends SkeletonFiles {
  camera: EntranceCamera | null;
  audio: { file: string; duration: number } | null;
}

/** One model folder's model.json, as arkpedia-l2d-assets writes it (schemaVersion 1). */
export interface DynamicModel extends SkeletonFiles {
  playback: AnimationPlayback | null;
  mixes: { from: string; to: string; duration: number }[];
  skinId: string;
  premultipliedAlpha: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  entrance: DynamicEntrance | null;
  /** The illustration prefab's own mesh layers (lib/skins/dynamicLayers.ts), drawn with the skeleton;
   *  null for a model without them. */
  layers: { file: string } | null;
}

/** A file name inside the model's folder: never a path. */
const FILE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const unit = (value: unknown) => finite(value) && value >= 0 && value <= 1;
const colour = (value: unknown): value is [number, number, number] => Array.isArray(value) && value.length === 3 && value.every(unit);

/** An entrance's camera, checked: null when absent (an older model) or named none. */
function parseEntranceCamera(value: unknown, fail: (why: string) => never): EntranceCamera | null {
  if (value == null) return null;
  const camera = value as Partial<EntranceCamera>;
  const frames = camera.frames;
  if (!Array.isArray(frames) || !frames.length
    || !frames.every((frame, i) => Array.isArray(frame) && frame.length === 5 && frame.every(finite) && frame[3] > 0
      && (i === 0 ? frame[0] === 0 : frame[0] > frames[i - 1][0]))) fail('entrance camera frames');
  const fades = camera.fades;
  if (!Array.isArray(fades) || !fades.every((fade) => fade && colour(fade.color) && Array.isArray(fade.keys) && fade.keys.length > 0
    && fade.keys.every((key, i) => Array.isArray(key) && key.length === 2 && finite(key[0]) && unit(key[1]) && (i === 0 || key[0] > fade.keys[i - 1][0])))) {
    fail('entrance camera fades');
  }
  if (camera.handover != null && !colour(camera.handover)) fail('entrance camera handover');
  return {
    frames: frames!.map((frame) => [...frame] as EntranceCamera['frames'][number]),
    fades: fades!.map((fade) => ({ color: [...fade.color] as [number, number, number], keys: fade.keys.map((key) => [...key] as [number, number]) })),
    handover: camera.handover ? [...camera.handover] as [number, number, number] : null,
  };
}

/* --- the entrance's camera --------------------------------------------------------------- */

export interface View { x: number; y: number; height: number; roll: number }

/** Linear interpolation in a time-ordered key list ([t, ...values]); held before the first key and
 *  after the last. */
function interpolate<K extends number[]>(keys: readonly K[], t: number): number[] {
  if (t <= keys[0][0]) return keys[0].slice(1);
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last.slice(1);
  let i = 0;
  while (keys[i + 1][0] <= t) i++;
  const a = keys[i], b = keys[i + 1];
  const k = (t - a[0]) / (b[0] - a[0]);
  return a.slice(1).map((value, j) => value + (b[j + 1] - value) * k);
}

/** Where the entrance's camera looks at time t (seconds into the entrance). */
export function cameraAt(camera: EntranceCamera, t: number): View {
  const [x, y, height, roll] = interpolate(camera.frames, t);
  return { x, y, height, roll };
}

/** The full-screen fades at time t, bottom to top: [r, g, b, alpha] each, colours 0-1. */
export function fadesAt(camera: EntranceCamera, t: number): [number, number, number, number][] {
  return camera.fades.map((fade) => [...fade.color, interpolate(fade.keys, t)[0]] as [number, number, number, number])
    .filter((layer) => layer[3] > 0.001);
}

/** Seconds the view takes to settle from the entrance's last framing onto the illustration's,
 *  and for the hand-over colour to clear from it. */
export const HANDOVER_SECONDS = 0.8;
/** The last seconds of an entrance in which, when no fade already covers the screen, the
 *  hand-over colour rises over it, as the game's controller fades into the illustration. */
export const HANDOVER_IN_SECONDS = 0.4;

/** The hand-over colour over the end of the entrance (t: seconds into it, duration: its length):
 *  rising over its last HANDOVER_IN_SECONDS unless its own fades already cover the screen there. */
export function handoverIn(camera: EntranceCamera, t: number, duration: number): [number, number, number, number] | null {
  if (!camera.handover) return null;
  const end = fadesAt(camera, duration).reduce((covered, layer) => covered + (1 - covered) * layer[3], 0);
  if (end >= 0.9) return null;
  const alpha = Math.min(1, Math.max(0, (t - (duration - HANDOVER_IN_SECONDS)) / HANDOVER_IN_SECONDS));
  return alpha > 0 ? [...camera.handover, alpha] : null;
}

/** The colour the screen holds at the end of the entrance (its fades, else the hand-over colour),
 *  which clears over the illustration's first HANDOVER_SECONDS. */
export function handoverOut(camera: EntranceCamera, duration: number): [number, number, number, number] | null {
  const layers = fadesAt(camera, duration);
  const top = layers[layers.length - 1];
  if (top && top[3] >= 0.05) return top;
  return camera.handover ? [...camera.handover, 1] : null;
}

/** Smoothly from one view to another (k: 0-1, eased in and out). */
export function viewBetween(from: View, to: View, k: number): View {
  const e = k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, height: from.height + (to.height - from.height) * e, roll: from.roll + (to.roll - from.roll) * e };
}

/** The illustration's framing: its bounds (from model.json), contained in a canvas of this aspect
 *  (width / height) with a 2% margin, upright. */
export function restingView(bounds: DynamicModel['bounds'], aspect: number): View {
  const height = Math.max(bounds.height * 1.02, (bounds.width * 1.02) / aspect);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, height, roll: 0 };
}

/** The skeleton, atlas, pages and animations of the illustration or its entrance, checked. */
function parseSkeletonFiles(part: Partial<SkeletonFiles> | null | undefined, fail: (why: string) => never, what: string): SkeletonFiles {
  if (!part || typeof part !== 'object') return fail(what);
  const skeleton = part.skeleton;
  if (!skeleton || !FILE.test(String(skeleton.file)) || !['binary', 'json'].includes(String(skeleton.format))) fail(`${what} skeleton`);
  if (!part.atlas || !FILE.test(String(part.atlas.file))) fail(`${what} atlas`);
  if (!Array.isArray(part.textures) || !part.textures.length
    || !part.textures.every((texture) => texture && FILE.test(String(texture.file)) && finite(texture.width) && finite(texture.height))) fail(`${what} textures`);
  const animations = part.animations;
  if (!animations || typeof animations !== 'object' || !Object.keys(animations).length || !Object.values(animations).every(finite)) fail(`${what} animations`);
  return {
    skeleton: { file: skeleton!.file, format: skeleton!.format },
    atlas: { file: part.atlas!.file },
    textures: part.textures!.map(({ file, width, height }) => ({ file, width, height })),
    animations: { ...animations },
  };
}

/** A model.json read from the network, checked before anything is fetched on its word. */
export function parseDynamicModel(value: unknown): DynamicModel {
  const model = value as Partial<DynamicModel> & { schemaVersion?: unknown } | null;
  const fail = (why: string): never => { throw new Error(`Unsupported model.json: ${why}`); };
  if (!model || typeof model !== 'object') return fail('not an object');
  if (model.schemaVersion !== 1) return fail(`schemaVersion ${String(model.schemaVersion)}`);
  if (typeof model.skinId !== 'string') fail('no skinId');
  const files = parseSkeletonFiles(model, fail, 'illustration');
  if (typeof model.premultipliedAlpha !== 'boolean') fail('premultipliedAlpha');
  const bounds = model.bounds;
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(finite) || !(bounds.width > 0 && bounds.height > 0)) fail('bounds');
  // The assets repository requires `entrance` exactly when the skin has a dynEntranceId; a model
  // without the field has no entrance.
  let entrance: DynamicEntrance | null = null;
  if (model.entrance != null) {
    const parts = parseSkeletonFiles(model.entrance, fail, 'entrance');
    if (!Object.hasOwn(parts.animations, INTRO_ANIMATION)) fail('entrance has no Start');
    const audio = model.entrance.audio;
    if (audio != null && !(FILE.test(String(audio.file)) && finite(audio.duration) && audio.duration > 0)) fail('entrance audio');
    entrance = { ...parts, camera: parseEntranceCamera(model.entrance.camera, fail), audio: audio ? { file: audio.file, duration: audio.duration } : null };
  }
  // The assets repository always writes `layers` (null only for a bundle without an illustration
  // prefab); a model from before layers has none either.
  const layers = model.layers;
  if (layers != null && !(typeof layers === 'object' && FILE.test(String(layers.file)))) fail('layers');
  const playback = parsePlayback(model.playback, files.animations);
  const mixes = model.mixes ?? [];
  if (!Array.isArray(mixes) || mixes.length > 2048 || !mixes.every(x => x && Object.hasOwn(files.animations, x.from) && Object.hasOwn(files.animations, x.to) && finite(x.duration) && x.duration >= 0)) fail('mixes');
  return {
    playback, mixes: mixes.map(x => ({ ...x })),
    skinId: model.skinId!,
    ...files,
    premultipliedAlpha: model.premultipliedAlpha!,
    bounds: { x: bounds!.x, y: bounds!.y, width: bounds!.width, height: bounds!.height },
    entrance,
    layers: layers ? { file: layers.file } : null,
  };
}
