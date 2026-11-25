"""Extract the shared home-screen cameras, theme sprites and looping position tracks.

Use the unpacked .ab files from one client release's hot_update_list.json. The layout
uses the home page's slot overrides and captures the idle state of each theme prefab.
Custom shaders, Spine and world-space particle systems require a separate scene export.
"""
import argparse
from collections import defaultdict
from dataclasses import replace
import json
import math
from pathlib import Path

from PIL import Image, ImageChops

from export_persona_home import BUNDLES, Bundle, HEIGHT, PRESETS, Rect, WIDTH, add, camera_motion, projection, vec


def leaf(path):
    return path.rsplit('/', 1)[-1]


def curve_value(keys, time):
    for a, b in zip(keys, keys[1:]):
        if time < b['time']:
            if time <= a['time'] or not math.isfinite(a['outSlope']) or not math.isfinite(b['inSlope']):
                return a['value']
            duration = b['time'] - a['time']
            t = (time - a['time']) / duration
            return ((1 + 2*t)*(1 - t)**2*a['value'] + t*(1 - t)**2*a['outSlope']*duration
                    + t*t*(3 - 2*t)*b['value'] + t*t*(t - 1)*b['inSlope']*duration)
    return keys[-1]['value']


def legacy_clip(bundle, component):
    animation = component.read_typetree()
    ref = animation['m_Animation']
    if not animation['m_PlayAutomatically'] or ref['m_FileID'] or not ref['m_PathID']:
        return 0, {}
    tracks = defaultdict(dict)
    for row in bundle.tree(ref['m_PathID'])['m_FloatCurves']:
        keys = row['curve']['m_Curve']
        if keys:
            tracks[row['path']][row['attribute']] = keys
    duration = max((keys[-1]['time'] for path in tracks.values() for keys in path.values()), default=0)
    return duration, tracks


def position_track(rect, projector, initial, duration, tracks):
    axes = ('m_AnchoredPosition.x', 'm_AnchoredPosition.y')
    curves = [tracks.get(axis) for axis in axes]
    if not any(keys and len({key['value'] for key in keys}) > 1 for keys in curves):
        return None
    times = {0, duration}
    for keys in filter(None, curves):
        for a, b in zip(keys, keys[1:]):
            times.add(a['time'])
            # Sample Unity's cubic interpolation on moving intervals. Hold segments need two keys.
            if a['value'] != b['value']:
                count = math.ceil(60 * (b['time'] - a['time']))
                times.update(a['time'] + (b['time'] - a['time']) * tick / count for tick in range(1, count))
        times.add(keys[-1]['time'])
    frames = []
    for time in sorted(times):
        delta = tuple(curve_value(keys, time) - initial[i] if keys else 0 for i, keys in enumerate(curves))
        moved = replace(rect, center=add(rect.center, (*delta, 0)))
        frames.append([round(time / duration, 7), *projection(moved, projector)])
    return dict(duration=round(1000*duration, 3), frames=frames)


PREVIEW_TEXT = {
    'text_ap': ('sanity', 'Sanity', 85),
    'text_ap_title': ('sanityTitle', None, 22),
    'text_ap_max': ('maxSanity', None, 22),
    'text_operation': ('progress', None, 22),
}

# Unity's rectangular masks can contain animated subtrees with hidden idle states.
# Skip alternate transitions when their materials or clipping cannot be reproduced.
IDLE_ALTERNATES = {'group_trans', 'group_anim', 'root_trans'}


def export_theme(base, common, theme, theme_id, sources, output):
    elements = {row['name']: row for row in common.asset_json(theme_id)['elements']}
    layers = []
    left, left_motion = camera_motion(base, 'left')
    right, right_motion = camera_motion(base, 'right')
    projectors = {'left': left, 'right': right}
    screen = lambda point: (point[0] + WIDTH/2, HEIGHT/2 - point[1], 1)
    output.mkdir(parents=True, exist_ok=True)
    written = set()

    def put(rect, side, *, sprite=None, label=None, color=(1, 1, 1, 1), text=None, font=None, motion=None):
        width, height = rect.size
        if min(width, height) <= 0 or color[3] <= 0:
            return False
        projector = projectors.get(side, screen)
        layer = dict(width=round(width, 3), height=round(height, 3), matrix=projection(rect, projector))
        if side:
            layer['camera'] = side
        if sprite:
            themed = sprite in theme.sprites.values()
            name = sprite.peek_name().lower()
            rgb = tuple(round(value * 255) for value in color[:3])
            if rgb != (255, 255, 255):
                name += '_' + ''.join(f'{value:02x}' for value in rgb)
            if name not in written:
                image = sprite.read().image.convert('RGBA')
                if rgb != (255, 255, 255):
                    tinted = ImageChops.multiply(image, Image.new('RGBA', image.size, (*rgb, 255)))
                    image = tinted
                image.save(output / (name + '.webp'), 'WEBP', lossless=True)
                written.add(name)
            layer.update(sprite=name, themed=themed)
        if text:
            layer.update(text=text, fontSize=font)
        if color[3] < 1:
            layer['opacity'] = round(color[3], 3)
        if label:
            layer['label'] = label
        if motion:
            layer['motion'] = motion
        layers.append(layer)
        return True

    def prefab(node, rect, side, root, label=None, alpha=1, tracks=None, duration=0):
        data = theme.tree(node)
        game_object = theme.tree(data['m_GameObject']['m_PathID'])
        name = game_object['m_Name']
        if not game_object['m_IsActive'] or name in IDLE_ALTERNATES:
            return label
        components = list(theme.components(node))
        # A clip's paths are relative to the object that owns its Animation component.
        for component in components:
            if component.type.name == 'Animation':
                seconds, clip_tracks = legacy_clip(theme, component)
                if clip_tracks:
                    duration, tracks, root = seconds, clip_tracks, theme.path(node)
        local = (tracks or {}).get(theme.path(node)[len(root):].lstrip('/'), {})
        if 'm_IsActive' in local and local['m_IsActive'][0]['value'] <= 0:
            return label
        for component in components:
            if component.type.name == 'CanvasGroup':
                alpha *= local.get('m_Alpha', [{'value': component.read_typetree()['m_Alpha']}])[0]['value']
        for component in components:
            if component.type.name != 'MonoBehaviour':
                continue
            image = component.read_typetree()
            ref = image.get('m_Sprite')
            if 'm_Text' in image and name in PREVIEW_TEXT:
                value, text_label, font = PREVIEW_TEXT[name]
                put(rect, side, label=text_label, text=value, font=font)
            if not ref or ref['m_FileID'] or not ref['m_PathID'] or not image['m_Enabled']:
                continue
            color = list(vec(image['m_Color'], 'rgba'))
            if 'm_Color.a' in local:
                color[3] = local['m_Color.a'][0]['value']
            color[3] *= alpha
            motion = position_track(rect, projectors[side], vec(data['m_AnchoredPosition'], 'xy'), duration, local)
            if put(rect, side, sprite=theme.objects[ref['m_PathID']], label=label, color=color, motion=motion):
                label = None
        for child in data['m_Children']:
            path = child['m_PathID']
            if 'm_SizeDelta' in theme.tree(path):
                label = prefab(path, theme.rect(path, rect), side, root, label, alpha, tracks, duration)
        return label

    def place(element, rect, side, label=None):
        if image := element.get('imgData'):
            inner = Rect(rect, (*vec(image['pos'], 'xy'), 0), vec(image['size'], 'xy'))
            put(inner, side, sprite=theme.sprites[leaf(image['spritePath'])], label=label)
        elif prefab_path := element.get('imgPrefab') or element.get('prefabPath'):
            root = theme.node(leaf(prefab_path))
            prefab(root, replace(theme.rect(root, None), parent=rect), side, theme.path(root), label)
        elif sprite_path := element.get('spritePath'):
            put(rect, side, sprite=theme.sprites[leaf(sprite_path)], label=label)

    for slot, base_name, side, label in PRESETS:
        if not (element := elements.get(slot)):
            continue
        if slot.startswith('btn_recruit_'):
            group = base.canvas_rect('btn_recruit', 'right_canvas')
            rect = Rect(group, (*vec(element['pos'], 'xy'), 0), vec(element['size'], 'xy'))
        else:
            rect = base.canvas_rect(base_name, side + '_canvas', element)
        place(element, rect, side, label)
    for slot, base_name in (('panel_ap', 'panel_ap_container'), ('battle_prg_widget', 'panel_progress_holder')):
        if element := elements.get(slot):
            place(element, base.canvas_rect(base_name, 'right_canvas', element), 'right')

    def top_rect(name, override=None, parent=None):
        # The screen-space canvas is serialized with zero scale in the prefab.
        return base.canvas_rect(name, 'panel_top_ui', override, parent, Rect())

    skin = elements.get('img_name_icon')
    if skin and skin.get('spritePath'):
        rect = top_rect('panel_back', skin, 'panel_player_profile')
        put(rect, None, sprite=theme.sprites[leaf(skin['spritePath'])])
    for node, sprite in (
        ('image_menu', 'image_profile_bkg'), ('image_exp_empty', 'image_exp_circle_empty'),
        ('btn_setting', 'icon_setting'), ('btn_announcement', 'icon_annoucement'), ('btn_mailbox', 'icon_mailbox'),
    ):
        put(top_rect(node), None, sprite=base.sprites[sprite])
    for node, value, font in (('text_playerlevel', 'level', 62), ('text_playername', 'doctor', 33)):
        put(top_rect(node), None, text=value, font=font)

    for node, value, sprite in (
        ('text_gold (1)', 'lmd', 'money_icon'),
        ('text_diamondShard', 'orundum', 'diamond_shard_icon'),
        ('text_crystal', 'originite', 'diamond_icon'),
    ):
        rect = base.canvas_rect(node, 'right_canvas', parent='/panel_status/group_info/')
        icon = replace(rect, center=add(rect.center, (-rect.size[0]/2 - 25, 0, 0)), size=(54, 44))
        put(icon, 'right', sprite=base.sprites[sprite])
        put(rect, 'right', text=value, font=40)

    (output / 'layout.json').write_text(json.dumps(dict(
        width=WIDTH, height=HEIGHT, sources=sources, layers=layers,
        motion={'left': left_motion, 'right': right_motion},
    ), separators=(',', ':')) + '\n')


def export_background(bundle, background, output):
    left, right = (bundle.sprites[f'{background}_{side}'].read().image.convert('RGB') for side in ('left', 'right'))
    if left.height != right.height:
        raise ValueError(f'Sprite heights differ in {background}')
    image = Image.new('RGB', (left.width + right.width, left.height))
    image.paste(left)
    image.paste(right, (left.width, 0))
    image.save(output / 'background.webp', 'WEBP', quality=92, method=6)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundles', type=Path)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--theme')
    parser.add_argument('--background')
    parser.add_argument('--art', type=Path, default=Path('public/event-preview'))
    args = parser.parse_args()
    if not (args.theme or args.background):
        parser.error('Specify --theme or --background')

    checksums = {row['name']: row['md5'] for row in json.loads(args.manifest.read_text())['abInfos']}

    def bundle(key, path):
        return Bundle(args.bundles, key, checksums[path])

    if theme := args.theme:
        theme_path = f'arts/ui/hometheme/[uc]{theme}.ab'
        base_path, common_path = (BUNDLES[key][0] for key in ('home_page', 'common'))
        export_theme(bundle('home_page', base_path), bundle('common', common_path), bundle(theme, theme_path), theme,
                     {path: checksums[path] for path in (base_path, common_path, theme_path)}, args.art / theme)
    if background := args.background:
        output = args.art / background
        output.mkdir(parents=True, exist_ok=True)
        export_background(bundle(background, f'arts/ui/homebackground/wrapper/{background}.ab'), background, output)


if __name__ == '__main__':
    main()
