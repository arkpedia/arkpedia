import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { parseDynamicLayers } from '../../lib/skins/dynamicLayers';
import { parseParticleDocument, parseParticleText, type ParticleDocument, type ParticleMaterial, type ParticleSystemData } from '../../lib/skins/particleData';
import {
  CUSTOM_FLOATS, LEAN_FLOATS, MAX_QUADS, PARTICLE_CONVENTIONS, QUAD_TRIANGLES, VertexArray, customFeature, drawOrder, eulerMatrix, expandSystem, followPlacement, frameRect,
  lookRotation, nextFrame, quadIndices, type ParticleConventions, type SystemFrame,
} from '../../lib/skins/particleGeometry';
import { ParticleDirector, ParticleSim, STEP, poseFrom } from '../../lib/skins/particleSim';
import { readGolden } from '../particles/golden';

/*
 * The particle geometry (lib/skins/particleGeometry.ts): every live particle expanded into the vertices the renderer
 * draws, against golden dumps a Python expansion of the reference simulator wrote from the expansion's own
 * specification (scripts/particles/make-vertex-golden.py): positions to 1e-3 skeleton units, UVs and custom inputs to
 * 1e-5, colours to the byte, in draw order, for every render mode, alignment and sort mode and each custom layout.
 * With PARTICLE_EXPORTS naming an export root (models/<slug>/<md5>/), every exported model is also read: its
 * layers.json by the new reader (nothing skipped) and its layerParticles.json (the custom-layout rule's premise).
 */

const FIXTURE = 'scripts/tests/fixtures/particles/vertices.json.gz';
type Json = Record<string, unknown>;
interface Sample { particles: number; vertices: number; indices: number; data: number[][]; firstIndices: number[] }
interface Case {
  model: string; name: string; index: number; system: number; seed: number; changes: Json; conventions: ParticleConventions; covers: string;
  samples: Record<string, Sample>;
}
interface Fixture { conventions: ParticleConventions; samples: number[]; step: number; models: Record<string, { first: number; doc: Json }>; cases: Case[] }

/** The frame expandSystem needs for a still system at the end of a step (alpha 1). */
function still(data: ParticleSystemData, sim: ParticleSim, doc: ParticleDocument): SystemFrame {
  const material = doc.materials[data.material!]!;
  return {
    data, sim, matrix: data.emitter!.matrix, scale: data.emitter!.scale, alpha: 1,
    meshes: (data.render!.meshes).map((m) => { const mesh = doc.meshes[m]!; return mesh.builtin === 'quad' ? 'quad' as const : mesh; }),
    inputs: material.custom,
  };
}

test('golden: every render mode, alignment, sort and custom layout expands as the reference expansion does', (t) => {
  const g = readGolden<Fixture>(FIXTURE);
  assert.deepEqual(g.conventions, { ...PARTICLE_CONVENTIONS }, 'the fixture was made with the conventions the site draws with');
  assert.equal(g.step, STEP);
  const docs = new Map(Object.entries(g.models).map(([slug, m]) => {
    const doc = parseParticleDocument(m.doc, m.first);
    assert.deepEqual(doc.skipped, [], `${slug}: every system read`);
    return [slug, doc];
  }));
  const covered = { mode: new Set<string>(), align: new Set<string>(), sort: new Set<string>(), custom: new Set<string>(), sources: new Set<string>() };
  let worst = { position: 0, uv: 0, custom: 0, vertices: 0 };
  for (const c of g.cases) {
    const doc = docs.get(c.model)!;
    const data = doc.systems[c.system]!;
    const material = doc.materials[data.material!]!;
    const render = data.render!;
    covered.mode.add(render.mode);
    covered.align.add(render.mode === 'stretched' ? 'stretched' : render.align);
    covered.sort.add(render.sort);
    covered.custom.add(customFeature(material));
    for (const source of material.custom ?? []) if (source !== 0) covered.sources.add(source.replace(/\.[xyzw]$/, ''));
    const sim = new ParticleSim(data, doc, {}, 64);
    const pose = poseFrom(data.emitter!.matrix, data.emitter!.rotation);
    sim.play(c.seed, pose);
    const custom = material.custom !== null;
    const out = new VertexArray(custom);
    for (let step = 1; step <= Math.max(...g.samples); step++) {
      sim.step(STEP, pose);
      const sample = c.samples[String(step)];
      if (!sample) continue;
      const label = `${c.model} ${c.name}${Object.keys(c.changes).length ? ` ${JSON.stringify(c.changes)}` : ''} ${c.conventions.stretchAxis} step ${step}`;
      assert.equal(sim.count, sample.particles, `${label}: particles`);
      out.reset();
      const written = expandSystem(still(data, sim, doc), { unit: doc.unit, cameraHeight: doc.camera.height, viewHeight: 0, conventions: c.conventions, fade: 1 }, out);
      assert.equal(written, sample.vertices, `${label}: vertices`);
      assert.equal(out.indexCount, sample.indices, `${label}: indices`);
      assert.deepEqual(Array.from(out.indices.subarray(0, sample.firstIndices.length)), sample.firstIndices, `${label}: indices`);
      sample.data.forEach((v, k) => {
        const at = k * out.stride, c8 = at * 4 + 16;
        const where = `${label} vertex ${k}`;
        const dp = Math.max(Math.abs(out.f32[at] - v[0]), Math.abs(out.f32[at + 1] - v[1]));
        const du = Math.max(Math.abs(out.f32[at + 2] - v[2]), Math.abs(out.f32[at + 3] - v[3]));
        assert.ok(dp <= 1e-3, `${where}: position (${out.f32[at]}, ${out.f32[at + 1]}) vs (${v[0]}, ${v[1]})`);
        assert.ok(du <= 1e-5, `${where}: uv (${out.f32[at + 2]}, ${out.f32[at + 3]}) vs (${v[2]}, ${v[3]})`);
        for (let j = 0; j < 4; j++) {
          const want = Math.round(Math.min(Math.max(v[4 + j], 0), 1) * 255);
          assert.ok(Math.abs(out.u8[c8 + j] - want) <= 1, `${where}: colour ${j} ${out.u8[c8 + j]} vs ${want} (${v[4 + j]})`);
        }
        if (custom) {
          for (let j = 0; j < 8; j++) {
            const d = Math.abs(out.f32[at + 5 + j] - v[8 + j]);
            assert.ok(d <= 1e-5 * Math.max(1, Math.abs(v[8 + j])), `${where}: custom input ${j} ${out.f32[at + 5 + j]} vs ${v[8 + j]}`);
            worst.custom = Math.max(worst.custom, d);
          }
        }
        worst = { ...worst, position: Math.max(worst.position, dp), uv: Math.max(worst.uv, du), vertices: worst.vertices + 1 };
      });
    }
  }
  // What the selection covers (a case copies a real system where no export has the mode: sort depth, align facing).
  assert.deepEqual([...covered.mode].sort(), ['billboard', 'mesh', 'stretched']);
  assert.deepEqual([...covered.align].sort(), ['facing', 'local', 'stretched', 'velocity', 'view', 'world']);
  assert.deepEqual([...covered.sort].sort(), ['depth', 'distance', 'none', 'oldestInFront', 'youngestInFront']);
  assert.deepEqual([...covered.custom].sort(), ['dissolve', 'disturb', 'none']);
  assert.deepEqual([...covered.sources].sort(), ['c1', 'c2', 'uv2']);
  t.diagnostic(`${g.cases.length} cases, ${worst.vertices} vertices: max position error ${worst.position.toExponential(2)} skeleton units, uv ${worst.uv.toExponential(2)}, `
    + `custom ${worst.custom.toExponential(2)}`);
});

/* --- the pieces, on their own ------------------------------------------------------------------- */

test('draw order: oldest first, the reverse for OldestInFront, farther first (larger z) for Distance and Depth', () => {
  const zs = [0, 9, 1, 9, 5, 9, 1, 9]; // stride 2: z 0, 1, 5, 1
  assert.deepEqual(drawOrder('none', 4, zs, 2, []), [0, 1, 2, 3]);
  assert.deepEqual(drawOrder('youngestInFront', 4, zs, 2, []), [0, 1, 2, 3]);
  assert.deepEqual(drawOrder('oldestInFront', 4, zs, 2, []), [3, 2, 1, 0]);
  assert.deepEqual(drawOrder('distance', 4, zs, 2, []), [2, 1, 3, 0], 'z 5, then the two at 1 oldest first, then 0');
  assert.deepEqual(drawOrder('depth', 4, zs, 2, []), [2, 1, 3, 0]);
  assert.deepEqual(drawOrder('depth', 3, [2, 2, 2], 1, []), [0, 1, 2], 'ties: oldest first');
});

test('the next sheet frame wraps in its row (SingleRow) or the whole sheet, frame 0 at the top left', () => {
  const sheet = { tiles: [4, 2] as [number, number], singleRow: false, row: 'random' as const, frameOverTime: null!, startFrame: null!, cycles: 1 };
  assert.equal(nextFrame(sheet, 0), 1);
  assert.equal(nextFrame(sheet, 7), 0);
  assert.equal(nextFrame({ ...sheet, singleRow: true }, 7), 4, 'row 1 wraps to its own first frame');
  assert.equal(nextFrame({ ...sheet, singleRow: true }, 2), 3);
  const r = new Float64Array(4);
  frameRect(sheet, 5, r, 0);
  assert.deepEqual(Array.from(r), [0.25, 0, 0.5, 0.5], 'frame 5: column 1 of the bottom row (Unity v up)');
});

test('rotations: Quaternion.Euler (Z, then X, then Y) and LookRotation along a velocity', () => {
  const m = new Float64Array(9);
  const apply = (v: number[]) => [0, 1, 2].map((r) => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]).map((x) => Math.round(x * 1e9) / 1e9 + 0);
  eulerMatrix(0, 0, Math.PI / 2, m);
  assert.deepEqual(apply([1, 0, 0]), [0, 1, 0], 'Euler(0, 0, 90) turns right to up');
  eulerMatrix(Math.PI / 2, 0, 0, m);
  assert.deepEqual(apply([0, 1, 0]), [0, 0, 1], 'Euler(90, 0, 0) turns up to forward');
  eulerMatrix(0, Math.PI / 2, 0, m);
  assert.deepEqual(apply([1, 0, 0]), [0, 0, -1], 'Euler(0, 90, 0) turns right to back');
  eulerMatrix(Math.PI / 2, 0, Math.PI / 2, m);
  assert.deepEqual(apply([1, 0, 0]), [0, 0, 1], 'Z first, then X');
  assert.equal(lookRotation(0, 0, 1, m), true);
  assert.deepEqual(Array.from(m, (x) => x + 0), [1, 0, 0, 0, 1, 0, 0, 0, 1], 'looking down +Z: no turn');
  assert.equal(lookRotation(0, 0, 0, m), false);
  lookRotation(1, 0, 0, m);
  assert.deepEqual(apply([0, 0, 1]), [1, 0, 0], 'the quad faces along the velocity');
});

test('the custom layout: Disturb\'s where the material distorts or has a ramp, Dissolve(CustomData)\'s otherwise, none without streams', () => {
  const shader = { family: 'particle', main: { st: [1, 1, 0, 0], speed: [0, 0], scroll: [0, 0], fract: false }, distort: null, dissolve: [], edge: null, ramp: null, vertex: null, animated: [] };
  const material = (s: Json, custom: ParticleMaterial['custom']) => ({ shader: s, custom } as unknown as ParticleMaterial);
  const inputs: ParticleMaterial['custom'] = ['c1.x', 'c1.y', 'c1.z', 'c1.w', 'c2.x', 'c2.y', 0, 0];
  assert.equal(customFeature(material(shader, null)), 'none');
  assert.equal(customFeature(material(shader, inputs)), 'dissolve');
  assert.equal(customFeature(material({ ...shader, distort: {} }, inputs)), 'disturb');
  assert.equal(customFeature(material({ ...shader, ramp: {} }, inputs)), 'disturb');
});

test('vertex formats: 20 bytes lean, 52 with the custom inputs; quads share one 16-bit index buffer', () => {
  assert.equal(new VertexArray(false).bytes, 20);
  assert.equal(new VertexArray(true).bytes, 52);
  assert.equal(LEAN_FLOATS * 4, 20);
  assert.equal(CUSTOM_FLOATS * 4, 52);
  const quads = quadIndices();
  assert.equal(quads.length, MAX_QUADS * 6);
  assert.ok(quads.every((i) => i < 65536), 'every quad indexable with 16 bits');
  assert.deepEqual(Array.from(quads.subarray(6, 12)), QUAD_TRIANGLES.map((i) => i + 4));
  // A growing array keeps what it had.
  const v = new VertexArray(false, 1, 1);
  v.reserve(1, 1);
  v.f32[0] = 7; v.count = 1; v.indices[0] = 3; v.indexCount = 1;
  v.reserve(100, 100);
  assert.equal(v.f32[0], 7);
  assert.equal(v.indices[0], 3);
});

test('between two steps a particle is drawn between its two positions, and the fade scales only alpha', () => {
  const doc = parseParticleDocument({
    version: 1, unit: 0.01, camera: { size: 10, height: 2000 }, controller: { fixFxDelay: 1, animTimeFixed: 0 }, textures: [], meshes: [{ builtin: 'quad' }],
    materials: [{ blend: 'add', texture: null, color: [1, 1, 1, 1], custom: null, cull: 0,
      shader: { family: 'particle', main: { st: [1, 1, 0, 0], speed: [0, 0], scroll: [0, 0], fract: false }, distort: null, dissolve: [], edge: null, ramp: null, vertex: null, animated: [] } }],
    systems: [{ name: 'p', requires: [], only: null, delay: 0, active: true, follow: null, child: false,
      emitter: { matrix: [1, 0, 0, 2, 0, 1, 0, 0, 0, 0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      clock: { loop: false, maxAlive: 10 }, emission: { rate: 0, bursts: [[0, 1, 1, 0.01, 1]] }, start: { lifetime: 100, speed: 0, size: 0.5, color: [1, 0.5, 0, 1] },
      velocity: { linear: [6, 0, 0] }, render: { mode: 'billboard' }, material: 0 }],
  }, 0);
  const data = doc.systems[0]!;
  const sim = new ParticleSim(data, doc, {}, 64);
  sim.play(1, poseFrom(data.emitter!.matrix, data.emitter!.rotation));
  sim.step(STEP);
  sim.step(STEP);
  const out = new VertexArray(false);
  const ctx = { unit: 0.01, cameraHeight: 2000, viewHeight: 0, conventions: PARTICLE_CONVENTIONS, fade: 0.5 };
  expandSystem({ ...still(data, sim, doc), alpha: 0.5 }, ctx, out);
  // x moves 6/60 = 0.1 Unity units a step: from 0.1 to 0.2 after two (born at 0); halfway, 0.15, plus the emitter's 2.
  const centre = (out.f32[0] + out.f32[LEAN_FLOATS * 3]) / 2;
  assert.ok(Math.abs(centre - (2.15 / 0.01)) < 1e-3, `drawn at ${centre}`);
  assert.ok(Math.abs(out.f32[LEAN_FLOATS] - out.f32[0] - 50) < 1e-3, 'a 0.5 Unity-unit quad is 50 skeleton units wide');
  assert.deepEqual(Array.from(out.u8.subarray(16, 20)), [255, 128, 0, 128], 'alpha halved, colour kept');
});

test('a bone follower places its systems: the origin through its whole placement, the linear part by the scaling mode', () => {
  // A follower 1 Unity unit per follower unit (parent 100 skeleton units at unit 0.01), on a bone at (500, 0) turned
  // 90 degrees and scaled 2 (localScale): its whole placement is R(90) S(2), then (5, 0) in Unity units.
  const follow = { bone: 'hand', xy: true, rotation: true, localScale: true, mirrored: false, parent: [100, 0, 0, 100] as [number, number, number, number], position: [0, 0] as [number, number], angle: 0 };
  const bone = { worldX: 500, worldY: 0, scaleX: 2, scaleY: 2, getWorldRotationX: () => 90 };
  const round = (values: ArrayLike<number>) => Array.from(values, (v) => Math.round(v * 1e9) / 1e9 + 0);
  const local = followPlacement(follow, bone, 0.01, 'local');
  assert.deepEqual(round(local.matrix), [0, -1, 0, 5, 1, 0, 0, 0, 0, 0, 1, 0], 'Local: the follower\'s turn alone');
  assert.deepEqual(round(local.origin!), [0, -2, 0, 5, 2, 0, 0, 0, 0, 0, 1, 0], 'its origin through the whole placement');
  assert.deepEqual(round(local.scale), [1, 1, 1]);
  assert.deepEqual(round(local.rotation), round([0, 0, Math.SQRT1_2, Math.SQRT1_2]));
  const hierarchy = followPlacement(follow, bone, 0.01, 'hierarchy');
  assert.deepEqual(round(hierarchy.matrix), [0, -2, 0, 5, 2, 0, 0, 0, 0, 0, 1, 0]);
  assert.equal(hierarchy.origin, null);
  assert.deepEqual(round(hierarchy.scale), [2, 2, 1], 'Hierarchy with localScale: the bone\'s scale on sizes');
  assert.deepEqual(round(followPlacement({ ...follow, localScale: false }, bone, 0.01, 'hierarchy').scale), [1, 1, 1]);
  assert.deepEqual(round(followPlacement(follow, bone, 0.01, 'shape').scale), [1, 1, 1]);
  // The director composes them: an emitter 1 unit along the follower's x.
  const system = (scaling: string) => ({
    name: scaling, requires: [], only: null, delay: 0, active: true, follow, child: false,
    emitter: { matrix: [1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    clock: { loop: true, scaling, maxAlive: 4 }, emission: { rate: 0 }, start: {}, render: { mode: 'billboard' }, material: 0,
  });
  const doc = parseParticleDocument({
    version: 1, unit: 0.01, camera: { size: 10, height: 2000 }, controller: { fixFxDelay: 1, animTimeFixed: 0 }, textures: [], meshes: [],
    materials: [{ blend: 'add', texture: null, color: [1, 1, 1, 1], custom: null, cull: 0,
      shader: { family: 'particle', main: { st: [1, 1, 0, 0], speed: [0, 0], scroll: [0, 0], fract: false }, distort: null, dissolve: [], edge: null, ramp: null, vertex: null, animated: [] } }],
    systems: [system('local'), system('hierarchy')],
  }, 0);
  assert.deepEqual(doc.skipped, []);
  const director = new ParticleDirector(doc, { precision: 64 });
  director.frame({ playing: 'Idle', animationTime: 0, time: 0 }, 0, (data) => followPlacement(data.follow!, bone, doc.unit, data.clock.scaling));
  const [l, h] = director.runs;
  assert.deepEqual(round(l.matrix), [0, -1, 0, 5, 1, 0, 0, 2, 0, 0, 1, 0], 'Local: turned, its origin at (5, 2)');
  assert.deepEqual(round(h.matrix), [0, -2, 0, 5, 2, 0, 0, 2, 0, 0, 1, 0], 'Hierarchy: turned and scaled, the same origin');
  assert.deepEqual(round(h.scale), [2, 2, 1]);
});

test('sub-emitter children draw: a child run expands where its parent\'s particles went, through its own emitter', () => {
  // A spawner at x = 2 (draws nothing) sends one particle along +X at 6 Unity units a second; a local child at x = 5
  // emits from it at 60 a second. The child's particles live in its emitter's space (x - 5), drawn through its matrix.
  const material = { blend: 'add', texture: null, color: [1, 1, 1, 1], custom: null, cull: 0,
    shader: { family: 'particle', main: { st: [1, 1, 0, 0], speed: [0, 0], scroll: [0, 0], fract: false }, distort: null, dissolve: [], edge: null, ramp: null, vertex: null, animated: [] } };
  const system = (name: string, x: number, rest: Json) => ({ name, requires: ['sub'], only: null, delay: 0, active: true, follow: null, child: false,
    emitter: { matrix: [1, 0, 0, x, 0, 1, 0, 0, 0, 0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }, clock: { loop: false, maxAlive: 100 }, ...rest });
  const doc = parseParticleDocument({
    version: 1, unit: 0.01, camera: { size: 10, height: 2000 }, controller: { fixFxDelay: 1, animTimeFixed: 0 }, textures: [], meshes: [{ builtin: 'quad' }], materials: [material],
    systems: [
      system('spawner', 2, { sub: [[1, 'birth', 1]], emission: { rate: 0, bursts: [[0, 1, 1, 0.01, 1]] }, start: { lifetime: 10, speed: 0 }, velocity: { linear: [6, 0, 0] },
        render: null, material: null }),
      system('child', 5, { child: true, clock: { loop: true, maxAlive: 100 }, emission: { rate: 60 }, start: { lifetime: 100, speed: 0, size: 0.1 }, render: { mode: 'billboard' }, material: 0 }),
    ],
  }, 0);
  assert.deepEqual(doc.skipped, []);
  const director = new ParticleDirector(doc, { precision: 64, degrade: false, warn: () => {} });
  for (let n = 0; n <= 30; n++) director.frame({ playing: 'Idle', animationTime: n / 60, time: n / 60 }, n ? 1 / 60 : 0);
  const child = director.runs.find((run) => run.parent)!;
  assert.deepEqual([director.runs.map((run) => run.data.index), child.on, child.sim.count > 20], [[0, 1], true, true], 'the child is a run of its own, on, with particles');
  const out = new VertexArray(false);
  const ctx = { unit: 0.01, cameraHeight: 2000, viewHeight: 0, conventions: PARTICLE_CONVENTIONS, fade: 1 };
  const written = expandSystem({ data: child.data, sim: child.sim, matrix: child.matrix, scale: child.scale, alpha: 1, meshes: ['quad'], inputs: null }, ctx, out);
  assert.equal(written, child.sim.count * 4);
  for (let q = 0; q < child.sim.count; q++) {
    const x = (out.f32[q * 4 * LEAN_FLOATS] + out.f32[(q * 4 + 3) * LEAN_FLOATS]) / 2, y = (out.f32[q * 4 * LEAN_FLOATS + 1] + out.f32[(q * 4 + 3) * LEAN_FLOATS + 1]) / 2;
    assert.ok(x >= 200 - 1e-6 && x <= 200 + 300 + 1e-6 && Math.abs(y) < 1e-6, `a child particle drawn at (${x}, ${y}), on the parent's path from x = 200 to 500`);
  }
});

/* --- every export (PARTICLE_EXPORTS) -------------------------------------------------------------- */

const EXPORTS = process.env.PARTICLE_EXPORTS;
test('every export: the new reader keeps every entry; no custom input is read in the layout this reader guesses', { skip: !EXPORTS && 'PARTICLE_EXPORTS names no export root' }, (t) => {
  let models = 0, runs = 0, guessed = 0;
  for (const slug of fs.readdirSync(path.join(EXPORTS!, 'models')).sort()) {
    for (const folder of fs.readdirSync(path.join(EXPORTS!, 'models', slug))) {
      const dir = path.join(EXPORTS!, 'models', slug, folder);
      const layers = parseDynamicLayers(JSON.parse(fs.readFileSync(path.join(dir, 'layers.json'), 'utf8')));
      assert.equal(layers.skipped, 0, `${slug}: nothing skipped`);
      models++;
      if (!layers.particles) continue;
      const doc = parseParticleText(fs.readFileSync(path.join(dir, layers.particles.file), 'utf8'), layers.textures.length);
      const inRuns = layers.draw.flatMap((e) => (e.kind === 'particles' ? e.systems : []));
      runs += layers.draw.filter((e) => e.kind === 'particles').length;
      assert.ok(inRuns.every((i) => i < doc.systems.length), `${slug}: every run names a system`);
      // Every system that draws is in a run (the others: renderer-off spawners).
      doc.systems.forEach((s, i) => { if (s?.render) assert.ok(inRuns.includes(i), `${slug}: ${s.name} drawn`); });
      // The layout rule's premise: on a material read as Dissolve(CustomData) (no distortion, no ramp), input 5 is
      // driven by no system (in the Disturb family it would add to intensities that do not exist).
      for (const s of doc.systems) {
        const material = s?.material != null ? doc.materials[s.material] : null;
        if (!s || !material || customFeature(material) !== 'dissolve') continue;
        guessed++;
        const source = material.custom![5];
        if (source === 0 || source.startsWith('uv')) { assert.equal(source, 0, `${slug} ${s.name}: input 5 reads ${source}`); continue; }
        const slot = s.custom?.[source[1] === '1' ? 0 : 1];
        const component = 'xyzw'.indexOf(source[3]);
        const driven = !!slot && (slot.kind === 'color' || (component < slot.count && !(slot.vector[component].mode === 0 && slot.vector[component].scalar === 0)));
        assert.equal(driven, false, `${slug} ${s.name}: input 5 (${source}) is driven`);
      }
    }
  }
  t.diagnostic(`${models} models, ${runs} particle runs, ${guessed} systems on a guessed layout`);
});
