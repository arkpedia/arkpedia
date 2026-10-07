"""Golden fixtures for the site's particle simulator (lib/skins/particleSim.ts), made by the reference simulator
(scripts/tests/particle_oracle.py in arkpedia/arkpedia-l2d-assets, the specification) from real exports
(layerParticles.json, written by that repository's `scripts/sync.py --particles`).

Each case is one exported system with a still emitter, played as the P1 round trip plays it: seed
play_seed(0x5EED, system index, 1), the emitter at Pose.from_export, play() (prewarm included), then step(1/60)
at the same pose, the render records read after play() and after every step. Every record is position,
velocity, size, rotation (3 each), colour, Custom1, Custom2, UV rect (4 each), age over lifetime and sheet frame
(-1 without a sheet): 30 numbers a particle.

The selection: every Hoshiguma system (char_1044_hsgma2_2) and about 150 more, stratified by feature over every
model's systems (each feature tag up to three times, from as many models as it can), 2 s each, and 20 of them
for 10 s. Left out: mesh-shape systems (the oracle emits them at the origin until P2 gives it mesh shapes; the
site samples the mesh), which the test lists.

    python -I scripts/particles/make-golden.py --oracle ../l2d-assets/scripts/tests --exports EXPORTS \
        --compact scripts/tests/fixtures/particles/golden.json.gz --full OUT_DIR

--compact writes the small committed fixture (scripts/tests/test-particles.ts reads it): the cases of a greedy
cover of every feature tag the selection has, a pruned copy of each of their models' layerParticles.json, and per
case the particle count and 8 sums over the particles (position, velocity, size, rotation, colour, custom data,
UV rect, age and frame) at every step, with the full records of up to 8 particles (the 4 oldest and 4 newest)
at steps 1, 60, 120 and 600. --full writes everything, every particle at every step, one gzipped JSON per model,
for PARTICLE_GOLDEN_DIR=OUT_DIR npm test (the large comparison; too big to commit).
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import sys
from pathlib import Path

MODEL_SEED = 0x5EED
STEP = 1 / 60
SHORT = 120  # 2 s
LONG = 600   # 10 s
HOSHIGUMA = 'char_1044_hsgma2_2'
PER_TAG = 3
TARGET = 150
LONG_CASES = 20
SAMPLE_STEPS = (1, 60, 120, 600)
SAMPLE_EACH_END = 4
# The committed fixture sums the 30 values per particle in these groups, per step.
GROUPS = ((0, 3), (3, 6), (6, 9), (9, 12), (12, 16), (16, 24), (24, 28), (28, 30))


def tags_of(system: dict) -> list[str]:
    """Feature tags a system exercises (what the stratified selection covers at least once)."""
    tags = []
    c, em, st = system['clock'], system['emission'], system['start']
    for key in ('loop', 'prewarm'):
        if key in c:
            tags.append(f'clock.{key}={c[key]}')
    for key in ('startDelay', 'speed', 'seed', 'space', 'scaling', 'maxParticles'):
        if key in c:
            tags.append(f'clock.{key}' + (f'={c[key]}' if key in ('space', 'scaling') else ''))
    if isinstance(c.get('startDelay'), list):
        tags.append('clock.startDelay.random')
    if c.get('maxParticles', 1000) <= 3:
        tags.append('clock.maxParticles.small')
    for key in ('rate', 'distance', 'bursts', 'enabled'):
        if key in em:
            tags.append(f'emission.{key}')
    for b in em.get('bursts', []):
        if b[2] == 0:
            tags.append('burst.infinite')
        elif b[2] > 1:
            tags.append('burst.cycles')
        if b[4] < 1:
            tags.append('burst.probability')
        if isinstance(b[1], list):
            tags.append(f'burst.count.{b[1][0]}')
        if b[0] > 0:
            tags.append('burst.later')
    for key, value in st.items():
        tags.append(f'start.{key}' + (f'.{value[0]}' if isinstance(value, list) and value and isinstance(value[0], str) else ''))
    sh = system.get('shape')
    if sh:
        tags.append(f'shape.{sh["type"]}')
        for key in ('pos', 'rot', 'scale', 'randomDir', 'spherical', 'randomPos', 'thickness', 'arc', 'angle', 'length', 'boxThickness'):
            if key in sh:
                tags.append(f'shape.{key}')
        for key in ('arcMode', 'radiusMode'):
            if key in sh:
                m = sh[key]
                tags.append(f'shape.{key}.{m.get("mode", "random")}')
                if 'spread' in m:
                    tags.append(f'shape.{key}.spread')
    for module in ('velocity', 'limit', 'force', 'noise', 'inherit', 'size', 'rotation', 'color', 'sheet', 'custom'):
        if module not in system:
            continue
        tags.append(module)
        value = system[module]
        if isinstance(value, dict):
            for key in value:
                tags.append(f'{module}.{key}')
    if 'sheet' in system:
        sheet = system['sheet']
        tags.append(f'sheet.row.{sheet.get("row", "whole")}' if sheet.get('row') == 'random' else ('sheet.row.index' if 'row' in sheet else 'sheet.whole'))
    for slot in system.get('custom', []):
        if slot:
            tags.append('custom.' + ('color' if 'color' in slot else f'vector{len(slot["vector"])}'))
    text = json.dumps(system)
    for marker, tag in (('"repeat"', 'curve.wrap.repeat'), ('"pingPong"', 'curve.wrap.pingPong'), ('null', 'curve.stepped'), ('["cc"', 'curve.cc'),
                        ('["c"', 'curve.c'), ('["gg"', 'colour.gg'), ('["rg"', 'colour.rg'), ('"fixed": true', 'gradient.fixed')):
        if marker in text:
            tags.append(tag)
    return sorted(set(tags))


def stable_key(*parts) -> str:
    return hashlib.sha256('/'.join(map(str, parts)).encode()).hexdigest()


def select(models: dict) -> list[tuple[str, int]]:
    """Every Hoshiguma system with a still emitter, then up to PER_TAG systems per tag (fewest-used models first)."""
    chosen: list[tuple[str, int]] = []
    eligible = {}
    for slug, (doc, _) in models.items():
        for i, s in enumerate(doc['systems']):
            if 'matrix' not in s['emitter'] or s.get('requires') or (s.get('shape') or {}).get('type') == 'mesh':
                continue
            eligible[(slug, i)] = tags_of(s)
    chosen += [(slug, i) for (slug, i) in sorted(eligible) if slug == HOSHIGUMA]
    picked = set(chosen)
    per_model: dict[str, int] = {}
    by_tag: dict[str, list[tuple[str, int]]] = {}
    for key, tags in eligible.items():
        for tag in tags:
            by_tag.setdefault(tag, []).append(key)
    others = 0

    def take(key):
        nonlocal others
        chosen.append(key)
        picked.add(key)
        per_model[key[0]] = per_model.get(key[0], 0) + 1
        others += 1

    for tag in sorted(by_tag, key=lambda t: (len(by_tag[t]), t)):  # rarest tags first
        have = sum(1 for key in picked if tag in eligible[key])
        candidates = sorted((key for key in by_tag[tag] if key not in picked and key[0] != HOSHIGUMA),
                            key=lambda key: (per_model.get(key[0], 0), stable_key(tag, *key)))
        while have < PER_TAG and candidates and others < TARGET:
            take(candidates.pop(0))
            have += 1
    # Then the models least represented, one system at a time, until TARGET.
    rest = sorted((key for key in eligible if key not in picked and key[0] != HOSHIGUMA), key=lambda key: stable_key('fill', *key))
    while others < TARGET and rest:
        rest.sort(key=lambda key: (per_model.get(key[0], 0), stable_key('fill', *key)))
        take(rest.pop(0))
    return chosen


def cover(chosen: list[tuple[str, int]], tags: dict, names: dict) -> set[tuple[str, int]]:
    """The committed subset: a greedy cover of every tag of the chosen cases (Hoshiguma's first), each tag once."""
    need = set().union(*(tags[key] for key in chosen))
    # Hoshiguma's dust_04 too: the oracle's real-bundle test checks its prewarmed steady state (about 75 alive).
    out = {key for key in chosen if key in names and names[key].endswith('/dust_04')}
    order = sorted(chosen, key=lambda key: (key[0] != HOSHIGUMA, stable_key('cover', *key)))
    while need:
        best = max(order, key=lambda key: (len(need & tags[key]), key[0] == HOSHIGUMA))
        if not need & tags[best]:
            break
        out.add(best)
        need -= tags[best]
    return out


def flat(record: dict) -> list:
    out = []
    for key in ('position', 'velocity', 'size', 'rotation', 'color', 'custom1', 'custom2', 'uv'):
        out += list(record[key])
    out += [record['age01'], -1 if record['frame'] is None else record['frame']]
    return out


def run_case(oracle, doc: dict, index: int, steps: int) -> list[list[list[float]]]:
    """The render records (flat) after play() and after each of `steps` steps."""
    system = doc['systems'][index]
    seed = oracle.play_seed(MODEL_SEED, index, 1)
    pose = oracle.Pose.from_export(system['emitter'])
    sim = oracle.Simulation.from_export(system, doc, seed=seed)
    sim.play(pose)
    frames = [[flat(r) for r in sim.render_records()]]
    for _ in range(steps):
        sim.step(STEP, pose)
        frames.append([flat(r) for r in sim.render_records()])
    return frames


def g12(x: float) -> float:
    return float(f'{x:.12g}')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--oracle', required=True, help='the assets repository scripts/tests folder (particle_oracle.py)')
    parser.add_argument('--exports', required=True, help='a folder with models/<slug>/<md5>/layerParticles.json and layers.json')
    parser.add_argument('--compact', help='the committed fixture to write (.json.gz)')
    parser.add_argument('--full', help='a folder for the full fixtures (one .json.gz per model)')
    args = parser.parse_args()
    sys.path.insert(0, str(Path(args.oracle).resolve()))
    import particle_oracle as oracle  # noqa: E402

    models = {}
    for path in sorted(Path(args.exports).glob('models/*/*/layerParticles.json')):
        layers = json.loads((path.parent / 'layers.json').read_text())
        first = len(layers['textures']) + len(layers.get('effectTextures', []))
        models[path.parent.parent.name] = (json.loads(path.read_text()), first)
    chosen = select(models)
    tags = {key: set(tags_of(models[key[0]][0]['systems'][key[1]])) for key in chosen}
    committed = cover(chosen, tags, {key: models[key[0]][0]['systems'][key[1]]['name'] for key in chosen})
    long = set(sorted(chosen, key=lambda key: (key not in committed, stable_key('long', *key)))[:LONG_CASES])
    meta = {'generator': 'scripts/particles/make-golden.py', 'modelSeed': MODEL_SEED, 'step': STEP, 'exportDefaults': oracle.EXPORT_DEFAULTS,
            'randomKeys': list(oracle.RANDOM_KEYS), 'mix32': [oracle.mix32(x) for x in (0, 1, 0xDEADBEEF)],
            'particleRandom': [oracle.particle_random(12345, k) for k in range(3)], 'playSeed': oracle.play_seed(1, 2, 3)}
    excluded = sorted(f'{slug} {s["name"]}' for slug, (doc, _) in models.items() for s in doc['systems']
                      if (s.get('shape') or {}).get('type') == 'mesh' and 'matrix' in s['emitter'])
    by_model: dict[str, list[int]] = {}
    for slug, index in chosen:
        by_model.setdefault(slug, []).append(index)
    compact = {**meta, 'models': {}, 'cases': [], 'excluded': {'mesh shape (the oracle has none until P2)': excluded}}
    full_dir = Path(args.full) if args.full else None
    if full_dir:
        full_dir.mkdir(parents=True, exist_ok=True)
    totals = {'cases': 0, 'steps': 0, 'particleSteps': 0}
    for slug, indices in sorted(by_model.items()):
        doc, first = models[slug]
        # A pruned document: the committed systems, their materials and meshes renumbered.
        materials, meshes = {}, {}
        systems = []
        kept = [i for i in indices if (slug, i) in committed]
        for i in kept:
            s = json.loads(json.dumps(doc['systems'][i]))
            if s.get('material') is not None:
                s['material'] = materials.setdefault(s['material'], len(materials))
            if s.get('render') and 'meshes' in s['render']:
                s['render']['meshes'] = [meshes.setdefault(m, len(meshes)) for m in s['render']['meshes']]
            if s.get('shape', {}).get('mesh') is not None:
                s['shape']['mesh'] = meshes.setdefault(s['shape']['mesh'], len(meshes))
            systems.append(s)
        pruned = {**{k: doc[k] for k in ('version', 'unit', 'camera', 'controller', 'textures')},
                  'materials': [doc['materials'][i] for i in sorted(materials, key=materials.get)],
                  'meshes': [doc['meshes'][i] for i in sorted(meshes, key=meshes.get)], 'systems': systems}
        if kept:
            compact['models'][slug] = {'first': first, 'doc': pruned}
        full_cases = []
        for index in indices:
            steps = LONG if (slug, index) in long else SHORT
            frames = run_case(oracle, doc, index, steps)
            totals['cases'] += 1
            totals['steps'] += steps
            totals['particleSteps'] += sum(len(f) for f in frames)
            case = {'model': slug, 'index': index, 'name': doc['systems'][index]['name'], 'seed': oracle.play_seed(MODEL_SEED, index, 1),
                    'steps': steps, 'counts': [len(f) for f in frames]}
            if (slug, index) in committed:
                sums = [[g12(sum(p[j] for p in f for j in range(a, b))) for a, b in GROUPS] for f in frames]
                samples = {}
                for at in SAMPLE_STEPS:
                    if at < len(frames):
                        f = frames[at]
                        keep = list(range(len(f))) if len(f) <= 2 * SAMPLE_EACH_END else [*range(SAMPLE_EACH_END), *range(len(f) - SAMPLE_EACH_END, len(f))]
                        samples[str(at)] = {'at': keep, 'records': [[g12(x) for x in f[i]] for i in keep]}
                compact['cases'].append({**case, 'system': kept.index(index), 'tags': sorted(tags[(slug, index)]), 'sums': sums, 'samples': samples})
            if full_dir:
                full_cases.append({**case, 'frames': frames})
        if full_dir:
            with gzip.open(full_dir / f'{slug}.json.gz', 'wt') as fh:
                json.dump({**meta, 'model': slug, 'first': first, 'doc': doc, 'cases': full_cases}, fh)
        print(f'{slug}: {len(indices)} cases', flush=True)
    if args.compact:
        Path(args.compact).parent.mkdir(parents=True, exist_ok=True)
        # No name and no time in the gzip header: the same selection writes the same bytes, wherever it is written.
        with open(args.compact, 'wb') as raw, gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0) as fh:
            fh.write(json.dumps(compact, separators=(',', ':')).encode())
    print(json.dumps({**totals, 'models': len(by_model), 'tags': len(set().union(*tags.values())), 'committed': len(committed),
                      'excludedMeshShapes': len(excluded)}))


if __name__ == '__main__':
    main()
