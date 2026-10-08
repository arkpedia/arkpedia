"""Golden vertex dumps for the site's particle geometry (lib/skins/particleGeometry.ts): a Python expansion of the
reference simulator's particles (scripts/tests/particle_oracle.py in arkpedia/arkpedia-l2d-assets, the
specification of the simulation) into the vertices the site draws, written from the expansion's own
specification (UNITY-PARTICLES section 8, the plan's section 4) rather than from the TypeScript.

Each case is one exported system with a still emitter, played as make-golden.py plays it (seed
play_seed(0x5EED, index, 1), the emitter at Pose.from_export, play(), then step(1/60) at the same pose); at a few
steps every live particle is expanded at the end of the step (the display's alpha 1) into vertices in draw
order: x, y (skeleton units: the root position over `unit`), u, v (Unity's v up, in the texture-sheet frame),
r, g, b, a (the particle colour, a mesh's vertex colour times it, before the renderer rounds it to bytes) and,
for a material with custom vertex streams, its 8 custom inputs; a mesh system's indices too.

The conventions Unity does not publish are the expansion's named switches (particleGeometry.ts
ParticleConventions); the fixture records the ones each case was made with. The defaults are the ones P6 settled
against the recordings, which the oracle's own rendering helpers follow: billboard_corners (a positive rotation
turns clockwise, the quad is (corner + pivot) x size) and stretched_corners (the texture's U along the stretch,
+U and the pivot's y against the motion, centred). Every View billboard without 3D rotation is checked against
billboard_corners and every stretched case with the defaults against stretched_corners; two variant cases keep the
other branches of each switch covered.

The selection covers every render mode, alignment and sort mode and each custom layout (lean vertices; Disturb's
and Dissolve(CustomData)'s inputs; the UV2 stream, the next sheet frame). Where no exported system has a mode
(sort `depth`) or too few with particles (alignment `facing`), a real system is copied with that one member
changed, and the case says so.

    python -I scripts/particles/make-vertex-golden.py --oracle ../l2d-assets/scripts/tests --exports EXPORTS \
        --out scripts/tests/fixtures/particles/vertices.json.gz
"""
from __future__ import annotations

import argparse
import copy
import gzip
import json
import math
import sys
from pathlib import Path

MODEL_SEED = 0x5EED
STEP = 1 / 60
CONVENTIONS = {'billboardRotation': -1, 'meshRotation': 1, 'pivot': 1, 'stretchAxis': 'u', 'stretchSense': -1, 'stretchAnchor': 'centre',
               'stretchPivotAlong': 'y', 'sizeCapBasis': 'camera'}
CORNERS = ((-0.5, -0.5), (0.5, -0.5), (-0.5, 0.5), (0.5, 0.5))
CORNER_UV = ((0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0))
QUAD_TRIANGLES = (0, 3, 1, 3, 0, 2)

# (model, system name or index, changed members, conventions changed, what it covers). Steps sampled: SAMPLES.
CASES = [
    ('char_1044_hsgma2_2', 'dust_01', {}, {}, 'billboard view, sort none, sheet, lean; checked against billboard_corners'),
    ('char_1044_hsgma2_2', 'spark_add_top_01', {}, {}, 'stretched view, negative lengthScale, pivot (Hoshiguma\'s chest-flash sparks); checked against stretched_corners'),
    ('char_1044_hsgma2_2', 'spark_add_top_01', {}, {'stretchAxis': 'v', 'stretchSense': 1, 'stretchAnchor': 'head', 'stretchPivotAlong': 'x', 'pivot': -1},
     'the same with every other stretched switch'),
    ('char_1013_chen2_summer_20', 'bubble_local', {}, {}, 'billboard view, sort distance, tilted emitter, sheet'),
    ('char_1013_chen2_summer_20', 'bubble_duck', {}, {}, 'billboard view, sort oldestInFront, 3D rotation'),
    ('char_003_kalts_sale_14', 'spark04', {}, {}, 'billboard view, sort youngestInFront, world space, pivot'),
    ('char_003_kalts_sale_14', 'spark04', {}, {'billboardRotation': 1, 'pivot': -1}, 'the same with the other rotation and pivot signs'),
    ('char_1023_ghost2_boc_6', 101, {}, {}, 'billboard local (tilted emitter), Dissolve(CustomData) layout'),
    ('char_1023_ghost2_boc_6', 'moon01', {}, {}, 'billboard world alignment'),
    ('char_1016_agoat2_epoque_34', 'glow_01', {}, {}, 'billboard velocity alignment, 3D rotation'),
    ('char_1013_chen2_summer_20', 'bubble_world', {'render.sort': 'depth', 'render.align': 'facing'},
     {}, 'billboard facing, sort depth (no export has depth; this copy of a distance-sorted system does)'),
    ('char_1035_wisdel_sale_14', 'spark_small_01', {}, {}, 'billboard size cap (maxSize 0.004 of the camera height)'),
    ('char_1041_angel2_2', 'xingdian_lizi_01', {}, {}, 'stretched with velocityScale'),
    ('char_1028_texas2_epoque_36', 122, {}, {}, 'stretched local alignment, sort distance, tilted emitter'),
    ('char_1012_skadi2_2', 'xiaoyu', {}, {}, 'stretched local alignment, sort none, tilted and turned emitter'),
    ('char_1038_whitw2_sale_15', 'ds_line (1)', {}, {}, 'custom inputs from the UV2 stream (the next sheet frame) and Custom1'),
    ('char_003_kalts_sale_14', 'fire_back_01', {}, {}, 'Disturb(CustomData) layout (Custom1 and Custom2), stretched, sort youngestInFront, world space'),
    ('char_249_mlyss_ambienceSynesthesia_6', 'h', {}, {}, 'mesh world alignment, sheet remap, mesh vertex colours, 3D size'),
    ('char_172_svrash_ambienceSynesthesia_4', 'light_02', {}, {}, 'mesh velocity alignment, 3D rotation'),
    ('char_003_kalts_boc_6', 'c', {}, {}, 'mesh local alignment, 3D size'),
    ('char_172_svrash_ambienceSynesthesia_4', 'light_02', {}, {'meshRotation': -1}, 'the mesh case with 3D rotation, the other z sign'),
    ('char_003_kalts_sale_14', 'bird_line_02', {}, {}, 'mesh view alignment, Disturb(CustomData)'),
]
SAMPLES = (24, 60, 105)
MAX_VERTICES = 2400  # per sample in the fixture: a busy system's first particles in draw order (all are expanded)


def g9(x: float) -> float:
    return float(f'{x:.9g}')


def mat_vec(m, v):
    return (m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2])


def mat_mul(a, b):
    return [sum(a[r * 3 + k] * b[k * 3 + c] for k in range(3)) for r in range(3) for c in range(3)]


def euler(x: float, y: float, z: float) -> list:
    """Quaternion.Euler's rotation as a matrix: about Z, then X, then Y (Ry Rx Rz), radians."""
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1]
    rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx]
    ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy]
    return mat_mul(ry, mat_mul(rx, rz))


def look_rotation(f):
    """Unity's LookRotation(forward, up = Y): columns right, up', forward; None for a forward too short."""
    n = math.sqrt(sum(c * c for c in f))
    if n < 1e-9:
        return None
    z = [c / n for c in f]
    right = [z[2], 0.0, -z[0]]  # up x forward
    rn = math.sqrt(sum(c * c for c in right))
    right = [1.0, 0.0, 0.0] if rn < 1e-9 else [c / rn for c in right]
    up = [z[1] * right[2] - z[2] * right[1], z[2] * right[0] - z[0] * right[2], z[0] * right[1] - z[1] * right[0]]
    return [right[0], up[0], z[0], right[1], up[1], z[1], right[2], up[2], z[2]]


def axes_of(m):
    """The emitter matrix's 3x3 with each column normalized (its rotation, a mirrored axis keeping its sign)."""
    out = [0.0] * 9
    for c in range(3):
        col = (m[c], m[4 + c], m[8 + c])
        n = math.sqrt(sum(x * x for x in col))
        for r in range(3):
            out[r * 3 + c] = col[r] / n if n > 1e-12 else (1.0 if r == c else 0.0)
    return out


def frame_rect(tiles, index):
    tx, ty = max(1, tiles[0]), max(1, tiles[1])
    col, row = index % tx, index // tx
    v1 = 1 - row / ty
    return (col / tx, v1 - 1 / ty, (col + 1) / tx, v1)


def next_frame(sheet: dict, index: int) -> int:
    tx, ty = max(1, sheet['tiles'][0]), max(1, sheet['tiles'][1])
    if sheet.get('animation') == 'singleRow':
        row = index // tx
        return row * tx + (index - row * tx + 1) % tx
    return (index + 1) % (tx * ty)


def expand(oracle, sim, system: dict, doc: dict, conv: dict):
    """Every live particle of `sim`, expanded in draw order: (vertices, indices); a vertex is
    [x, y, u, v, r, g, b, a] plus the 8 custom inputs when the material has them."""
    f32 = oracle.f32  # every non-integer in the file is a float32 (the site reads each back to one)
    render = system['render']
    mode, align, sort = render['mode'], render.get('align', 'view'), render.get('sort', 'none')
    pivot = [f32(x) for x in render.get('pivot', [0, 0, 0])]
    unit = doc['unit']
    m = [f32(x) for x in system['emitter']['matrix']]
    scale = [abs(f32(x)) for x in system['emitter']['scale']]
    local = system['clock'].get('space', 'local') == 'local'
    material = doc['materials'][system['material']]
    inputs = material['custom']['inputs'] if material.get('custom') else None
    sheet = system.get('sheet')
    cap = f32(render.get('maxSize', 0.5)) * doc['camera']['height'] * unit
    floor = f32(render.get('minSize', 0)) * doc['camera']['height'] * unit
    length_scale, velocity_scale = f32(render.get('lengthScale', 2)), f32(render.get('velocityScale', 0))
    axes = axes_of(m)
    ps = sim.particles
    roots = []
    for p in ps:
        x, y, z = p.position
        roots.append((m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]) if local else (x, y, z))
    order = list(range(len(ps)))
    if sort == 'oldestInFront':
        order.reverse()
    elif sort in ('distance', 'depth'):
        order.sort(key=lambda i: (-roots[i][2], i))
    vertices, indices = [], []
    ps_sign = conv['pivot']

    def to_root_vector(v):
        return (m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[4] * v[0] + m[5] * v[1] + m[6] * v[2], m[8] * v[0] + m[9] * v[1] + m[10] * v[2]) if local else tuple(v)

    for i in order:
        p = ps[i]
        cx, cy, cz = roots[i]
        size = sim.size_of(p)
        sx, sy, sz = size[0] * scale[0], size[1] * scale[1], size[2] * scale[2]
        if mode == 'billboard':
            big = max(abs(sx), abs(sy))
            if big > cap and big > 0:
                k = cap / big
                sx, sy, sz = sx * k, sy * k, sz * k
            small = min(abs(sx), abs(sy))
            if small < floor and small > 0:
                k = floor / small
                sx, sy, sz = sx * k, sy * k, sz * k
        color = sim.color_of(p)
        frame = sim.frame_of(p)
        rect = frame[1] if frame else (0.0, 0.0, 1.0, 1.0)
        rect2 = frame_rect(sheet['tiles'], next_frame(sheet, frame[0])) if (sheet and frame) else rect
        c1, c2 = sim.custom_data_of(p)
        velocity = to_root_vector(oracle.v_add(p.velocity, p.animated))
        rx, ry, rz = p.rotation

        def vertex(x, y, cu, cv, col):
            u = rect[0] + cu * (rect[2] - rect[0])
            v = rect[1] + cv * (rect[3] - rect[1])
            out = [x / unit, y / unit, u, v, *col]
            if inputs is not None:
                for source in inputs:
                    if source == 0:
                        out.append(0.0)
                    elif source.startswith('uv2'):
                        out.append(rect2[0] + cu * (rect2[2] - rect2[0]) if source.endswith('x') else rect2[1] + cv * (rect2[3] - rect2[1]))
                    elif source.startswith('uv'):
                        out.append(u if source.endswith('x') else v)
                    else:
                        out.append((c1 if source[1] == '1' else c2)['xyzw'.index(source[3])])
            vertices.append(out)

        if mode == 'mesh':
            meshes = render['meshes']
            mesh = doc['meshes'][meshes[p.seed % len(meshes) if len(meshes) > 1 else 0]]
            turn = euler(rx, ry, conv['meshRotation'] * rz) if 'rotationXYZ' in system['start'] else euler(0, 0, conv['meshRotation'] * rz)
            if align == 'local':
                frame3 = mat_mul(axes, turn)
            elif align == 'velocity' and look_rotation(velocity):
                frame3 = mat_mul(look_rotation(velocity), turn)
            else:
                frame3 = turn
            if mesh.get('builtin') == 'quad':
                verts = [(*c, 0.0) for c in CORNERS]
                uvs, colors, tris = CORNER_UV, None, QUAD_TRIANGLES
            else:
                verts = [tuple(f32(x) for x in mesh['vertices'][k * 3:k * 3 + 3]) for k in range(len(mesh['vertices']) // 3)]
                uvs = [tuple(f32(x) for x in mesh['uvs'][k * 2:k * 2 + 2]) for k in range(len(verts))]
                colors, tris = mesh.get('colors') and [f32(x) for x in mesh['colors']], mesh['triangles']
            base = len(vertices)
            for k, vert in enumerate(verts):
                local_v = ((vert[0] + ps_sign * pivot[0]) * sx, (vert[1] + ps_sign * pivot[1]) * sy, (vert[2] + ps_sign * pivot[2]) * sz)
                off = mat_vec(frame3, local_v)
                col = list(color) if colors is None else [color[j] * colors[k * 4 + j] for j in range(4)]
                vertex(cx + off[0], cy + off[1], uvs[k][0], uvs[k][1], col)
            indices += [base + t for t in tris]
            continue
        if mode == 'stretched':
            speed = math.sqrt(sum(c * c for c in velocity))
            settled = (conv['stretchAxis'], conv['stretchSense'], conv['stretchAnchor'], conv['stretchPivotAlong'], ps_sign) == ('u', -1, 'centre', 'y', 1)
            if settled:
                # The oracle's own helper.
                for k, corner in enumerate(oracle.stretched_corners((cx, cy, cz), (sx, sy, sz), velocity, length_scale, velocity_scale, pivot)):
                    vertex(corner[0], corner[1], *CORNER_UV[k], color)
                continue
            flat = math.hypot(velocity[0], velocity[1])
            dx, dy = (velocity[0] / flat, velocity[1] / flat) if flat > 1e-6 else (0.0, 1.0)
            length = sy * length_scale + speed * velocity_scale
            width = sx
            head = -0.5 * length if conv['stretchAnchor'] == 'head' else 0.0
            p_along, p_across = (pivot[0], pivot[1]) if conv['stretchPivotAlong'] == 'x' else (pivot[1], pivot[0])
            ex, ey = dx * conv['stretchSense'], dy * conv['stretchSense']
            for k, (kx, ky) in enumerate(CORNERS):
                if conv['stretchAxis'] == 'u':
                    along, across, nx, ny = (kx + ps_sign * p_along) * length, (ky + ps_sign * p_across) * width, -ey, ex
                else:
                    along, across, nx, ny = (ky + ps_sign * p_along) * length, (kx + ps_sign * p_across) * width, ey, -ex
                vertex(cx + ex * along + dx * head + nx * across, cy + ey * along + dy * head + ny * across, *CORNER_UV[k], color)
            continue
        # Billboards.
        z_turn = conv['billboardRotation'] * rz
        rotation3d = 'rotationXYZ' in system['start']
        frame3 = None
        if align == 'local':
            frame3 = axes
        elif align == 'velocity':
            frame3 = look_rotation(velocity)
        if not rotation3d and frame3 is None and conv['billboardRotation'] == -1 and ps_sign == 1:
            # The oracle's own helper for a View billboard.
            for k, corner in enumerate(oracle.billboard_corners((cx, cy, cz), (sx, sy), rz, pivot)):
                vertex(corner[0], corner[1], *CORNER_UV[k], color)
            continue
        if rotation3d:
            turn = euler(rx, ry, z_turn)
            frame3 = mat_mul(frame3, turn) if frame3 else turn
        cos, sin = math.cos(z_turn), math.sin(z_turn)
        for k, (kx, ky) in enumerate(CORNERS):
            lx, ly = (kx + ps_sign * pivot[0]) * sx, (ky + ps_sign * pivot[1]) * sy
            if rotation3d:
                off = mat_vec(frame3, (lx, ly, 0.0))
            else:
                tx, ty = lx * cos - ly * sin, lx * sin + ly * cos
                off = mat_vec(frame3, (tx, ty, 0.0)) if frame3 else (tx, ty, 0.0)
            vertex(cx + off[0], cy + off[1], *CORNER_UV[k], color)
    return vertices, indices


def set_member(record: dict, path: str, value) -> None:
    keys = path.split('.')
    for key in keys[:-1]:
        record = record[key]
    record[keys[-1]] = value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--oracle', required=True, help='the assets repository scripts/tests folder (particle_oracle.py)')
    parser.add_argument('--exports', required=True, help='a folder with models/<slug>/<md5>/layerParticles.json and layers.json')
    parser.add_argument('--out', required=True, help='the fixture to write (.json.gz)')
    args = parser.parse_args()
    sys.path.insert(0, str(Path(args.oracle).resolve()))
    import particle_oracle as oracle  # noqa: E402

    fixture = {'generator': 'scripts/particles/make-vertex-golden.py', 'modelSeed': MODEL_SEED, 'step': STEP, 'conventions': CONVENTIONS,
               'samples': list(SAMPLES), 'models': {}, 'cases': []}
    for slug, name, changes, conv_changes, covers in CASES:
        path = next(Path(args.exports).glob(f'models/{slug}/*/layerParticles.json'))
        doc = json.loads(path.read_text())
        layers = json.loads((path.parent / 'layers.json').read_text())
        first = len(layers['textures']) + len(layers.get('effectTextures', []))
        index = name if isinstance(name, int) else next(i for i, s in enumerate(doc['systems'])
                                                         if s['name'].split('/')[-1] == name and 'matrix' in s['emitter'] and not s.get('requires') and s.get('render'))
        system = copy.deepcopy(doc['systems'][index])
        for member, value in changes.items():
            set_member(system, member, value)
        conv = {**CONVENTIONS, **conv_changes}
        seed = oracle.play_seed(MODEL_SEED, index, 1)
        pose = oracle.Pose.from_export(system['emitter'])
        sim = oracle.Simulation.from_export(system, doc, seed=seed)
        sim.play(pose)
        samples = {}
        for step in range(1, max(SAMPLES) + 1):
            sim.step(STEP, pose)
            if step in SAMPLES:
                vertices, indices = expand(oracle, sim, system, doc, conv)
                per = 4 if system['render']['mode'] != 'mesh' else None
                kept = vertices if len(vertices) <= MAX_VERTICES else vertices[:MAX_VERTICES - (MAX_VERTICES % per if per else 0)]
                samples[str(step)] = {'particles': len(sim.particles), 'vertices': len(vertices), 'indices': len(indices),
                                      'data': [[g9(x) for x in v] for v in kept], 'firstIndices': indices[:3 * 400]}
        if not any(s['particles'] for s in samples.values()):
            sys.exit(f'{slug} {name}: no particle alive at any sample step; pick another system')
        # A pruned document: this system (as changed), its material and meshes renumbered.
        model = fixture['models'].setdefault(slug, {'first': first, 'doc': {**{k: doc[k] for k in ('version', 'unit', 'camera', 'controller', 'textures')},
                                                                              'materials': [], 'meshes': [], 'systems': []}})
        pruned = model['doc']
        record = copy.deepcopy(system)
        pruned['materials'].append(doc['materials'][record['material']])
        record['material'] = len(pruned['materials']) - 1
        if 'meshes' in record['render']:
            ids = []
            for mesh in record['render']['meshes']:
                pruned['meshes'].append(doc['meshes'][mesh])
                ids.append(len(pruned['meshes']) - 1)
            record['render']['meshes'] = ids
        pruned['systems'].append(record)
        fixture['cases'].append({'model': slug, 'name': system['name'], 'index': index, 'system': len(pruned['systems']) - 1, 'seed': seed,
                                 'changes': changes, 'conventions': conv, 'covers': covers, 'samples': samples})
        print(f'{slug} {name}: ' + ', '.join(f'step {k} {v["particles"]} particles {v["vertices"]} vertices' for k, v in samples.items()), flush=True)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, 'wb') as raw, gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0) as fh:
        fh.write(json.dumps(fixture, separators=(',', ':')).encode())
    print(json.dumps({'cases': len(fixture['cases']), 'bytes': Path(args.out).stat().st_size}))


if __name__ == '__main__':
    main()
