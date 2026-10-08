/*
 * Live particle counts of every exported model through ParticleDirector (the plan's P4 live counts and section 7's
 * Node sweep): Float32 state, a fixed 60 fps clock, bone followers at their setup position (a follower that emits
 * over distance therefore emits nothing here). Per model:
 * - Idle: 12 s from the illustration's start; the mean of the live count from 1 s and the maximum over all of it
 *   (design-data-sim/live_counts.py's window);
 * - Interact and Special, each pressed at 12 s on a fresh run, for the animation's length (model.json) and 3 s of
 *   Idle after: the peak live count with sub-emitter children, the children's share at that peak, and when;
 * - failures (a system switched off), warnings (the live cap), and the most expensive frame.
 * `--comparable` plays every system as design-data-sim did: each GameObject always on (the timelines' `active`
 * columns and the static `active` forced to 1) and children left out of the count.
 *
 *   npx tsx scripts/particles/live-counts.ts EXPORT_ROOT [--comparable] [--only SLUG,...] [--out FILE.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { ACTIVE_COLUMN, type EmitterLine, type ParticleDocument } from '../../lib/skins/particleData';
import { ParticleDirector, type ParticleClock } from '../../lib/skins/particleSim';
import { loadModel, setupPlacements } from './timing';

const FPS = 60;
const IDLE = 12;
const AFTER = 3;

export interface ActionCount { length: number; peak: number; at: number; children: number; childPeak: number }
export interface ModelCount {
  model: string;
  systems: number;
  skipped: number;
  idleMean: number;
  idleMax: number;
  interact: ActionCount | null;
  special: ActionCount | null;
  /** The busiest system's live count anywhere in the runs (a pool holds 4,096 at most). */
  systemMax: { name: string; count: number };
  failures: string[];
  warnings: string[];
  /** The slowest frame() seen (ms), and the mean over the runs. */
  frameMs: { max: number; mean: number };
}

/** Every GameObject always on (design-data-sim never switched any off). */
function alwaysOn(doc: ParticleDocument): void {
  for (const data of doc.systems) {
    if (!data) continue;
    data.active = true;
    const tl = data.timeline;
    if (!tl) continue;
    const lines: EmitterLine[] = [tl, ...Object.values(tl.states ?? {})];
    for (const line of lines) for (let k = 0; k < line.count; k++) line.frames[k * tl.width + ACTIVE_COLUMN] = 1;
  }
}

function play(dir: string, action: string | null, comparable: boolean, stats: { frames: number; ms: number; max: number; systemMax: { name: string; count: number } }) {
  const { doc, model } = loadModel(dir);
  if (comparable) alwaysOn(doc);
  const warnings: string[] = [];
  const director = new ParticleDirector(doc, { precision: 32, degrade: false, warn: (m) => warnings.push(m) });
  const placements = setupPlacements(doc.unit);
  const length: number = action ? model.animations?.[action] ?? 0 : 0;
  const end = action ? IDLE + length + AFTER : IDLE;
  const counts: number[] = [];
  let peak = 0, at = 0, children = 0, childPeak = 0;
  for (let f = 0; f <= Math.round(end * FPS); f++) {
    const t = f / FPS, rel = t - IDLE;
    let clock: ParticleClock;
    if (!action || rel < 0) clock = { playing: 'Idle', animationTime: t, time: t };
    else if (rel < length) clock = { playing: action, animationTime: rel, time: t };
    else clock = { playing: 'Idle', animationTime: rel - length, time: t };
    const t0 = performance.now();
    director.frame(clock, f ? 1 / FPS : 0, placements);
    const ms = performance.now() - t0;
    stats.frames++;
    stats.ms += ms;
    stats.max = Math.max(stats.max, ms);
    let live = 0, kids = 0;
    for (const run of director.runs) {
      const n = run.sim.count;
      if (run.parent) kids += n;
      else live += n;
      if (n > stats.systemMax.count) stats.systemMax = { name: run.data.name, count: n };
    }
    const total = comparable ? live : live + kids;
    if (!action) counts.push(total);
    else if (rel >= 0 && total > peak) { peak = total; at = rel; children = comparable ? 0 : kids; }
    if (action && rel >= 0) childPeak = Math.max(childPeak, kids);
  }
  const failures = director.runs.filter((run) => run.failed).map((run) => run.data.name);
  return { doc, model, counts, peak, at, children, childPeak, length, failures, warnings, available: !action || length > 0 };
}

export function countModel(dir: string, comparable: boolean): ModelCount {
  const stats = { frames: 0, ms: 0, max: 0, systemMax: { name: '', count: 0 } };
  const idle = play(dir, null, comparable, stats);
  const after = idle.counts.slice(FPS);
  const action = (name: string): ActionCount | null => {
    if (!idle.model.animations?.[name]) return null;
    const r = play(dir, name, comparable, stats);
    idle.failures.push(...r.failures);
    idle.warnings.push(...r.warnings);
    return { length: r.length, peak: r.peak, at: Math.round(r.at * 1000) / 1000, children: r.children, childPeak: r.childPeak };
  };
  const interact = action('Interact');
  const special = action('Special');
  return {
    model: path.basename(path.dirname(dir)), systems: idle.doc.systems.filter(Boolean).length, skipped: idle.doc.skipped.length,
    idleMean: Math.round((after.reduce((a, b) => a + b, 0) / Math.max(1, after.length)) * 10) / 10, idleMax: Math.max(0, ...idle.counts), interact, special,
    systemMax: stats.systemMax, failures: [...new Set(idle.failures)], warnings: [...new Set(idle.warnings)],
    frameMs: { max: Math.round(stats.max * 1000) / 1000, mean: Math.round((stats.ms / Math.max(1, stats.frames)) * 1000) / 1000 },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : null;
  };
  const root = args[0];
  if (!root || root.startsWith('--')) throw new Error('usage: live-counts.ts EXPORT_ROOT [--comparable] [--only SLUG,...] [--out FILE.json]');
  const only = option('only')?.split(',') ?? null;
  const comparable = args.includes('--comparable');
  const out: ModelCount[] = [];
  for (const slug of fs.readdirSync(path.join(root, 'models')).sort()) {
    if (only && !only.includes(slug)) continue;
    for (const md5 of fs.readdirSync(path.join(root, 'models', slug))) {
      const dir = path.join(root, 'models', slug, md5);
      if (!fs.existsSync(path.join(dir, 'layerParticles.json'))) continue;
      const count = countModel(dir, comparable);
      out.push(count);
      console.log(`${slug}: idle ${count.idleMean} / ${count.idleMax}, Interact ${count.interact?.peak ?? '-'} (children ${count.interact?.children ?? '-'}), `
        + `Special ${count.special?.peak ?? '-'}; frame ${count.frameMs.mean} ms mean, ${count.frameMs.max} max${count.failures.length ? `; FAILED ${count.failures.length}` : ''}`
        + `${count.warnings.length ? `; ${count.warnings.join(' / ')}` : ''}`);
    }
  }
  const file = option('out');
  if (file) fs.writeFileSync(file, JSON.stringify(out, null, 1));
}
