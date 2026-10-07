/*
 * How far the site's simulator is from the reference simulator on make-golden.py's full fixtures, in Float64
 * (scripts/tests/test-particles.ts holds it to 1e-6 relative) and in Float32, the production state, which is
 * reported, not held. Ages and lifetimes are Float64 at either precision, so particles are born and die on the
 * oracle's steps; the other values carry float32's rounding (the report says how much).
 *
 *   npx tsx scripts/particles/golden-report.ts FULL_DIR
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseParticleDocument } from '../../lib/skins/particleData';
import { ParticleSim, STEP, poseFrom } from '../../lib/skins/particleSim';
import { readGolden } from './golden';

interface Case { model: string; index: number; name: string; seed: number; steps: number; counts: number[]; frames: number[][][] }

const dir = process.argv[2];
if (!dir) throw new Error('usage: golden-report.ts FULL_DIR');
const NAMES = ['position', 'velocity', 'size', 'rotation', 'colour', 'custom', 'uv', 'age', 'frame'];
const GROUP = (j: number) => (j < 12 ? Math.floor(j / 3) : j < 16 ? 4 : j < 24 ? 5 : j < 28 ? 6 : j === 28 ? 7 : 8);

for (const precision of [64, 32] as const) {
  let cases = 0, steps = 0, countSteps = 0, casesWithCountDiff = 0, frameDiffs = 0, values = 0;
  const worstAbs = new Float64Array(NAMES.length), worstRel = new Float64Array(NAMES.length);
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.json.gz')).sort()) {
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
  console.log(`Float${precision}: ${cases} cases, ${steps} steps, ${values} values; steps whose particle count differs: ${countSteps} (in ${casesWithCountDiff} cases); `
    + `sheet frames that differ: ${frameDiffs}`);
  NAMES.forEach((name, g) => console.log(`  ${name.padEnd(9)} max abs ${worstAbs[g].toExponential(2)}  max |d| / max(1, |v|) ${worstRel[g].toExponential(2)}`));
}
