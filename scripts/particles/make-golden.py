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
for 10 s. Sub-emitter systems (`requires: ['sub']`) are played as families instead (below); a system on an emitter
timeline is left out of this selection (the director's tests cover timelines), and one on a bone follower is
played at its matrix as if the follower stood at the root.

Families (`--families`): a parent and its sub-emitter children played together as the oracle's tests play them
(Simulation.link in the export's link order, play(pose, child poses), step(1/60, pose, child poses)), each member
with play_seed(0x5EED, its index, 1), for 5 s: every Hoshiguma family, every family with a death link, then a
stratified cover of the families' feature tags from the other models. Poses are fixed: a still emitter's, a
timeline's first frame, and on a bone follower the follower's setup position with no rotation; each is written into
the fixture, so the site uses the same numbers.

    python -I scripts/particles/make-golden.py --oracle ../l2d-assets/scripts/tests --exports EXPORTS \
        --compact scripts/tests/fixtures/particles/golden.json.gz --families scripts/tests/fixtures/particles/families.json.gz --full OUT_DIR

--compact writes the small committed fixture (scripts/tests/test-particles.ts reads it): the cases of a greedy
cover of every feature tag the selection has, a pruned copy of each of their models' layerParticles.json, and per
case the particle count and 8 sums over the particles (position, velocity, size, rotation, colour, custom data,
UV rect, age and frame) at every step, with the full records of up to 8 particles (the 4 oldest and 4 newest)
at steps 1, 60, 120 and 600. --full writes everything, every particle at every step, one gzipped JSON per model,
for PARTICLE_GOLDEN_DIR=OUT_DIR npm test (the large comparison; too big to commit). --families writes the committed
family fixture the same way (a greedy cover of the families' tags, Hoshiguma's first, with per member the particle
count and sums at every step and sampled records), and --full adds <slug>.families.json.gz with every family.
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
FAMILY_STEPS = 300  # 5 s
FAMILY_PER_TAG = 3
FAMILY_TARGET = 30  # families beyond Hoshiguma's and the death links'
SAMPLE_STEPS = (1, 60, 120, 300, 600)
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
            if 'matrix' not in s['emitter'] or s.get('requires'):
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


def family_tags(doc: dict, parent: int) -> list[str]:
    """Feature tags of a sub-emitter family (the family selection covers each)."""
    s = doc['systems'][parent]
    c = s['clock']
    tags = {f'parent.space={c.get("space", "local")}', f'parent.loop={c.get("loop", True)}'}
    for flag, tag in ((c.get('prewarm'), 'parent.prewarm'), (s['render'] is None, 'parent.spawner'), (s.get('follow'), 'parent.follow'),
                      ('timeline' in s['emitter'], 'parent.timeline'), ('distance' in s['emission'], 'parent.distance'),
                      (s['emission'].get('bursts'), 'parent.bursts'), (len(s['sub']) > 2, 'parent.links>2')):
        if flag:
            tags.add(tag)
    for index, kind, probability in s['sub']:
        ch = doc['systems'][index]
        cc, em = ch['clock'], ch['emission']
        tags |= {f'link.{kind}', f'child.space={cc.get("space", "local")}', f'child.loop={cc.get("loop", True)}'}
        for flag, tag in ((probability < 1, 'link.probability'), (em.get('bursts'), 'child.bursts'), ('distance' in em, 'child.distance'),
                          (em.get('rate', 10) != 0, 'child.rate'), ('inherit' in ch, 'child.inherit'), ('speed' in cc, 'child.speed'),
                          (cc.get('prewarm'), 'child.prewarm'), ('startDelay' in cc, 'child.startDelay'), ('timeline' in ch['emitter'], 'child.timeline'),
                          ((ch.get('shape') or {}).get('type') == 'mesh', 'child.meshShape'), ('limit' in ch, 'child.limit'), ('noise' in ch, 'child.noise'),
                          ('velocity' in ch, 'child.velocity'), (cc.get('seed') is not None, 'child.seed'), (ch['render'] is None, 'child.noRender')):
            if flag:
                tags.add(tag)
        if isinstance(em.get('rate'), list):
            tags.add(f'child.rate.{em["rate"][0]}')
        for b in em.get('bursts', []):
            if b[2] != 1:
                tags.add('child.burst.cycles')
            if b[4] < 1:
                tags.add('child.burst.probability')
            if isinstance(b[1], list):
                tags.add(f'child.burst.count.{b[1][0]}')
            if b[0] > 0:
                tags.add('child.burst.later')
    return sorted(tags)


def select_families(models: dict) -> list[tuple[str, int]]:
    """Every Hoshiguma family, every family with a death link, then up to FAMILY_PER_TAG families a tag from the
    other models (rarest tags first, fewest-used models first), FAMILY_TARGET at most. Families with trail data
    (a capability the site lacks) are left out."""
    families = {}
    for slug, (doc, _) in models.items():
        for i, s in enumerate(doc['systems']):
            if s.get('sub') and not any('trail' in doc['systems'][k].get('requires', []) for k in [i] + [link[0] for link in s['sub']]):
                families[(slug, i)] = set(family_tags(doc, i))
    chosen = [key for key in sorted(families) if key[0] == HOSHIGUMA]
    chosen += [key for key in sorted(families) if key[0] != HOSHIGUMA and 'link.death' in families[key]]
    picked = set(chosen)
    per_model: dict[str, int] = {}
    by_tag: dict[str, list[tuple[str, int]]] = {}
    for key, tags in families.items():
        for tag in tags:
            by_tag.setdefault(tag, []).append(key)
    others = 0
    for tag in sorted(by_tag, key=lambda t: (len(by_tag[t]), t)):
        have = sum(1 for key in picked if tag in families[key])
        candidates = sorted((key for key in by_tag[tag] if key not in picked and key[0] != HOSHIGUMA),
                            key=lambda key: (per_model.get(key[0], 0), stable_key('family', tag, *key)))
        while have < FAMILY_PER_TAG and candidates and others < FAMILY_TARGET:
            key = candidates.pop(0)
            chosen.append(key)
            picked.add(key)
            per_model[key[0]] = per_model.get(key[0], 0) + 1
            others += 1
            have += 1
    return chosen


def pose_numbers(pose) -> list[float]:
    """An oracle Pose in the site's Pose layout: position, rotation (x, y, z, w), then the 3x3 (rows)."""
    return [*pose.position, *pose.rotation, *pose.linear]


def run_family(oracle, doc: dict, parent: int, steps: int):
    """A family played as the oracle's tests play one: (members, poses, frames), frames[step][member] the render
    records (flat) after play() and after each step."""
    s = doc['systems'][parent]
    members = [parent] + [link[0] for link in s['sub']]

    def pose(system):
        placement = None
        if system.get('follow'):
            x, y = (v * doc['unit'] for v in system['follow']['position'])
            placement = ([1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, 0], (0.0, 0.0, 0.0, 1.0))
        return oracle.emitter_pose(system, 0.0, None, placement)

    sims = [oracle.Simulation.from_export(doc['systems'][k], doc, seed=oracle.play_seed(MODEL_SEED, k, 1)) for k in members]
    for (_, kind, probability), child in zip(s['sub'], sims[1:]):
        sims[0].link(child, kind, probability)
    poses = [pose(doc['systems'][k]) for k in members]
    sims[0].play(poses[0], poses[1:])
    frames = [[[flat(r) for r in m.render_records()] for m in sims]]
    for _ in range(steps):
        sims[0].step(STEP, poses[0], poses[1:])
        frames.append([[flat(r) for r in m.render_records()] for m in sims])
    return members, [pose_numbers(p) for p in poses], frames


def prune(doc: dict, keep: list[int]) -> tuple[dict, dict]:
    """A document of only the systems `keep` (in their order), their materials, meshes and sub links renumbered;
    and the old index to new."""
    materials, meshes = {}, {}
    index = {old: new for new, old in enumerate(keep)}
    systems = []
    for i in keep:
        s = json.loads(json.dumps(doc['systems'][i]))
        if s.get('material') is not None:
            s['material'] = materials.setdefault(s['material'], len(materials))
        if s.get('render') and 'meshes' in s['render']:
            s['render']['meshes'] = [meshes.setdefault(m, len(meshes)) for m in s['render']['meshes']]
        if s.get('shape', {}).get('mesh') is not None:
            s['shape']['mesh'] = meshes.setdefault(s['shape']['mesh'], len(meshes))
        if 'sub' in s:
            s['sub'] = [[index[link[0]], link[1], link[2]] for link in s['sub']]
        systems.append(s)
    pruned = {**{k: doc[k] for k in ('version', 'unit', 'camera', 'controller', 'textures')},
              'materials': [doc['materials'][i] for i in sorted(materials, key=materials.get)],
              'meshes': [doc['meshes'][i] for i in sorted(meshes, key=meshes.get)], 'systems': systems}
    return pruned, index


def samples_of(frames_of_one: list) -> dict:
    """Full records of up to 8 particles (the 4 oldest and the 4 newest) at SAMPLE_STEPS."""
    samples = {}
    for at in SAMPLE_STEPS:
        if at < len(frames_of_one):
            f = frames_of_one[at]
            keep = list(range(len(f))) if len(f) <= 2 * SAMPLE_EACH_END else [*range(SAMPLE_EACH_END), *range(len(f) - SAMPLE_EACH_END, len(f))]
            samples[str(at)] = {'at': keep, 'records': [[g12(x) for x in f[i]] for i in keep]}
    return samples


def write_gzip(path: str, value) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    # No name and no time in the gzip header: the same selection writes the same bytes, wherever it is written.
    with open(path, 'wb') as raw, gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0) as fh:
        fh.write(json.dumps(value, separators=(',', ':')).encode())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--oracle', required=True, help='the assets repository scripts/tests folder (particle_oracle.py)')
    parser.add_argument('--exports', required=True, help='a folder with models/<slug>/<md5>/layerParticles.json and layers.json')
    parser.add_argument('--compact', help='the committed fixture to write (.json.gz)')
    parser.add_argument('--full', help='a folder for the full fixtures (one .json.gz per model)')
    parser.add_argument('--families', help='the committed sub-emitter family fixture to write (.json.gz)')
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
    by_model: dict[str, list[int]] = {}
    for slug, index in chosen:
        by_model.setdefault(slug, []).append(index)
    compact = {**meta, 'models': {}, 'cases': []}
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
        write_gzip(args.compact, compact)
    print(json.dumps({**totals, 'models': len(by_model), 'tags': len(set().union(*tags.values())), 'committed': len(committed)}))
    if args.families or full_dir:
        families(oracle, models, meta, args.families, full_dir)


def families(oracle, models: dict, meta: dict, compact_path: str | None, full_dir: Path | None) -> None:
    """The sub-emitter family fixtures (the module docstring). A family whose children never emit in the 5 s (its
    parent waits on a timeline or a moving emitter, or starts later) checks nothing and is left out."""
    runs = {}
    for slug, parent in select_families(models):
        doc = models[slug][0]
        members, poses, frames = run_family(oracle, doc, parent, FAMILY_STEPS)
        if any(len(m) for f in frames for m in f[1:]):
            runs[(slug, parent)] = (members, poses, frames)
        else:
            print(f'{slug} {doc["systems"][parent]["name"]}: its children never emit in {FAMILY_STEPS} steps; left out', flush=True)
    tags = {key: set(family_tags(models[key[0]][0], key[1])) for key in runs}
    # The committed cover: every death link, then Hoshiguma's first, every tag once.
    need = set().union(*tags.values())
    committed = {key for key in runs if 'link.death' in tags[key]}
    for key in committed:
        need -= tags[key]
    order = sorted(runs, key=lambda key: (key[0] != HOSHIGUMA, stable_key('family-cover', *key)))
    while need:
        best = max(order, key=lambda key: (len(need & tags[key]), key[0] == HOSHIGUMA))
        if not need & tags[best]:
            break
        committed.add(best)
        need -= tags[best]
    compact = {**meta, 'steps': FAMILY_STEPS, 'families': []}
    totals = {'families': 0, 'members': 0, 'particleSteps': 0}
    by_model: dict[str, list[int]] = {}
    for slug, parent in runs:
        by_model.setdefault(slug, []).append(parent)
    for slug, parents in sorted(by_model.items()):
        doc, first = models[slug]
        full = []
        for parent in parents:
            members, poses, frames = runs[(slug, parent)]
            totals['families'] += 1
            totals['members'] += len(members)
            totals['particleSteps'] += sum(len(m) for f in frames for m in f)
            case = {'model': slug, 'parent': parent, 'members': members, 'names': [doc['systems'][k]['name'] for k in members],
                    'seeds': [oracle.play_seed(MODEL_SEED, k, 1) for k in members], 'poses': poses, 'tags': sorted(tags[(slug, parent)]),
                    'counts': [[len(m) for m in f] for f in frames]}
            if (slug, parent) in committed:
                pruned, index = prune(doc, sorted(members))
                sums = [[[g12(sum(p[j] for p in m for j in range(a, b))) for a, b in GROUPS] for m in f] for f in frames]
                compact['families'].append({**case, 'first': first, 'doc': pruned, 'at': [index[k] for k in members], 'sums': sums,
                                            'samples': [samples_of([f[j] for f in frames]) for j in range(len(members))]})
            if full_dir:
                full.append({**case, 'frames': frames})
        if full_dir:
            with gzip.open(full_dir / f'{slug}.families.json.gz', 'wt') as fh:
                json.dump({**meta, 'model': slug, 'first': first, 'doc': doc, 'steps': FAMILY_STEPS, 'families': full}, fh)
        print(f'{slug}: {len(parents)} families', flush=True)
    if compact_path:
        write_gzip(compact_path, compact)
    print(json.dumps({**totals, 'tags': len(set().union(*tags.values())), 'committed': len(committed)}))


if __name__ == '__main__':
    main()
