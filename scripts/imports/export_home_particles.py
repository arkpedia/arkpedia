"""Export active Unity home-background particle systems for the shared WebGL player.

Reads unpacked client bundles. The room's serialized external file references
resolve materials, textures and shaders by CAB name across the supplied bundles.
Unity's particle simulation is sampled once into deterministic tracks for the web.
"""
import argparse
from collections import Counter
from hashlib import md5
from pathlib import Path
import json
import math
import random

from PIL import Image
from UnityPy.helpers.MeshHelper import MeshHandler

from client_bundles import load
from export_persona_home import add, cross, multiply, rotate, vec
from export_home_preview import curve_value
from export_persona_room import web_shader


def lerp(a, b, t):
    return a + (b - a) * t


def curve(data, t, variation):
    mode = data['minMaxState']

    def sample(key):
        keys = data[key]['m_Curve']
        return curve_value(keys, t) if keys else 1

    maximum = data['scalar']
    if mode == 1:
        return maximum * sample('maxCurve')
    if mode == 2:
        return lerp(data['minScalar'] * sample('minCurve'), maximum * sample('maxCurve'), variation)
    return lerp(data['minScalar'], maximum, variation) if mode == 3 else maximum


def gradient(data, t, variation):
    def channel(table, name):
        alpha = name == 'a'
        prefix = 'a' if alpha else 'c'
        count = table['m_NumAlphaKeys' if alpha else 'm_NumColorKeys']
        keys = [(table[f'{prefix}time{i}'] / 65535, table[f'key{i}'][name]) for i in range(count)]
        for (begin, first), (end, last) in zip(keys, keys[1:]):
            if t <= begin:
                return first
            if t <= end:
                return last if table['m_Mode'] == 1 else lerp(first, last, (t - begin) / (end - begin))
        return keys[-1][1] if keys else 1

    mode = data['minMaxState']
    if mode == 0:
        return vec(data['maxColor'], 'rgba')
    if mode == 2:
        return tuple(lerp(data['minColor'][c], data['maxColor'][c], variation) for c in 'rgba')
    if mode == 3:
        return tuple(lerp(channel(data['minGradient'], c), channel(data['maxGradient'], c), variation) for c in 'rgba')
    if mode == 4:
        t = variation
    return tuple(channel(data['maxGradient'], c) for c in 'rgba')


def quaternion_product(a, b):
    perpendicular = cross(a[:3], b[:3])
    return (*(a[3] * b[i] + b[3] * a[i] + perpendicular[i] for i in range(3)),
            a[3] * b[3] - sum(a[i] * b[i] for i in range(3)))


def shape_spawn(shape, rng):
    if not shape['enabled']:
        return (0, 0, 0), (0, 0, 1)
    theta = rng.uniform(0, math.radians(shape['arc']['value']))
    x, y = math.cos(theta), math.sin(theta)
    radius = max(0, shape['radius']['value'])
    distance = radius * math.sqrt(rng.uniform(max(0, 1 - shape['radiusThickness']), 1))
    kind = shape['type']
    direction = (0, 0, 1)
    if kind in (0, 1, 2, 3, 8, 9):
        z = rng.uniform(0 if kind in (2, 3) else -1, 1)
        xy = math.sqrt(1 - z * z)
        direction = (x * xy, y * xy, z)
        offset = tuple(component * distance for component in direction)
    elif kind in (4, 7, 10, 11):
        angle = math.radians(shape['angle'])
        direction = (x * math.sin(angle), y * math.sin(angle), math.cos(angle))
        offset = (x * distance, y * distance, 0)
    elif kind in (5, 15, 16, 17):
        offset = tuple(rng.uniform(-.5, .5) for _ in range(3))
    else:
        offset = (x * distance, y * distance, 0)
    rotation = (0, 0, 0, 1)
    for i, angle in enumerate(vec(shape['m_Rotation'])):
        axis = [0, 0, 0]
        axis[i] = math.sin(math.radians(angle) / 2)
        rotation = quaternion_product((*axis, math.cos(math.radians(angle) / 2)), rotation)
    return add(vec(shape['m_Position']), rotate(rotation, multiply(offset, vec(shape['m_Scale'])))), rotate(rotation, direction)


def event_times(data, rng):
    emission = data['EmissionModule']
    length = data['lengthInSec']
    for burst in emission['m_Bursts']:
        for cycle in range(max(1, burst['cycleCount'])):
            start = burst['time'] + cycle * burst['repeatInterval']
            if start < length and rng.random() <= burst['probability']:
                yield from [start] * max(0, round(curve(burst['countCurve'], start / length, rng.random())))
    rate = curve(emission['rateOverTime'], 0, rng.random())
    for i in range(math.ceil(rate * length)):
        yield i / rate


def default_node(name, size, image):
    return dict(name=name, parent=None, active=True, alpha=1, position=[0, 0], z=0,
                size=list(size), pivot=[.5, .5], anchorMin=[.5, .5], anchorMax=[.5, .5],
                scale=[1, 1, 1], rotation=[0, 0, 0, 1], image=image)


def sprite(texture, width, height, material=None):
    return dict(texture=texture, material=material, rect=dict(x=0, y=0, width=width, height=height),
                offset=dict(x=0, y=0), spriteSize=[width, height], border=[0, 0, 0, 0],
                color=[1, 1, 1, 1], type=0, preserveAspect=False, fill=1, fillMethod=0, clockwise=True, origin=0)


class Room:
    def __init__(self, room_path, dependencies, output):
        self.output = output
        self.files = {}
        self.sources = {}
        self.room = self.read(room_path)
        for path in dependencies:
            self.read(path)
        with Image.open(output / 'background.webp') as image:
            self.width, self.height = image.size
        self.textures = [dict(file='background.webp', width=self.width, height=self.height, wrapU=1, wrapV=1)]
        self.shaders = []
        self.materials = []
        self.texture_ids = {}
        self.material_ids = {}
        self.shader_ids = {}
        self.report = Counter()
        self.used = {room_path.name}

    def read(self, path):
        raw = path.read_bytes()
        objects = list(load(raw).objects)
        for obj in objects:
            cab = obj.assets_file.name.lower()
            self.files.setdefault(cab, {})[obj.path_id] = obj
            self.sources[cab] = (path.name, md5(raw).hexdigest()) if cab not in self.sources else self.sources[cab]
        return self.files[objects[0].assets_file.name.lower()]

    def resolve(self, owner, ref):
        if not ref['m_PathID']:
            return None
        file_id = ref['m_FileID']
        file = owner.assets_file
        cab = (file.externals[file_id - 1].name if file_id else file.name).lower()
        obj = self.files.get(cab, {}).get(ref['m_PathID'])
        if obj:
            self.used.add(self.sources[cab][0])
        return obj

    def texture(self, obj):
        if not obj:
            return None
        if id(obj) not in self.texture_ids:
            data = obj.read()
            name = f'particle-{len(self.textures)}.webp'
            data.image.save(self.output / name, 'WEBP', lossless=True)
            self.texture_ids[id(obj)] = len(self.textures)
            self.textures.append(dict(file=name, width=data.m_Width, height=data.m_Height,
                                      wrapU=data.m_TextureSettings.m_WrapU, wrapV=data.m_TextureSettings.m_WrapV))
        return self.texture_ids[id(obj)]

    def material(self, obj):
        if id(obj) not in self.material_ids:
            data = obj.read_typetree()
            shader = self.resolve(obj, data['m_Shader'])
            if not shader:
                raise ValueError(f"No shader for {data['m_Name']}")
            keywords = tuple(data['m_ValidKeywords'])
            shader_key = (id(shader), keywords)
            if shader_key not in self.shader_ids:
                self.shader_ids[shader_key] = len(self.shaders)
                self.shaders.append(web_shader(shader, list(keywords)))
            saved = data['m_SavedProperties']
            values = dict(saved['m_Floats'])
            values.update({name: vec(color, 'rgba') for name, color in saved['m_Colors']})
            textures = {}
            for name, tex in saved['m_TexEnvs']:
                textures[name] = self.texture(self.resolve(obj, tex['m_Texture']))
                values[name + '_ST'] = (*vec(tex['m_Scale'], 'xy'), *vec(tex['m_Offset'], 'xy'))
            self.material_ids[id(obj)] = len(self.materials)
            self.materials.append(dict(name=data['m_Name'], shader=self.shader_ids[shader_key], values=values, textures=textures))
        return self.material_ids[id(obj)]

    def emitters(self):
        transforms = {obj.path_id: obj.read_typetree() for obj in self.room.values()
                      if obj.type.name in ('Transform', 'RectTransform')}

        def visit(item, origin, basis, scale, delay, path):
            game_object = self.room[item['m_GameObject']['m_PathID']].read_typetree()
            if not game_object['m_IsActive']:
                return
            path = (*path, game_object['m_Name'])
            parts = [self.room[c['component']['m_PathID']] for c in game_object['m_Component']]
            by_type = {part.type.name: part for part in parts}
            origin = add(origin, rotate(basis, multiply(scale, vec(item['m_LocalPosition']))))
            basis = quaternion_product(basis, vec(item['m_LocalRotation'], 'xyzw'))
            local_scale = vec(item['m_LocalScale'])
            scale = multiply(scale, local_scale)
            for part in parts:
                if part.type.name == 'MonoBehaviour':
                    props = part.read_typetree()
                    if props.get('m_Enabled'):
                        delay += props.get('_delayTime', 0)
            if 'ParticleSystem' in by_type and 'ParticleSystemRenderer' in by_type:
                yield by_type['ParticleSystem'], by_type['ParticleSystemRenderer'], origin, basis, scale, local_scale, delay, '/'.join(path)
            for child in item['m_Children']:
                yield from visit(transforms[child['m_PathID']], origin, basis, scale, delay, path)

        for item in transforms.values():
            if not item['m_Father']['m_PathID']:
                yield from visit(item, (0, 0, 0), (0, 0, 0, 1), (1, 1, 1), 0, [])

    def export(self, background, viewport_width, room_scaled):
        zoom = self.width / viewport_width
        base = default_node(background, [self.width, self.height], sprite(0, self.width, self.height))
        nodes = [base]
        for obj, renderer_obj, origin, basis, scale, local_scale, delay, name in self.emitters():
            data = obj.read_typetree()
            if not data['EmissionModule']['enabled']:
                continue
            renderer = renderer_obj.read_typetree()
            if not renderer['m_Enabled'] or not renderer['m_Materials']:
                continue
            rng = random.Random(data['randomSeed'] or name)
            times = sorted(event_times(data, rng))
            if not times:
                continue
            mat_obj = self.resolve(renderer_obj, renderer['m_Materials'][0])
            try:
                material = self.material(mat_obj) if mat_obj else None
            except (ValueError, StopIteration) as error:
                self.report[f'{name}: {error or "shader variant unavailable"}'] += 1
                continue
            texture = self.materials[material]['textures'].get('_MainTex') if material is not None else None
            if texture is None:
                self.report[f'{name}: missing main texture'] += 1
                continue
            tex = self.textures[texture]
            art = sprite(texture, tex['width'], tex['height'], material)
            node = default_node(name, [1, 1], art)
            if renderer['m_RenderMode'] == 4:
                mesh_obj = self.resolve(renderer_obj, renderer['m_Mesh'])
                if not mesh_obj:
                    self.report[f'{name}: missing particle mesh bundle'] += 1
                    continue
                mesh = MeshHandler(mesh_obj.read())
                mesh.process()
                node['mesh'] = [round(value, 6) for i in mesh.m_IndexBuffer
                                for value in (*mesh.m_Vertices[i], *mesh.m_UV0[i][:2])]
                node['rotation'] = basis
            tiles = data['UVModule']
            if tiles['enabled'] and tiles['mode'] == 0:
                node['particleTiles'] = [max(1, tiles['tilesX']), max(1, tiles['tilesY'])]
            size_scale = {0: scale, 1: local_scale, 2: (1, 1, 1)}[data['scalingMode']]
            if name.rsplit('/', 1)[-1] in room_scaled:
                size_scale = scale
            tracks = tracks_for(data, times, rng, origin, basis, scale, size_scale, zoom, delay)
            node['particleTracks'] = tracks
            nodes.append(node)
            self.report['emitters'] += 1
            self.report['particles'] += len(tracks)

        return dict(schemaVersion=1, width=self.width, height=self.height, duration=1, clip=background,
                    continuous=True, nodes=nodes, textures=self.textures, shaders=self.shaders,
                    materials=self.materials, curves=[], sources=dict(self.sources[cab] for cab in self.sources
                                                                    if self.sources[cab][0] in self.used))


def tracks_for(data, times, rng, origin, basis, shape_scale, size_scale, zoom, delay):
    initial = data['InitialModule']
    velocity = data['VelocityModule']
    clamp = data['ClampVelocityModule']
    size = data['SizeModule']
    color = data['ColorModule']
    uv = data['UVModule']
    trails = data['TrailModule']
    duration = data['lengthInSec']
    speed = data['simulationSpeed'] or 1
    # Keep overlapping generations when a particle lives longer than the emitter's period.
    life_limit = max(initial['startLifetime']['scalar'], initial['startLifetime']['minScalar'])
    cycles = max(1, math.ceil(life_limit / duration)) if data['looping'] else 1
    period = cycles * duration / speed if data['looping'] else 0
    prewarm = (duration / speed) if data['prewarm'] and data['looping'] else 0
    start_delay = curve(data['startDelay'], 0, rng.random()) / speed
    tracks = []

    for cycle in range(cycles):
        for start in times:
            variation = rng.random()
            get = lambda value, t=0: curve(value, t, variation)
            t0 = start / duration
            life = get(initial['startLifetime'], t0)
            if life <= 0:
                continue
            start_speed = get(initial['startSpeed'], t0)
            start_size = get(initial['startSize'], t0)
            angle = get(initial['startRotation'], t0)
            spin = data['RotationModule']
            axis = max(abs(size_scale[0]), abs(size_scale[1]))
            offset, direction = shape_spawn(data['ShapeModule'], rng)
            position = add(origin, rotate(basis, multiply(shape_scale, offset)))
            direction = rotate(basis, direction)
            gravity = get(initial['gravityModifier'], t0) * 9.81
            motion = [x * start_speed for x in direction]
            tint = gradient(initial['startColor'], t0, variation)
            steps = max(2, min(16, math.ceil(life * 8)))
            step = life / (steps - 1)
            frames = []

            for i in range(steps):
                t = i / (steps - 1)
                shade = multiply(tint, gradient(color['gradient'], t, variation)) if color['enabled'] else tint
                radius = start_size * get(size['curve'], t) if size['enabled'] else start_size
                angle += get(spin['curve'], t) * step if spin['enabled'] and i else 0
                tile = get(uv['startFrame']) + get(uv['frameOverTime'], t) * uv['cycles'] if uv['enabled'] else 0
                frames.append([position[0] * zoom, position[1] * zoom, radius * axis * zoom, angle, *shade, tile])
                if velocity['enabled']:
                    extra = tuple(get(velocity[c], t) for c in 'xyz')
                    if not velocity['inWorldSpace']:
                        extra = rotate(basis, extra)
                    extra = tuple(c * get(velocity['speedModifier'], t) for c in extra)
                else:
                    extra = (0, 0, 0)
                if clamp['enabled']:
                    magnitude = math.hypot(*motion)
                    limit = get(clamp['magnitude'], t)
                    if magnitude > limit >= 0 and not clamp['separateAxis']:
                        dampen = 1 - clamp['dampen']
                        motion = [c * lerp(limit / magnitude, 1, dampen ** (step * 60)) for c in motion]
                    drag = max(0, get(clamp['drag'], t))
                    motion = [c * math.exp(-drag * step) for c in motion]
                motion[1] -= gravity * step
                position = add(position, multiply(add(motion, extra), tuple(s * step for s in size_scale)))

            birth = delay + start_delay + (start + cycle * duration) / speed - prewarm
            add_track(tracks, birth, life / speed, period, frames)
            if trails['enabled'] and rng.random() < trails['ratio'] and math.dist(frames[0][:2], frames[-1][:2]) > 3:
                tail = min(get(trails['lifetime']), life) / speed
                for segment in range(1, 5):
                    fraction = segment / 5
                    width = max(0, get(trails['widthOverTrail'], fraction))
                    tint = gradient(trails['colorOverTrail'], fraction, variation)
                    ghost = [[x, y, radius * width, angle, *multiply((r, g, b, a), tint[:3] + (tint[3] * (1 - fraction),)), tile]
                             for x, y, radius, angle, r, g, b, a, tile in frames]
                    add_track(tracks, birth + tail * fraction, life / speed, period, ghost)
    return tracks


def add_track(tracks, start, life, period, frames):
    tracks.append([round(start, 4), round(life, 4), round(period, 4),
                   [round(v, 4) for frame in frames for v in frame]])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundle', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--dependencies', type=Path, nargs='*', default=[])
    parser.add_argument('--viewport-width', type=float, default=2732)
    parser.add_argument('--room-scale-emitter', action='append', default=[],
                        help='Project a named emitter with the room hierarchy scale.')
    args = parser.parse_args()
    room = Room(args.bundle, sorted(set(args.dependencies)), args.output)
    scene = room.export(args.bundle.stem, args.viewport_width, set(args.room_scale_emitter))
    if not room.report['emitters']:
        parser.exit(1, f'No active particle effects exported: {room.report}\n')
    print(args.bundle.stem, dict(room.report))
    (args.output / 'scene.json').write_text(json.dumps(scene, separators=(',', ':'), allow_nan=False) + '\n')


if __name__ == '__main__':
    main()
