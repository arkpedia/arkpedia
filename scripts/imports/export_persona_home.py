"""Build the Persona home screen's browser layout from the original CN Unity bundles.

The prefab geometry is in ui/pages/home_page; the theme JSON in hometheme/common replaces
its named slots with prefabs from tm_p3r_1. Project each visible layer through its native
camera at the game's 1280×720 reference resolution. The shop effect also uses the original
shader and effects texture bundles. See BUNDLES and SHOP_DEPENDENCIES for the inputs.
"""
import argparse
from dataclasses import dataclass, replace
from functools import lru_cache
import hashlib
import json
import math
from pathlib import Path
from random import Random

from PIL import Image

from client_bundles import load
from export_persona_room import web_shader

WIDTH, HEIGHT = 1280, 720
ORIGIN = (0, 0, 0)
IDENTITY = (0, 0, 0, 1)
BUNDLES = {
    'home_page': ('ui/pages/home_page.ab', '762e8706d0bddcf7152ffb7d651c849e'),
    'common': ('arts/ui/hometheme/common.ab', '8d18655337ce787c3e1d484e985e71d2'),
    'tm_p3r_1': ('arts/ui/hometheme/[uc]tm_p3r_1.ab', 'a852d668d98012d9ed00fad5d73b49a9'),
    'ui_home_act_banner_shop_h2_0': ('spritepack/ui_home_act_banner_shop_h2_0.ab', '4768bc47f1fe1c07f2e5ee717f654020'),
}


def vec(value, axes='xyz'):
    return tuple(value[axis] for axis in axes)


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def multiply(a, b):
    return tuple(x * y for x, y in zip(a, b))


def cross(a, b):
    x, y, z = a
    i, j, k = b
    return y*k-z*j, z*i-x*k, x*j-y*i


def rotate(q, point):
    axis, w = q[:3], q[3]
    perpendicular = cross(axis, point)
    return add(point, tuple(2*(w*a+b) for a, b in zip(perpendicular, cross(axis, perpendicular))))


@dataclass(frozen=True)
class Rect:
    parent: 'Rect | None' = None
    center: tuple = ORIGIN
    size: tuple = (WIDTH, HEIGHT)
    pivot: tuple = (.5, .5)
    scale: tuple = (1, 1, 1)
    rotation: tuple = IDENTITY

    def point(self, point):
        local = add(self.center, rotate(self.rotation, multiply(self.scale, point)))
        return self.parent.point(local) if self.parent else local

    def top_left(self, x, y):
        width, height = self.size
        px, py = self.pivot
        return self.point((x - width*px, height*(1-py) - y, 0))


class Bundle:
    def __init__(self, directory, key):
        raw = (directory / f'{key}.ab').read_bytes()
        if hashlib.md5(raw).hexdigest() != BUNDLES[key][1]:
            raise ValueError(f'Bundle checksum mismatch for {key}')
        self.objects = {obj.path_id: obj for obj in load(raw).objects}
        self.sprites = {obj.peek_name(): obj for obj in self.objects.values() if obj.type.name == 'Sprite'}
        self.transforms = {}
        for obj in self.objects.values():
            if obj.type.name not in ('RectTransform', 'Transform'):
                continue
            node = self.tree(obj.path_id)
            name = self.tree(node['m_GameObject']['m_PathID'])['m_Name']
            self.transforms.setdefault(name, []).append(obj.path_id)

    @lru_cache
    def tree(self, path_id):
        return self.objects[path_id].read_typetree()

    def components(self, node):
        return (self.objects[row['component']['m_PathID']] for row in
                self.tree(self.tree(node)['m_GameObject']['m_PathID'])['m_Component'])

    def path(self, node):
        data = self.tree(node)
        parent = data['m_Father']['m_PathID']
        name = self.tree(data['m_GameObject']['m_PathID'])['m_Name']
        return self.path(parent) + '/' + name if parent else name

    def node(self, name, parent=None):
        nodes = self.transforms[name]
        return next(node for node in nodes if not parent or parent in self.path(node))

    def rect(self, node, parent, override=None):
        t = self.tree(node)
        pos, scl = vec(t['m_LocalPosition']), vec(t['m_LocalScale'])
        rot = vec(t['m_LocalRotation'], 'xyzw')
        pivot = vec(t['m_Pivot'], 'xy')
        lo, hi = (vec(t[key], 'xy') for key in ('m_AnchorMin', 'm_AnchorMax'))
        size = vec(t['m_SizeDelta'], 'xy')
        xy = vec(t['m_AnchoredPosition'], 'xy')
        if override:
            xy = vec(override.get('pos', t['m_AnchoredPosition']), 'xy')
            size = vec(override.get('size', t['m_SizeDelta']), 'xy')
        if parent:
            for i in range(2):
                # Interpolate the anchor origin at the child pivot, just as Unity does.
                anchor = lo[i] + (hi[i]-lo[i])*pivot[i] - parent.pivot[i]
                xy = tuple(value + (anchor*parent.size[i] if k == i else 0) for k, value in enumerate(xy))
            size = tuple(delta + (high-low)*p for delta, low, high, p in zip(size, lo, hi, parent.size))
        return Rect(parent, (*xy, pos[2]), size, pivot, scl, rot)

    def asset_json(self, name):
        obj = next(o for o in self.objects.values() if o.type.name == 'TextAsset' and o.peek_name() == name)
        return json.loads(obj.read().m_Script)


def camera_motion(base, side):
    camera = base.node(side + '_camera')
    node = base.tree(camera)
    position = vec(node['m_LocalPosition'])
    rotation = vec(node['m_LocalRotation'], 'xyzw')
    inverse = tuple(-x for x in rotation[:3]) + rotation[3:]
    offset = tuple(-v for v in position)
    camera_data = next(obj.read_typetree() for obj in base.components(camera) if obj.type.name == 'Camera')
    focal = HEIGHT / (2*math.tan(math.radians(camera_data['field of view'])/2))

    def project(point):
        x, y, depth = rotate(inverse, add(point, offset))
        return WIDTH/2*depth + focal*x, HEIGHT/2*depth - focal*y, depth

    controls = next(data for component in base.components(base.node(side + '_ctrl'))
                    if component.type.name == 'MonoBehaviour'
                    and 'cameraOffset' in (data := component.read_typetree()))
    aim = vec(base.tree(controls['cameraAim']['m_PathID'])['m_LocalPosition'])

    def aim_angles(vector):
        x, y, z = rotate(inverse, vector)
        return math.atan2(x, z), math.atan2(y, math.hypot(x, z))

    original = add(aim, tuple(-v for v in position))
    yaw, pitch = aim_angles(original)

    def plane(project_point):
        u, v, w = project_point(ORIGIN)
        x, y = (tuple(a-b for a, b in zip(project_point(axis), (u, v, w)))
                for axis in ((1, 0, 0), (0, 1, 0)))
        return [*x[:2], 0, x[2], *y[:2], 0, y[2], 0, 0, 1, 0, u, v, 0, w]

    def moved(axis, direction):
        channel = 'xy'[axis]
        # The preview's normalized mouse range already reaches the camera's full attitude.
        amount = direction * controls['maxAttitude'][channel]
        shift = tuple(amount * controls['cameraOffset'][channel] if i == axis else 0 for i in range(3))
        target = add(add(original, tuple(-v for v in shift)),
                     tuple(amount * controls['aimOffset'][channel] if i == axis else 0 for i in range(3)))
        new_yaw, new_pitch = aim_angles(target)
        sin_y, cos_y = math.sin(new_yaw - yaw), math.cos(new_yaw - yaw)
        sin_p, cos_p = math.sin(new_pitch - pitch), math.cos(new_pitch - pitch)
        offset = tuple(-v for v in add(position, shift))

        def project_moved(point):
            x, y, z = rotate(inverse, add(point, offset))
            x, z = cos_y*x - sin_y*z, sin_y*x + cos_y*z
            y, z = cos_p*y - sin_p*z, sin_p*y + cos_p*z
            return WIDTH/2*z + focal*x, HEIGHT/2*z - focal*y, z

        return plane(project_moved)

    return project, dict(rest=plane(project), left=moved(0, -1), right=moved(0, 1),
                         up=moved(1, 1), down=moved(1, -1), ease=controls['standalone']['speedEase'])


def projection(rect, project):
    # CSS expects a column-major homogeneous matrix. These are the X and Y basis vectors
    # and the origin of the same projected plane, so the transform preserves perspective.
    u, v, depth = project(rect.top_left(0, 0))
    right = project(rect.top_left(1, 0))
    down = project(rect.top_left(0, 1))
    dx = tuple((end-start)/depth for end, start in zip(right, (u, v, depth)))
    dy = tuple((end-start)/depth for end, start in zip(down, (u, v, depth)))
    return [round(value, 7) for value in (
        dx[0], dx[1], 0, dx[2], dy[0], dy[1], 0, dy[2], 0, 0, 1, 0, u/depth, v/depth, 0, 1,
    )]


# The serialized home page uses slightly older slot names than the theme overrides.
PRESETS = [
    ('bkg_shop_recruit', 'panel_shop_recruit_bkg', 'right', None),
    ('btn_battle', 'btn_battle', 'right', 'Terminal'),
    ('btn_squad', 'btn_squad', 'right', 'Squads'),
    ('btn_char_repo', 'btn_character_repo', 'right', 'Operators'),
    ('btn_shop', 'btn_shop', 'right', 'Store'),
    ('btn_recruit_normal', 'btn_normal_recruit', 'right', 'Recruit'),
    ('btn_recruit_advance', 'btn_advanced_recruit', 'right', 'Headhunt'),
    ('btn_mission', 'btn_mission', 'right', 'Missions'),
    ('btn_building', 'btn_building', 'right', 'Base'),
    ('btn_inventory', 'btn_inventory', 'right', 'Inventory'),
    ('btn_friend', 'btn_friend', 'left', 'Friends'),
    ('btn_handbook', 'btn_handbook', 'left', 'Archives'),
]
LABEL_SPRITES = {
    'battle_terminal', 'img_squad', 'operator_bg', 'btn_shop_bg', 'btn_mission_bg',
    'building_bg', 'inventory_bg', 'friend_bg', 'handbook_bg', 'btn_recruit_norma', 'btn_recruit_advance',
}

SHOP_SIZE = (1050, 350)
SHOP_CENTER = (0, -75, 0)
SHOP_DEPENDENCIES = {
    'shaders': '3cfbf32a6575fc0c5dd7d53204f2f30d',
    'fxcommon': '0ee9e1952c4af270d55c7c18b4321577',
}


def particle_tracks(system, seed, units):
    initial = system['InitialModule']
    shape = system['ShapeModule']
    velocity = system['VelocityModule']
    rotation = system['RotationModule']
    noise = system['NoiseModule']
    atlas = system['UVModule']
    gradient = system['ColorModule']['gradient']['maxGradient']
    size = system['SizeModule']['curve']['maxCurve']['m_Curve']
    simulation_speed = system['simulationSpeed']
    rng = Random(seed)

    def sample(value):
        return rng.uniform(value['minScalar'], value['scalar']) if value['minMaxState'] == 3 else value['scalar']

    def ramp(keys, progress):
        for (start, first), (end, second) in zip(keys, keys[1:]):
            if progress <= end:
                weight = max(0, progress-start)/(end-start)
                return first+(second-first)*weight
        return keys[-1][1]

    def size_at(progress):
        for a, b in zip(size, size[1:]):
            if progress <= b['time']:
                interval = b['time']-a['time']
                t = (progress-a['time'])/interval
                return ((1+2*t)*(1-t)**2*a['value'] + t*(1-t)**2*a['outSlope']*interval
                        + t*t*(3-2*t)*b['value'] + t*t*(t-1)*b['inSlope']*interval)
        return size[-1]['value']

    rgb = [[(gradient[f'ctime{i}']/65535, gradient[f'key{i}'][axis])
            for i in range(gradient['m_NumColorKeys'])] for axis in 'rgb']
    alpha = [(gradient[f'atime{i}']/65535, gradient[f'key{i}']['a'])
             for i in range(gradient['m_NumAlphaKeys'])]
    phases = sorted({*(i/16 for i in range(17)), *(key[0] for key in rgb[0]), *(key[0] for key in alpha)})
    start_color = initial['startColor']
    emission = system['EmissionModule']['rateOverTime']
    rate = (emission['scalar']+emission['minScalar'])/2 if emission['minMaxState'] == 3 else emission['scalar']
    lifetime = initial['startLifetime']
    count = min(initial['maxNumParticles'], math.ceil(rate*max(lifetime['minScalar'], lifetime['scalar'])))
    tracks = []
    for index in range(count):
        life = sample(lifetime)
        period = max(life, count/rate)
        start = [rng.uniform(-shape['m_Scale'][axis]/2, shape['m_Scale'][axis]/2) for axis in 'xy']
        drift = [sample(velocity[axis]) for axis in 'xy']
        turn = [sample(rotation[axis]) for axis in ('x', 'y', 'curve')]
        tint = [rng.uniform(start_color['minColor'][axis], start_color['maxColor'][axis]) for axis in 'rgba']
        phase = rng.uniform(0, 2*math.pi)
        amplitude = noise['strength']['scalar']
        frames = []
        # Each particle stays local to its authored emitter plane. The browser uses a
        # seeded loop and smooth noise under the original lifetime/color/size curves.
        for progress in phases:
            time = progress*life
            wave = phase+2*math.pi*noise['frequency']*time
            move_x = start[0]+drift[0]*time+amplitude*(math.sin(wave)-math.sin(phase))
            move_y = start[1]+drift[1]*time+amplitude*(math.cos(wave)-math.cos(phase))
            color = [min(1, 2*tint[i]*ramp(curve, progress)) for i, curve in enumerate(rgb)]
            frames.append([round(v, 5) for v in (
                time/period, units*move_x, -units*move_y, size_at(progress), *(-speed*time for speed in turn),
                *color, tint[3]*ramp(alpha, progress))])
        if period > life:
            frames.append([1, *frames[-1][1:-1], 0])
        tracks.append(dict(
            frame=rng.randrange(atlas['tilesX']*atlas['tilesY']),
            size=round(units*sample(initial['startSize']), 5),
            duration=round(1000*period/simulation_speed, 2),
            delay=round(-1000*index/rate/simulation_speed, 2) if system['prewarm'] else 0,
            frames=frames,
        ))
    return tracks


def export_shop_effects(directory, theme, root_node, root_rect, output):
    dependencies = {}
    for key, checksum in SHOP_DEPENDENCIES.items():
        raw = (directory / f'{key}.ab').read_bytes()
        if hashlib.md5(raw).hexdigest() != checksum:
            raise ValueError(f'Bundle checksum mismatch for {key}')
        assets = {obj.path_id: obj for obj in load(raw).objects}
        dependencies[next(iter(assets.values())).assets_file.name.lower()] = assets

    def resolve(ref):
        if not ref['m_PathID']:
            return None
        if not ref['m_FileID']:
            return theme.objects[ref['m_PathID']]
        files = next(iter(theme.objects.values())).assets_file.externals
        cab = files[ref['m_FileID'] - 1].path.rsplit('/', 1)[-1].lower()
        return dependencies[cab][ref['m_PathID']]

    nodes, textures, materials, shaders, curves = [], [], [], [], []

    @lru_cache
    def texture(file_id, path_id):
        reader = resolve(dict(m_FileID=file_id, m_PathID=path_id))
        name = reader.peek_name()
        asset = reader.read()
        image = asset.image.convert('RGBA')
        prefix = '' if reader.type.name == 'Sprite' else 'shop-'
        filename = f'{prefix}{name.lower()}.webp'
        if not (output / filename).exists():
            image.save(output / filename, 'WEBP', lossless=True)
        settings = getattr(asset, 'm_TextureSettings', None)
        textures.append(dict(file=filename, width=image.width, height=image.height,
                             wrapU=settings.m_WrapU if settings else 1, wrapV=settings.m_WrapV if settings else 1))
        return len(textures) - 1

    @lru_cache
    def shader(file_id, path_id, keywords):
        reader = resolve(dict(m_FileID=file_id, m_PathID=path_id))
        shaders.append(web_shader(reader, list(keywords)))
        return len(shaders) - 1

    @lru_cache
    def material(path_id):
        reader = theme.objects[path_id]
        d = reader.read_typetree()
        props = d['m_SavedProperties']
        values = dict(props['m_Floats'])
        values.update({key: list(vec(color, 'rgba')) for key, color in props['m_Colors']})
        maps = {}
        for key, item in props['m_TexEnvs']:
            values[key+'_ST'] = [*vec(item['m_Scale'], 'xy'), *vec(item['m_Offset'], 'xy')]
            ref = item['m_Texture']
            if ref['m_PathID']:
                maps[key] = texture(ref['m_FileID'], ref['m_PathID'])
        ref = d['m_Shader']
        shader_id = shader(ref['m_FileID'], ref['m_PathID'], tuple(d['m_ValidKeywords']))
        materials.append(dict(name=d['m_Name'], shader=shader_id, values=values, textures=maps))
        return len(materials) - 1

    def add_node(node, rect, parent=None):
        d = theme.tree(node)
        if not theme.tree(d['m_GameObject']['m_PathID'])['m_IsActive']:
            return
        name = theme.path(node).rsplit('/', 1)[-1]
        index = len(nodes)
        pose = dict(name=name, parent=parent, active=True, alpha=1, position=rect.center[:2],
                    z=rect.center[2], size=rect.size, pivot=rect.pivot, anchorMin=[.5, .5], anchorMax=[.5, .5],
                    scale=rect.scale, rotation=rect.rotation)
        if rect.parent:
            # Rect.center is already relative to the parent's pivot.
            pose['anchorMin'] = pose['anchorMax'] = rect.parent.pivot
        nodes.append(pose)
        for component in theme.components(node):
            if component.type.name != 'MonoBehaviour':
                continue
            data = component.read_typetree()
            if 'm_Softness' in data:
                pose.update(rectMask=True, maskSoftness=vec(data['m_Softness'], 'xy'))
            if 'm_Sprite' not in data or not data['m_Enabled']:
                continue
            ref = data['m_Sprite']
            tex_id = texture(ref['m_FileID'], ref['m_PathID']) if ref['m_PathID'] else None
            width, height = (textures[tex_id][key] for key in ('width', 'height')) if tex_id is not None else (1, 1)
            mat_id = data['m_Material']['m_PathID']
            pose['image'] = dict(texture=tex_id, rect=dict(x=0, y=0, width=width, height=height),
                                 offset=dict(x=0, y=0), spriteSize=[width, height], border=[0, 0, 0, 0],
                                 color=vec(data['m_Color'], 'rgba'), material=material(mat_id) if mat_id else None,
                                 type=data['m_Type'], preserveAspect=bool(data['m_PreserveAspect']),
                                 fill=data['m_FillAmount'], fillMethod=data['m_FillMethod'],
                                 clockwise=bool(data['m_FillClockwise']), origin=data['m_FillOrigin'])
        for child in d['m_Children']:
            path = child['m_PathID']
            add_node(path, theme.rect(path, rect), index)

    add_node(root_node, replace(root_rect, parent=None, center=tuple(-v for v in SHOP_CENTER),
                                rotation=IDENTITY, scale=(1, 1, 1)))
    source = next(obj for obj in theme.objects.values() if obj.type.name == 'AnimationClip'
                  and obj.peek_name() == 'prefab_shop_recruit_bkg_disk_loop').read_typetree()
    for binding in source['m_RotationCurves']:
        name = binding['path'].rsplit('/', 1)[-1]
        disk = next(i for i, node in enumerate(nodes) if node['name'] == name)
        for index, channel in enumerate('zw', start=2):
            keys = [[k['time'], k['value'][channel], k['inSlope'][channel], k['outSlope'][channel],
                     k['weightedMode'], k['inWeight'][channel], k['outWeight'][channel]]
                    for k in binding['curve']['m_Curve'][::30]]
            curves.append(dict(node=disk, property=f'rotation.{index}', keys=keys, duration=keys[-1][0]))

    width, height = SHOP_SIZE
    (output / 'shop-scene.json').write_text(json.dumps(dict(
        schemaVersion=1, clip=source['m_Name'], width=width, height=height, duration=curves[0]['duration'], transparent=True,
        nodes=nodes, textures=textures, shaders=shaders, materials=materials, curves=curves,
        sources={**SHOP_DEPENDENCIES, 'tm_p3r_1': BUNDLES['tm_p3r_1'][1]},
    ), separators=(',', ':')) + '\n')


def export(directory, config, output):
    base, common, theme, banner = (Bundle(directory, key) for key in BUNDLES)
    elements = {row['name']: row for row in common.asset_json('tm_p3r_1')['elements']}
    layers = []
    output.mkdir(parents=True, exist_ok=True)

    def put(rect, project, *, sprite=None, text=None, size=None, label=None, opacity=1, fixed_cn=False, tint=None):
        width, height = rect.size
        if width <= 0 or height <= 0 or opacity <= 0:
            return
        layer = dict(width=round(width, 3), height=round(height, 3), matrix=projection(rect, project))
        if side := camera_names.get(project):
            layer['camera'] = side
        if sprite:
            sprite_name = sprite.peek_name()
            filename = sprite_name.lower() + ('_tint' if tint else '')
            file = output / (filename + '.webp')
            if not file.exists():
                image = sprite.read().image.convert('RGBA')
                if tint:
                    colored = Image.new('RGBA', image.size, (*tint, 255))
                    colored.putalpha(image.getchannel('A'))
                    image = colored
                image.save(file, 'WEBP', lossless=True)
            layer.update(sprite=filename, themed=not tint and sprite in theme.sprites.values())
        if text:
            layer.update(text=text, fontSize=size)
        if opacity < 1:
            layer['opacity'] = round(opacity, 3)
        if label:
            layer['label'] = label
        if fixed_cn:
            layer['fixedCN'] = True
        layers.append(layer)

    materials = {obj.peek_name(): obj for obj in theme.objects.values() if obj.type.name == 'Material'}
    triangle_materials = {
        'base_triangle': 'base_triangle_normal', 'mission_triangle': 'mission_triangle_normal',
        'operator_triangle': 'operator_triangle_normal', 'squad_triangle': 'squads_triangle_normal',
    }

    def particles(node, component, rect, project, label):
        system = component.read_typetree()
        renderer = next(obj.read_typetree() for obj in theme.components(node)
                        if obj.type.name == 'ParticleSystemRenderer')
        material = theme.tree(renderer['m_Materials'][0]['m_PathID'])
        texture_id = dict(material['m_SavedProperties']['m_TexEnvs'])['_MainTex']['m_Texture']['m_PathID']
        texture = theme.objects[texture_id]
        name = texture.peek_name()
        file = output / (name + '.webp')
        if not file.exists():
            texture.read().image.save(file, 'WEBP', lossless=True)
        # Use pixel-sized sprites so the browser can preserve the atlas's small edges.
        units = rect.scale[0]
        plane = replace(rect, size=(1, 1), pivot=(0, 1), scale=tuple(v/units for v in rect.scale))
        layers.append(dict(effect='particles', emitter=label, camera=camera_names[project],
                           width=1, height=1, matrix=projection(plane, project),
                           particleMask=name, particles=particle_tracks(system, component.path_id, units)))

    def prefab(node, rect, project, label=None):
        obj = theme.tree(node)
        game_object = theme.tree(obj['m_GameObject']['m_PathID'])
        if not game_object['m_IsActive']:
            return
        for component in theme.components(node):
            if component.type.name == 'ParticleSystem':
                particles(node, component, rect, project, label)
            if component.type.name != 'MonoBehaviour':
                continue
            image = component.read_typetree()
            ref = image.get('m_Sprite')
            if not ref or ref['m_FileID'] or not ref['m_PathID'] or not image.get('m_Enabled'):
                continue
            sprite = theme.objects[ref['m_PathID']]
            name = sprite.peek_name()
            # The shop scene renders the waves with their materials. Keep the static
            # menu layers as the fallback for reduced motion and WebGL failures.
            if name in ('wave_top', 'wave_down'):
                continue
            tint = None
            if name in triangle_materials:
                values = materials[triangle_materials[name]].read_typetree()['m_SavedProperties']
                color = dict(values['m_Colors'])['_Color']
                tint = tuple(round(channel*255) for channel in vec(color, 'rgb'))
            caption = name.endswith('_title') and name != 'btn_battle_ap_title'
            if name in ('text_shop', 'btn_battle_prg'):
                caption = True
            put(rect, project, sprite=sprite, label=label if name in LABEL_SPRITES else None,
                opacity=image['m_Color']['a'], fixed_cn=caption, tint=tint)
        children = [child['m_PathID'] for child in obj['m_Children']]
        # In Unity these materials draw against the lettering using depth. Draw the flat
        # backing first in the web view so the texture cannot cover the label.
        children.sort(key=lambda child: not theme.path(child).endswith('/triangle_flow'))
        for path in children:
            if 'm_SizeDelta' in theme.tree(path):
                prefab(path, theme.rect(path, rect), project, label)

    def from_canvas(node, canvas, override=None):
        if base.path(node).endswith('/' + canvas):
            return base.rect(node, None)
        parent = base.tree(node)['m_Father']['m_PathID']
        return base.rect(node, from_canvas(parent, canvas), override)

    def base_rect(name, canvas, override=None, parent=None):
        return from_canvas(base.node(name, parent or canvas), canvas, override)

    def place_prefab(source, rect, project, label=None):
        node = theme.node(source)
        # The prefab is mounted in its slot. The prefab's own local offset remains authored.
        root = replace(theme.rect(node, None), parent=rect)
        prefab(node, root, project, label)
        return root

    left, left_motion = camera_motion(base, 'left')
    right, right_motion = camera_motion(base, 'right')
    canvas_projectors = {'left': left, 'right': right}
    camera_names = {project: name for name, project in canvas_projectors.items()}

    # The displayed operator is a sample assistant. The reference camera crops the leg area.
    pose = Rect(center=(458, -540, 0), size=(306, 886), pivot=(.5, .5))
    flat = lambda p: (p[0], -p[1], 1)
    layers.append(dict(width=pose.size[0], height=pose.size[1], matrix=projection(pose, flat),
                       sprite='makoto-yuki', label='Makoto Yuki'))

    for slot, base_name, side, label in PRESETS:
        element = elements[slot]
        projector = canvas_projectors[side]
        if slot.startswith('btn_recruit_'):
            # These overrides specify coordinates in the combined recruiting group's native plane.
            group = base_rect('btn_recruit', 'right_canvas')
            rect = Rect(group, (*vec(element['pos'], 'xy'), 0), vec(element['size'], 'xy'))
        else:
            rect = base_rect(base_name, side + '_canvas', element)
        path = (element.get('imgPrefab') or element['prefabPath']).rsplit('/', 1)[-1]
        first_layer = len(layers)
        root = place_prefab(path, rect, projector, label)
        if slot == 'bkg_shop_recruit':
            for layer in layers[first_layer:]:
                layer['fallbackFor'] = 'shop'
            shop = Rect(root, SHOP_CENTER, SHOP_SIZE)
            layers.append(dict(effect='shop', camera=side, width=SHOP_SIZE[0], height=SHOP_SIZE[1],
                               matrix=projection(shop, projector)))
            export_shop_effects(directory, theme, theme.node(path), root, output)
        if slot == 'btn_battle':
            spine = theme.rect(theme.node('headphone_spine'), root)
            # Project the original live Spine rig and keep an atlas fallback for WebGL failures.
            bone_origin = theme.rect(theme.node('spine', 'headphone_spine'), spine)
            bounds = (-200, 600, 10, 350)
            x0, x1, y0, y1 = bounds
            rig = Rect(bone_origin, (x0, y0, 0), (x1-x0, y1-y0), (0, 0))
            shadow_node = theme.node('spine_shadow', 'headphone_spine')
            shadow = replace(rig, parent=theme.rect(shadow_node, spine))
            shadow_color = next(data['m_Color'] for component in theme.components(shadow_node)
                                if component.type.name == 'MonoBehaviour'
                                and 'skeletonDataAsset' in (data := component.read_typetree()))
            fallback = Rect(spine, (0, 56, 0), (595, 211))
            put(fallback, projector, sprite=theme.sprites['tm_p3r_1_headphone'])
            layers[-1]['fallbackFor'] = 'headphones'
            layers.append(dict(effect='headphones', camera=side, matrix=projection(rig, projector),
                               width=x1-x0, height=y1-y0, bounds=list(bounds),
                               shadow={'matrix': projection(shadow, projector), 'opacity': shadow_color['a']}))
            for obj in theme.objects.values():
                if obj.type.name == 'TextAsset' and obj.peek_name() in ('tm_p3r_1_headphone', 'tm_p3r_1_headphone.atlas'):
                    data = obj.read()
                    suffix = '.json' if data.m_Name == 'tm_p3r_1_headphone' else '.atlas.txt'
                    (output / ('headphone-spine' + suffix)).write_text(data.m_Script.replace('\r\n', '\n').rstrip() + '\n')
                if obj.type.name == 'Texture2D' and obj.peek_name() == 'tm_p3r_1_headphone':
                    obj.read().image.save(output / 'headphone-spine.webp', 'WEBP', lossless=True)

    ap = base_rect('panel_ap_container', 'right_canvas', elements['panel_ap'])
    panel = theme.rect(theme.node('prefab_panel_ap'), ap)
    prefab(theme.node('prefab_panel_ap'), panel, right)
    curr = theme.rect(theme.node('num_ap'), panel)
    put(curr, right, text='sanity', size=135, label='Sanity')
    maximum = theme.rect(theme.node('text_ap_max'), panel)
    put(maximum, right, text='maxSanity', size=28)
    progress = base_rect('panel_progress_holder', 'right_canvas', elements['battle_prg_widget'])
    widget = place_prefab('prefab_progress_info', progress, right)
    prog = theme.rect(theme.node('panel_progress_info'), widget)
    put(theme.rect(theme.node('text_operation'), prog), right, text='progress', size=20)

    dialogue = base_rect('dialogue', 'left_canvas', elements['img_dialogue_bg'], 'panel_dialogue')
    put(dialogue, left, sprite=theme.sprites['dialogue_bg'])
    title = theme.sprites['dialogue_title']
    title_rect = Rect(dialogue, (102.5, dialogue.size[1]-18, 0), (140, 62))
    put(title_rect, left, sprite=title)
    dialogue_mask = base.node('dialogue_mask', 'left_canvas')
    mask = base.rect(dialogue_mask, dialogue)
    text = base.rect(base.node('dialogue', 'dialogue_mask'), mask)
    put(replace(text, size=(text.size[0], 100)), left, text='dialogue', size=25)

    promo = base_rect('panel_activity', 'left_canvas')
    put(promo, left, sprite=banner.sprites['Shop_mCard_1'], label='Monthly Card', fixed_cn=True)
    put(base_rect('image_breaking_news', 'left_canvas'), left, sprite=base.sprites['icon_breaking_news'])
    for node, sprite in (('btn_home_illust', 'change_illust'), ('btn_home_illust_preview', 'hide_ui')):
        if sprite in base.sprites:
            put(base_rect(node, 'left_canvas'), left, sprite=base.sprites[sprite])

    # The screen-space canvas overlays both perspective cameras.
    top = Rect(size=(WIDTH, HEIGHT))
    def top_rect(node):
        name = base.path(node).split('/')[-1]
        if name == 'panel_top_ui':
            return top
        parent = base.tree(node)['m_Father']['m_PathID']
        return base.rect(node, top_rect(parent))

    screen = lambda p: (p[0]+WIDTH/2, HEIGHT/2-p[1], 1)
    profile_back = top_rect(base.node('panel_back', 'panel_player_profile'))
    profile_icon = elements['img_name_icon']
    put(replace(profile_back, size=vec(profile_icon['size'], 'xy')), screen, sprite=theme.sprites['p3r_icon'])
    for node, sprite in (
        ('image_menu', 'image_profile_bkg'), ('image_exp_empty', 'image_exp_circle_empty'),
        ('btn_setting', 'icon_setting'), ('btn_announcement', 'icon_annoucement'), ('btn_mailbox', 'icon_mailbox'),
    ):
        put(top_rect(base.node(node, 'panel_top_ui')), screen, sprite=base.sprites[sprite])
    for node, label, font_size in (('text_playerlevel', 'level', 62), ('text_playername', 'doctor', 33)):
        put(top_rect(base.node(node, 'panel_top_ui')), screen, text=label, size=font_size)

    status = base.node('panel_status', 'right_canvas')
    for node, text, sprite in (
        ('text_gold (1)', 'lmd', 'money_icon'),
        ('text_diamondShard', 'orundum', 'diamond_shard_icon'),
        ('text_crystal', 'originite', 'diamond_icon'),
    ):
        number = base_rect(node, 'right_canvas', parent=base.path(status) + '/group_info/')
        icon = replace(number, center=add(number.center, (-number.size[0]/2-25, 0, 0)), size=(54, 44))
        put(icon, right, sprite=base.sprites[sprite])
        put(number, right, text=text, size=40)

    config.write_text(json.dumps({
        'width': WIDTH, 'height': HEIGHT, 'sources': dict(BUNDLES.values()), 'layers': layers,
        'motion': {'left': left_motion, 'right': right_motion},
    }, ensure_ascii=False, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundles', type=Path)
    parser.add_argument('--config', type=Path, default=Path('config/persona-home-layout.json'))
    parser.add_argument('--art', type=Path, default=Path('public/event-preview/tm_p3r_1'))
    args = parser.parse_args()
    export(args.bundles, args.config, args.art)
