/*
 * The timing check of the particle-system plan (P4): a model's real export driven through ParticleDirector in
 * Node, with no rendering, on a fixed 60 fps clock: Idle from the illustration's start, then an action pressed at
 * `lead` seconds, played for its length (model.json `animations`), then Idle again. For every system it logs, per
 * play, when the play began, the first frame with a live particle and the first frame with a visible one (a
 * system that draws, a particle whose colour alpha times its material's tint alpha, the timeline's `tint` where a
 * clip drives it, is above 0.02), every frame its emission grew, and its on/off edges. Times are seconds after the
 * press. Followers stand at their setup position with no rotation (a bone's motion moves a particle, never when
 * it shows).
 *
 *   npx tsx scripts/particles/timing.ts MODEL_DIR --action Interact [--lead 20] [--after 8] [--accumulator 0|1] [--trace REGEX] [--out FILE.json]
 *
 * --trace: for the systems whose name matches, the highest alpha shown at every 1/60 s after the press too.
 *
 * MODEL_DIR holds layerParticles.json, layers.json and model.json (an export's model folder). The JSON it writes
 * is what the report (verify/timing.md) is made from.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseParticleText, type ParticleSystemData } from '../../lib/skins/particleData';
import { followPlacement } from '../../lib/skins/particleGeometry';
import { ParticleDirector, type ParticleClock, type Placement, type SystemRun } from '../../lib/skins/particleSim';

const FPS = 60;
export const VISIBLE_ALPHA = 0.02;
/** Higher alphas whose first frame is logged too (an effect that fades in over a bright background shows later than 0.02). */
export const ALPHA_LEVELS = [0.1, 0.25, 0.5] as const;

export interface Play {
  rise: number;
  live: number | null;
  visible: number | null;
  /** The first frame showing a particle at each of ALPHA_LEVELS (null: not reached). */
  levels: (number | null)[];
}
export interface SystemLog {
  index: number;
  name: string;
  only: string | null;
  delay: number;
  draws: boolean;
  child: boolean;
  plays: Play[];
  /** Frames (seconds after the press) at which its births grew, with how many. */
  births: [number, number][];
  /** Its on/off edges (seconds after the press). */
  edges: [number, boolean][];
  /** Its timeline's tint alpha at each 1/30 s after the press, where a clip drives it (null otherwise). */
  tint: number[] | null;
  /** With --trace: the highest alpha it shows at each 1/60 s after the press. */
  alpha: number[] | null;
}

export interface TimingRun { model: string; action: string; length: number; lead: number; accumulator: number; systems: SystemLog[]; skipped: { name: string; why: string }[] }

/** A model's export folder, read as the site reads it. */
export function loadModel(dir: string) {
  const layers = JSON.parse(fs.readFileSync(path.join(dir, 'layers.json'), 'utf8'));
  const model = JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf8'));
  const first = layers.textures.length + (layers.effectTextures?.length ?? 0);
  const doc = parseParticleText(fs.readFileSync(path.join(dir, 'layerParticles.json'), 'utf8'), first);
  return { doc, model, layers };
}

/** A bone follower at the bone's setup position, unturned and unscaled, placed as the site places it
 *  (particleGeometry.followPlacement, by the system's scaling mode). */
export function setupPlacements(unit: number): (data: ParticleSystemData) => Placement | null {
  const cache = new Map<ParticleSystemData, Placement>();
  return (data) => {
    const f = data.follow;
    if (!f) return null;
    let p = cache.get(data);
    if (!p) {
      p = followPlacement(f, { worldX: f.position[0], worldY: f.position[1], scaleX: 1, scaleY: 1, getWorldRotationX: () => 0 }, unit, data.clock.scaling);
      cache.set(data, p);
    }
    return p;
  };
}

/** The highest alpha a system's particles show now (colour alpha x the tint alpha), 0 for one that draws nothing. */
export function shownAlpha(run: SystemRun, materialAlpha: (run: SystemRun) => number, color: Float64Array): number {
  const sim = run.sim;
  if (!run.data.render || !sim.count) return 0;
  const tint = materialAlpha(run);
  let best = 0;
  for (let i = 0; i < sim.count; i++) {
    sim.colorOf(i, color);
    best = Math.max(best, color[3] * tint);
  }
  return best;
}

export function simulate(dir: string, action: string, lead: number, after: number, accumulator: number, trace: RegExp | null = null): TimingRun {
  const { doc, model } = loadModel(dir);
  const length: number = model.animations[action];
  if (!(length > 0)) throw new Error(`${model.skinId}: no ${action} animation`);
  const warnings: string[] = [];
  const director = new ParticleDirector(doc, { precision: 32, degrade: false, options: { emitAccumulatorStart: accumulator }, warn: (m) => warnings.push(m) });
  const placements = setupPlacements(doc.unit);
  const tintOf = (run: SystemRun) => {
    const tl = run.data.timeline;
    if (run.row && tl && Object.hasOwn(tl.at, 'tint')) return run.row[tl.at.tint + 3];
    return doc.materials[run.data.material!]?.color[3] ?? 1;
  };
  const logs: SystemLog[] = director.runs.map((run) => ({
    index: run.data.index, name: run.data.name, only: run.data.only, delay: run.data.delay, draws: run.data.render !== null, child: run.data.child,
    plays: [], births: [], edges: [], tint: run.data.timeline && Object.hasOwn(run.data.timeline.at, 'tint') ? [] : null,
    alpha: trace && trace.test(run.data.name) ? [] : null,
  }));
  const lastPlays = director.runs.map(() => 0), lastEmitted = director.runs.map(() => 0), lastOn = director.runs.map(() => false);
  const color = new Float64Array(4);
  const total = Math.round((lead + length + after) * FPS);
  for (let f = 0; f <= total; f++) {
    const t = f / FPS, rel = t - lead;
    let clock: ParticleClock;
    if (rel < 0) clock = { playing: 'Idle', animationTime: t, time: t };
    else if (rel < length) clock = { playing: action, animationTime: rel, time: t };
    else clock = { playing: 'Idle', animationTime: rel - length, time: t };
    director.frame(clock, f ? 1 / FPS : 0, placements);
    const at = Math.round(rel * 1e4) / 1e4;
    director.runs.forEach((run, k) => {
      const log = logs[k];
      if (run.plays !== lastPlays[k]) {
        log.plays.push({ rise: at, live: null, visible: null, levels: ALPHA_LEVELS.map(() => null) });
        lastPlays[k] = run.plays;
        lastEmitted[k] = 0;
      }
      const play = log.plays.at(-1);
      if (play) {
        if (play.live === null && run.sim.count > 0) play.live = at;
        if (run.sim.count > 0 && (play.visible === null || play.levels.includes(null))) {
          const shown = shownAlpha(run, tintOf, color);
          if (play.visible === null && shown > VISIBLE_ALPHA) play.visible = at;
          ALPHA_LEVELS.forEach((level, j) => { if (play.levels[j] === null && shown >= level) play.levels[j] = at; });
        }
      }
      if (run.sim.emittedTotal > lastEmitted[k]) {
        if (rel >= 0) log.births.push([at, run.sim.emittedTotal - lastEmitted[k]]);
        lastEmitted[k] = run.sim.emittedTotal;
      } else if (run.sim.emittedTotal < lastEmitted[k]) lastEmitted[k] = run.sim.emittedTotal;
      if (run.on !== lastOn[k]) {
        if (rel >= 0) log.edges.push([at, run.on]);
        lastOn[k] = run.on;
      }
      if (log.tint && rel >= 0 && f % 2 === 0) log.tint.push(Math.round(tintOf(run) * 1e4) / 1e4);
      if (log.alpha && rel >= 0) log.alpha.push(Math.round(shownAlpha(run, tintOf, color) * 1e4) / 1e4);
    });
  }
  if (warnings.length) console.warn(warnings.join('\n'));
  return { model: model.skinId, action, length, lead, accumulator, systems: logs, skipped: doc.skipped };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2);
  const option = (name: string, fallback: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const dir = args[0];
  if (!dir || dir.startsWith('--')) throw new Error('usage: timing.ts MODEL_DIR --action Interact [--lead 20] [--after 8] [--accumulator 0|1] [--out FILE.json]');
  const pattern = option('trace', '');
  const run = simulate(dir, option('action', 'Interact'), Number(option('lead', '20')), Number(option('after', '8')), Number(option('accumulator', '0')),
    pattern ? new RegExp(pattern) : null);
  const out = option('out', '');
  if (out) fs.writeFileSync(out, JSON.stringify(run));
  const played = run.systems.filter((s) => s.plays.some((p) => p.rise >= 0));
  console.log(`${run.model} ${run.action}: ${played.length} systems played after the press (accumulator ${run.accumulator})`);
}
