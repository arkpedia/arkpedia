"""Build the Persona home screen's browser layout from the original CN Unity bundles.

The prefab geometry is in ui/pages/home_page; the theme JSON in hometheme/common replaces
its named slots with prefabs from tm_p3r_1. Project each visible layer through its native
camera at the game's 1280×720 reference resolution. Only account-driven content needs
preview values. Run with the four unpacked bundles in the input directory.
"""
import argparse
from dataclasses import dataclass, replace
from functools import lru_cache
import hashlib
import json
import math
from pathlib import Path

from PIL import Image

from client_bundles import load

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


def screen_projector(camera_node, base):
    c = base.tree(camera_node)
    rotation = vec(c['m_LocalRotation'], 'xyzw')
    inverse = tuple(-x for x in rotation[:3]) + rotation[3:]
    offset = tuple(-x for x in vec(c['m_LocalPosition']))
    camera = next(obj.read_typetree() for obj in base.components(camera_node) if obj.type.name == 'Camera')
    focal = HEIGHT / (2*math.tan(math.radians(camera['field of view'])/2))

    def project(point):
        x, y, depth = rotate(inverse, add(point, offset))
        return WIDTH/2*depth + focal*x, HEIGHT/2*depth - focal*y, depth

    return project


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

    def prefab(node, rect, project, label=None):
        obj = theme.tree(node)
        game_object = theme.tree(obj['m_GameObject']['m_PathID'])
        if not game_object['m_IsActive']:
            return
        for component in theme.components(node):
            if component.type.name != 'MonoBehaviour':
                continue
            image = component.read_typetree()
            ref = image.get('m_Sprite')
            if not ref or ref['m_FileID'] or not ref['m_PathID'] or not image.get('m_Enabled'):
                continue
            sprite = theme.objects[ref['m_PathID']]
            name = sprite.peek_name()
            # The original water materials need Unity shader state. The visible menu backings
            # can use the triangle textures and the original normal-pass tint in this preview.
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

    left = screen_projector(base.node('left_camera'), base)
    right = screen_projector(base.node('right_camera'), base)
    canvas_projectors = {'left': left, 'right': right}

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
        root = place_prefab(path, rect, projector, label)
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
            layers.append(dict(effect='headphones', matrix=projection(rig, projector),
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
    }, ensure_ascii=False, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundles', type=Path)
    parser.add_argument('--config', type=Path, default=Path('config/persona-home-layout.json'))
    parser.add_argument('--art', type=Path, default=Path('public/event-preview/tm_p3r_1'))
    args = parser.parse_args()
    export(args.bundles, args.config, args.art)
