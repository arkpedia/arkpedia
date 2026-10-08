/*
 * How far the site's simulator is from the reference simulator on make-golden.py's full fixtures, in Float64
 * (scripts/tests/test-particles.ts holds it to 1e-6 relative) and in Float32, the production state, which is
 * reported, not held. Ages and lifetimes are Float64 at either precision, so particles are born and die on the
 * oracle's steps; the other values carry float32's rounding (the report says how much). The sub-emitter families
 * (<slug>.families.json.gz) are reported the same way, every member of each family.
 *
 *   npx tsx scripts/particles/golden-report.ts FULL_DIR
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseParticleDocument } from '../../lib/skins/particleData';
import { ParticleSim, STEP, poseFrom, type Pose } from '../../lib/skins/particleSim';
import { readGolden } from './golden';

interface Case { model: string; index: number; name: string; seed: number; steps: number; counts: number[]; frames: number[][][] }
interface Family { model: string; members: number[]; seeds: number[]; poses: number[][]; counts: number[][]; frames: number[][][][] }

/** A family played as the fixture says; `visit(step, sims)` after play() and after each step. */
function playFamily(doc: ReturnType<typeof parseParticleDocument>, c: Family, steps: number, precision: 32 | 64, visit: (step: number, sims: ParticleSim[]) => void): void {
  const sims = c.members.map((k) => new ParticleSim(doc.systems[k]!, doc, {}, precision));
  const parent = doc.systems[c.members[0]]!;
  parent.sub.forEach(([, kind, probability], j) => sims[0].link(sims[j + 1], kind, probability));
  const poses: Pose[] = c.poses.map((p) => Float64Array.from(p));
  sims[0].play(c.seeds[0], poses[0], poses.slice(1));
  visit(0, sims);
  for (let step = 1; step <= steps; step++) {
    sims[0].step(STEP, poses[0], parent.clock.speed, poses.slice(1));
    visit(step, sims);
  }
}

const dir = process.argv[2];
if (!dir) throw new Error('usage: golden-report.ts FULL_DIR');
const NAMES = ['position', 'velocity', 'size', 'rotation', 'colour', 'custom', 'uv', 'age', 'frame'];
const GROUP = (j: number) => (j < 12 ? Math.floor(j / 3) : j < 16 ? 4 : j < 24 ? 5 : j < 28 ? 6 : j === 28 ? 7 : 8);

for (const precision of [64, 32] as const) {
  let cases = 0, steps = 0, countSteps = 0, casesWithCountDiff = 0, frameDiffs = 0, values = 0;
  const worstAbs = new Float64Array(NAMES.length), worstRel = new Float64Array(NAMES.length);
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.json.gz') && !name.endsWith('.families.json.gz')).sort()) {
    const model = readGolden<{ first: number; doc: unknown; cases: Case[] }>(path.join(dir, file));
    const doc = parseParticleDocument(model.doc, model.first);
    for (const c of model.cases) {
      const data = doc.systems[c.index]!;
      const sim = new ParticleSim(data, doc, {}, precision);
      const pose = poseFrom(data.emitter!.matrix, data.emitter!.rotation);
      sim.play(c.seed, pose);
      const r = new Float64Array(30);
      let differs = false;
      for (let step = 0; step <= c.steps; step++) {
        if (step) sim.step(STEP, pose);
        steps++;
        if (sim.count !== c.counts[step]) { countSteps++; differs = true; continue; }
        for (let i = 0; i < sim.count; i++) {
          sim.record(i, r);
          for (let j = 0; j < 30; j++) {
            const a = r[j], b = c.frames[step][i][j];
            if (j === 29 && a !== b) { frameDiffs++; continue; }
            const d = Math.abs(a - b), m = Math.max(Math.abs(a), Math.abs(b), 1);
            const g = GROUP(j);
            worstAbs[g] = Math.max(worstAbs[g], d);
            worstRel[g] = Math.max(worstRel[g], d / m);
            values++;
          }
        }
      }
      cases++;
      if (differs) casesWithCountDiff++;
    }
  }
  const report = (what: string) => NAMES.forEach((name, g) => console.log(`  ${what} ${name.padEnd(9)} max abs ${worstAbs[g].toExponential(2)}  max |d| / max(1, |v|) ${worstRel[g].toExponential(2)}`));
  console.log(`Float${precision}: ${cases} cases, ${steps} steps, ${values} values; steps whose particle count differs: ${countSteps} (in ${casesWithCountDiff} cases); `
    + `sheet frames that differ: ${frameDiffs}`);
  report('cases   ');
  worstAbs.fill(0); worstRel.fill(0); values = 0; frameDiffs = 0;
  // Sub-emitter families: every member, every step.
  let families = 0, members = 0, familySteps = 0, familyCountSteps = 0, familiesWithCountDiff = 0;
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.families.json.gz')).sort()) {
    const model = readGolden<{ first: number; doc: unknown; steps: number; families: Family[] }>(path.join(dir, file));
    const doc = parseParticleDocument(model.doc, model.first);
    for (const c of model.families) {
      const r = new Float64Array(30);
      let differs = false;
      playFamily(doc, c, model.steps, precision, (step, sims) => {
        sims.forEach((sim, j) => {
          familySteps++;
          if (sim.count !== c.counts[step][j]) { familyCountSteps++; differs = true; return; }
          for (let i = 0; i < sim.count; i++) {
            sim.record(i, r);
            for (let k = 0; k < 30; k++) {
              const a = r[k], b = c.frames[step][j][i][k];
              if (k === 29 && a !== b) { frameDiffs++; continue; }
              const d = Math.abs(a - b), m = Math.max(Math.abs(a), Math.abs(b), 1);
              const g = GROUP(k);
              worstAbs[g] = Math.max(worstAbs[g], d);
              worstRel[g] = Math.max(worstRel[g], d / m);
              values++;
            }
          }
        });
      });
      families++;
      members += c.members.length;
      if (differs) familiesWithCountDiff++;
    }
  }
  console.log(`Float${precision}: ${families} sub-emitter families (${members} systems, ${familySteps} system-steps), ${values} values; system-steps whose particle count `
    + `differs: ${familyCountSteps} (in ${familiesWithCountDiff} families); sheet frames that differ: ${frameDiffs}`);
  report('families');
}
