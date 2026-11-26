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
import re
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


def sprite_canvas(sprite):
    data = sprite.read()
    image = data.image.convert('RGBA')
    size = (round(data.m_Rect.width), round(data.m_Rect.height))
    if image.size == size:
        return image
    # Unity's Image samples the trimmed texture inside its original sprite rect.
    # UnityPy returns only the packed texture, with the Y axis already flipped.
    offset = data.m_RD.textureRectOffset
    canvas = Image.new('RGBA', size)
    canvas.paste(image, (round(offset.x), size[1] - round(offset.y) - image.height))
    return canvas


def tiled_sprite(sprite, size):
    image = sprite_canvas(sprite)
    border = sprite.read().m_Border
    left, bottom, right, top = (round(getattr(border, axis)) for axis in 'xyzw')
    width, height = map(round, size)
    canvas = Image.new('RGBA', (width, height))
    xs = (0, left, image.width - right, image.width)
    ys = (0, top, image.height - bottom, image.height)
    target_xs = (0, left, width - right, width)
    target_ys = (0, top, height - bottom, height)
    for row in range(3):
        for column in range(3):
            tile = image.crop((xs[column], ys[row], xs[column+1], ys[row+1]))
            if min(tile.size) <= 0:
                continue
            for y in range(target_ys[row], target_ys[row+1], tile.height):
                for x in range(target_xs[column], target_xs[column+1], tile.width):
                    visible = tile.crop((0, 0, min(tile.width, target_xs[column+1] - x),
                                         min(tile.height, target_ys[row+1] - y)))
                    canvas.paste(visible, (x, y))
    return canvas


PREVIEW_TEXT = {
    'text_ap': ('sanity', 'Sanity', 85),
    'text_ap_title': ('sanityTitle', None, 22),
    'text_ap_max': ('maxSanity', None, 22),
    'text_operation': ('progress', None, 22),
    'text_normal': ('recruit', None, 30),
    'text_advance': ('headhunt', None, 30),
    'text_recruit': ('recruitment', None, 31),
}
CURRENCY_SLOTS = (
    ('text_gold (1)', 'lmd', 'LMD', 'money_icon'),
    ('text_diamondShard', 'orundum', 'Orundum', 'diamond_shard_icon'),
    ('text_crystal', 'originite', 'Originite Prime', 'diamond_icon'),
)
AUTO_TEXT_WIDTH = {'maxSanity': 2.5, 'lmd': 3, 'orundum': 3, 'originite': 2}

# Unity's rectangular masks can contain animated subtrees with hidden idle states.
# Skip alternate transitions when their materials or clipping cannot be reproduced.
IDLE_ALTERNATES = {'group_trans', 'group_anim', 'root_trans'}


def text_style(bundle, node):
    behaviours = [component.read_typetree() for component in bundle.components(node)
                  if component.type.name == 'MonoBehaviour']
    font = next(data['m_FontData'] for data in behaviours if 'm_FontData' in data)
    face = next((data['_fontName'] for data in behaviours if '_fontName' in data), None)
    return font['m_FontSize'], face


def bitmap_digits(bundle, view):
    """Read the digit atlas linked by a runtime character-view prefab."""
    if not view or view['m_FileID'] or not view['m_PathID']:
        return None
    for component in bundle.tree(view['m_PathID'])['m_Component']:
        ref = bundle.tree(component['component']['m_PathID']).get('m_FontData', {}).get('m_Font')
        if ref and not ref['m_FileID'] and ref['m_PathID']:
            font = bundle.tree(ref['m_PathID'])
            break
    else:
        return None
    if not font['m_CharacterRects']:
        return None
    material = bundle.tree(font['m_DefaultMaterial']['m_PathID'])
    texture = dict(material['m_SavedProperties']['m_TexEnvs'])['_MainTex']['m_Texture']
    if texture['m_FileID'] or not texture['m_PathID']:
        return None
    atlas = bundle.objects[texture['m_PathID']].read().image.convert('RGBA')
    glyphs = {}
    for entry in font['m_CharacterRects']:
        digit = chr(entry['index'])
        if digit not in '0123456789' or entry['flipped']:
            continue
        x, y, w, h = vec(entry['uv'], ('x', 'y', 'width', 'height'))
        glyphs[digit] = [round(x*atlas.width), round((1-y-h)*atlas.height),
                         round(w*atlas.width), round(h*atlas.height), entry['advance']]
    return (atlas, glyphs) if len(glyphs) == 10 else None


def mask_space(rect):
    """Express projected children in the pixel coordinates of a soft mask."""
    origin = rect.top_left(0, 0)
    axes = [tuple(b-a for a, b in zip(origin, rect.top_left(*point))) for point in ((1, 0), (0, 1))]

    def point_in_mask(point):
        delta = tuple(b-a for a, b in zip(origin, point))
        return (*(sum(d*v for d, v in zip(delta, axis)) / sum(v*v for v in axis) for axis in axes), 1)

    return point_in_mask


def export_theme(base, common, theme, theme_id, sources, output, *, news=None, assistant=None, assistant_frame=None,
                 assistant_dialogue=None, locale=None):
    elements = {row['name']: row for row in common.asset_json(theme_id)['elements']}
    sprite_names = {name.casefold(): sprite for name, sprite in theme.sprites.items()}

    def theme_sprite(path):
        name = leaf(path)
        return theme.sprites.get(name) or sprite_names[name.casefold()]
    layers = []
    sanity_anchor = None
    sanity_bitmap = None
    left, left_motion = camera_motion(base, 'left')
    right, right_motion = camera_motion(base, 'right')
    projectors = {'left': left, 'right': right}
    screen = lambda point: (point[0] + WIDTH/2, HEIGHT/2 - point[1], 1)
    output.mkdir(parents=True, exist_ok=True)
    written = set()

    if assistant:
        name, image_path = assistant
        x, y, height = assistant_frame
        image = Image.open(image_path).convert('RGBA')
        width = round(height * image.width / image.height)
        image.resize((width, height), Image.Resampling.LANCZOS).save(output / 'assistant.webp', 'WEBP', quality=92, method=6)
        rect = Rect(center=(x, -y, 0), size=(width, height), pivot=(0, 1))
        canvas = lambda point: (point[0], -point[1], 1)
        layers.append(dict(width=width, height=height, matrix=projection(rect, canvas),
                           camera='front', sprite='assistant', label=name))

    def put(rect, side, *, sprite=None, label=None, color=(1, 1, 1, 1), text=None, font=None, motion=None, scope=None, tiled=False):
        width, height = rect.size
        if width <= 0 and text in AUTO_TEXT_WIDTH:
            # Unity sizes these counters from the actual text. Empty serialized
            # labels otherwise have a zero-width RectTransform in the export.
            width = font * AUTO_TEXT_WIDTH[text]
            pivot = (0, rect.pivot[1]) if text in ('lmd', 'orundum', 'originite') else rect.pivot
            rect = replace(rect, size=(width, height), pivot=pivot)
        if min(width, height) <= 0 or color[3] <= 0:
            return False
        projector, target = scope if scope else (projectors.get(side, screen), layers)
        layer = dict(width=round(width, 3), height=round(height, 3), matrix=projection(rect, projector))
        if side and not scope:
            layer['camera'] = side
        if sprite:
            themed = sprite in theme.sprites.values()
            name = sprite.peek_name().lower()
            rgb = tuple(round(value * 255) for value in color[:3])
            if rgb != (255, 255, 255):
                name += '_' + ''.join(f'{value:02x}' for value in rgb)
            if name not in written:
                image = tiled_sprite(sprite, rect.size) if tiled else sprite_canvas(sprite)
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
        target.append(layer)
        return layer

    def prefab(node, rect, side, root, label=None, alpha=1, tracks=None, duration=0, scope=None):
        nonlocal sanity_anchor, sanity_bitmap
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
        behaviours = [component.read_typetree() for component in components if component.type.name == 'MonoBehaviour']
        group = next((data for data in behaviours if 'm_ChildControlWidth' in data), None)
        if name == 'ap_layout' and side == 'right':
            sanity_anchor = rect
            view = next((data['_viewPrefab'] for data in behaviours if '_viewPrefab' in data), None)
            if group and (bitmap := bitmap_digits(theme, view)):
                atlas, glyphs = bitmap
                atlas.save(output / 'sanity-digits.webp', 'WEBP', lossless=True)
                sanity_bitmap = dict(atlas='sanity-digits', glyphs=glyphs, spacing=group['m_Spacing'])

        mask = next((data['_sprite'] for data in behaviours if data.get('_source') == 1
                     and '_channelWeights' in data and data.get('m_Enabled')), None)
        if mask and not mask['m_FileID'] and mask['m_PathID'] and min(rect.size) > 0:
            layer = put(rect, side, sprite=theme.objects[mask['m_PathID']], scope=scope)
            layer['children'] = []
            scope = mask_space(rect), layer['children']

        flow = None
        if group and name in ('max_layout', 'layout'):
            child_names = {leaf(theme.path(child['m_PathID'])) for child in data['m_Children']}
            if name == 'max_layout' and {'bg_sanity', 'text_ap_max'} <= child_names:
                flow = {'text_ap_max': 55}
            elif name == 'layout' and 'prefab_progress_info' in theme.path(node):
                flow = {'panel_progress_info': 58, 'text_operation': 220 if locale == 'en' else 136}
        if flow:
            padding = group['m_Padding']
            spacing = group['m_Spacing']
            width = sum(flow.values()) + padding['m_Left'] + padding['m_Right'] + spacing*(len(flow)-1)
            rect = replace(rect, size=(width, rect.size[1]))
            cursor = padding['m_Left'] - width*rect.pivot[0]

        for component in components:
            if component.type.name == 'CanvasGroup':
                alpha *= local.get('m_Alpha', [{'value': component.read_typetree()['m_Alpha']}])[0]['value']
        for component in components:
            if component.type.name != 'MonoBehaviour':
                continue
            image = component.read_typetree()
            ref = image.get('m_Sprite')
            text_node = 'text_ap_title' if name == 'text_title' and '/panel_ap' in theme.path(node) else name
            if 'm_FontData' in image and text_node in PREVIEW_TEXT:
                value, text_label, _ = PREVIEW_TEXT[text_node]
                font = image['m_FontData']
                color = vec(image['m_Color'], 'rgba')
                layer = put(rect, side, label=text_label, text=value, font=font['m_FontSize'], color=color, scope=scope)
                if layer:
                    layer['color'] = '#' + ''.join(f'{round(channel*255):02x}' for channel in color[:3])
                    layer['alignment'] = font['m_Alignment']
                    if locale == 'en':
                        face = next((data['_fontName'] for data in behaviours if '_fontName' in data), None)
                        if not face and value in ('recruitment', 'recruit', 'headhunt'):
                            face = 'NotoSansHans-Medium'
                        if face:
                            layer['fontFace'] = face
                        if value == 'progress':
                            layer['content'] = 'All Stages Cleared'
            if not ref or ref['m_FileID'] or not ref['m_PathID'] or not image['m_Enabled']:
                continue
            color = list(vec(image['m_Color'], 'rgba'))
            if 'm_Color.a' in local:
                color[3] = local['m_Color.a'][0]['value']
            color[3] *= alpha
            projector = scope[0] if scope else projectors[side]
            motion = position_track(rect, projector, vec(data['m_AnchoredPosition'], 'xy'), duration, local)
            if put(rect, side, sprite=theme.objects[ref['m_PathID']], label=label, color=color, motion=motion, scope=scope):
                label = None
        for child in data['m_Children']:
            path = child['m_PathID']
            if 'm_SizeDelta' not in theme.tree(path):
                continue
            child_rect = theme.rect(path, rect)
            if flow and (child_width := flow.get(leaf(theme.path(path)))):
                child_height = child_rect.size[1]
                center = (cursor + child_width*child_rect.pivot[0],
                          child_height*(child_rect.pivot[1]-.5), child_rect.center[2])
                child_rect = replace(child_rect, center=center, size=(child_width, child_height))
                cursor += child_width + spacing
            label = prefab(path, child_rect, side, root, label, alpha, tracks, duration, scope)
        return label

    def place(element, rect, side, label=None):
        if image := element.get('imgData'):
            inner = Rect(rect, (*vec(image['pos'], 'xy'), 0), vec(image['size'], 'xy'))
            put(inner, side, sprite=theme_sprite(image['spritePath']), label=label)
        elif prefab_path := element.get('imgPrefab') or element.get('prefabPath'):
            root = theme.node(leaf(prefab_path))
            # The Terminal's AP and progress panels mount in anchored slots.
            # The button artwork keeps its position relative to the slot origin.
            mounted = (theme.rect(root, rect) if element['name'] in ('panel_ap', 'battle_prg_widget')
                       else replace(theme.rect(root, None), parent=rect))
            prefab(root, mounted, side, theme.path(root), label)
        elif sprite_path := element.get('spritePath'):
            put(rect, side, sprite=theme_sprite(sprite_path), label=label)

    for slot, base_name, side, label in PRESETS:
        if not (element := elements.get(slot)):
            continue
        if slot.startswith('btn_recruit_'):
            group = base.canvas_rect('btn_recruit', 'right_canvas')
            rect = Rect(group, (*vec(element['pos'], 'xy'), 0), vec(element['size'], 'xy'))
        else:
            rect = base.canvas_rect(base_name, side + '_canvas', element)
        place(element, rect, side, label)
    if (title := elements.get('img_grp_recruit')) and title.get('spritePath'):
        place(title, base.canvas_rect('panel_recruit', 'right_canvas', title), 'right', 'Recruitment')
    for slot, base_name in (('panel_ap', 'panel_ap_container'), ('battle_prg_widget', 'panel_progress_holder')):
        if element := elements.get(slot):
            place(element, base.canvas_rect(base_name, 'right_canvas', element), 'right')

    # A theme may leave Sanity to the shared home controller instead of
    # serializing a replacement. Keep the controller's counters in either case.
    for node in ('text_ap', 'text_ap_max'):
        value, label, font = PREVIEW_TEXT[node]
        if any(layer.get('text') == value for layer in layers):
            continue
        element = elements.get(node, {})
        rect = (replace(sanity_anchor, size=vec(element['size'], 'xy'))
                if node == 'text_ap' and sanity_anchor is not None and 'size' in element
                else base.canvas_rect(node, 'right_canvas', element))
        layer = put(rect, 'right', label=label, text=value, font=element.get('fontSize', font))
        if layer and value == 'sanity' and sanity_bitmap:
            layer['bitmap'] = sanity_bitmap
    if not elements.get('panel_ap'):
        node = 'test_ap_title'
        put(base.canvas_rect(node, 'right_canvas', elements.get('text_ap_title')),
            'right', text='sanityTitle', font=PREVIEW_TEXT['text_ap_title'][2])

    if news:
        sprite, label = news
        put(base.canvas_rect('panel_activity', 'left_canvas'), 'left', sprite=sprite, label=label)
        put(base.canvas_rect('image_breaking_news', 'left_canvas'), 'left',
            sprite=base.sprites['icon_breaking_news'], label='Breaking News')
    if assistant_dialogue and (back := elements.get('img_dialogue_bg')):
        panel = base.canvas_rect('dialogue', 'left_canvas', back, 'panel_dialogue')
        put(panel, 'left', sprite=theme_sprite(back['spritePath']), tiled=True)
        if title := elements.get('img_dialogue_title'):
            title_node = next(node for node in base.transforms['back']
                              if base.path(node).endswith('/panel_dialogue/dialogue/back'))
            title_rect = base.rect(title_node, panel, title)
            put(title_rect, 'left', sprite=theme_sprite(title['spritePath']))
        mask = base.rect(base.node('dialogue_mask', 'left_canvas'), panel)
        text_node = base.node('dialogue', 'dialogue_mask')
        text = base.rect(text_node, mask)
        font, face = text_style(base, text_node)
        layer = put(replace(text, size=(text.size[0], mask.size[1])), 'left', text='dialogue', font=font)
        layer['content'] = assistant_dialogue
        if locale == 'en':
            layer['fontFace'] = face
        arrow = base.node('tri', '/panel_dialogue/dialogue/')
        put(base.rect(arrow, panel), 'left', sprite=base.sprites['tri'])

    if assistant:
        for node, sprite in (('btn_home_illust', 'change_illust'), ('btn_home_illust_preview', 'hide_ui')):
            put(base.canvas_rect(node, 'left_canvas'), 'left', sprite=base.sprites[sprite])

    def top_rect(name, override=None, parent=None):
        # The screen-space canvas is serialized with zero scale in the prefab.
        return base.canvas_rect(name, 'panel_top_ui', override, parent, Rect())

    skin = elements.get('img_name_icon')
    if skin and skin.get('spritePath'):
        rect = top_rect('panel_back', skin, 'panel_player_profile')
        put(rect, None, sprite=theme_sprite(skin['spritePath']))
    for node, sprite in (
        ('image_menu', 'image_profile_bkg'), ('image_exp_empty', 'image_exp_circle_empty'),
        ('btn_setting', 'icon_setting'), ('btn_announcement', 'icon_annoucement'), ('btn_mailbox', 'icon_mailbox'),
    ):
        put(top_rect(node), None, sprite=base.sprites[sprite])
    for node, value, default_size in (('text_playerlevel', 'level', 62), ('text_playername', 'doctor', 33)):
        size, face = text_style(base, base.node(node, 'panel_top_ui')) if locale == 'en' else (default_size, None)
        layer = put(top_rect(node), None, text=value, font=size)
        if layer and face:
            layer['fontFace'] = face

    for node, value, label, sprite in CURRENCY_SLOTS:
        rect = base.canvas_rect(node, 'right_canvas', parent='/panel_status/group_info/')
        icon = replace(rect, center=add(rect.center, (-rect.size[0]/2 - 25, 0, 0)), size=(54, 44))
        put(icon, 'right', sprite=base.sprites[sprite])
        size, face = (text_style(base, base.node(node, '/panel_status/group_info/'))
                      if locale == 'en' else (40, None))
        layer = put(rect, 'right', label=label, text=value, font=size)
        if layer and face:
            layer['fontFace'] = face

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
    parser.add_argument('--discover', action='store_true',
                        help='Import any new home themes and backgrounds in the unpacked client bundles.')
    news_options = parser.add_mutually_exclusive_group()
    news_options.add_argument('--breaking-news', action='store_true', help='Include the game’s default news panel.')
    news_options.add_argument('--news-banner', nargs=3, metavar=('BUNDLE', 'SPRITE', 'TITLE'),
                              help='Use a selected in-game banner in the news panel.')
    parser.add_argument('--assistant', nargs=2, metavar=('NAME', 'ART'))
    parser.add_argument('--assistant-frame', nargs=3, type=int, metavar=('X', 'Y', 'HEIGHT'))
    parser.add_argument('--locale', choices=('en', 'zh'), help='Client locale for runtime labels.')
    parser.add_argument('--assistant-dialogue', help='Display the reference assistant’s localized voice line.')
    parser.add_argument('--art', type=Path, default=Path('public/event-preview'))
    args = parser.parse_args()
    if not (args.theme or args.background or args.discover):
        parser.error('Specify --theme, --background or --discover')
    if args.discover and (args.theme or args.background or args.assistant or args.news_banner):
        parser.error('--discover imports multiple cosmetics and cannot be combined with a specific asset, assistant, or banner')

    if bool(args.assistant) != bool(args.assistant_frame) or (args.assistant_frame and args.assistant_frame[2] <= 0):
        parser.error('--assistant requires --assistant-frame with a positive height')

    if args.assistant_dialogue and not args.assistant:
        parser.error('--assistant-dialogue requires --assistant')

    checksums = {row['name']: row['md5'] for row in json.loads(args.manifest.read_text())['abInfos']}

    def bundle(key, path):
        return Bundle(args.bundles, key, checksums[path])

    def new_assets(pattern, output_name):
        for path in sorted(checksums):
            match = re.fullmatch(pattern, path)
            if match:
                id_ = match[1]
                if (args.bundles / f'{id_}.ab').is_file() and not (args.art / id_ / output_name).is_file():
                    yield id_, path

    themes = [(args.theme, f'arts/ui/hometheme/[uc]{args.theme}.ab')] if args.theme else []
    backgrounds = [(args.background, f'arts/ui/homebackground/wrapper/{args.background}.ab')] if args.background else []
    if args.discover:
        themes = list(new_assets(r'arts/ui/hometheme/\[uc\](tm_[a-z0-9_]+)\.ab', 'layout.json'))
        backgrounds = list(new_assets(r'arts/ui/homebackground/wrapper/(bg_[a-z0-9_]+)\.ab', 'background.webp'))
    errors = []
    if themes:
        base_path, common_path = (BUNDLES[key][0] for key in ('home_page', 'common'))
        base, common = bundle('home_page', base_path), bundle('common', common_path)
        paths = [base_path, common_path]
        news = None
        if args.breaking_news:
            news_key = 'ui_home_act_banner_shop_h2_0'
            news_path = BUNDLES[news_key][0]
            news = bundle(news_key, news_path).sprites['Shop_mCard_1'], 'Monthly Card'
            paths.append(news_path)
        elif args.news_banner:
            news_path, sprite, label = args.news_banner
            news = bundle(Path(news_path).stem, news_path).sprites[sprite], label
            paths.append(news_path)
        for theme, path in themes:
            try:
                export_theme(base, common, bundle(theme, path), theme,
                             {key: checksums[key] for key in (*paths, path)}, args.art / theme,
                             news=news, assistant=args.assistant, assistant_frame=args.assistant_frame,
                             assistant_dialogue=args.assistant_dialogue, locale=args.locale)
            except (KeyError, ValueError, AttributeError, StopIteration) as error:
                if not args.discover:
                    raise
                errors.append(f'{theme}: {error}')
    for background, path in backgrounds:
        output = args.art / background
        output.mkdir(parents=True, exist_ok=True)
        try:
            export_background(bundle(background, path), background, output)
        except (KeyError, ValueError, AttributeError) as error:
            if not args.discover:
                raise
            errors.append(f'{background}: {error}')
    if args.discover:
        print(f'Imported {len(themes) + len(backgrounds) - len(errors)} new home cosmetics.')
    if errors:
        parser.exit(1, '\n'.join(errors) + '\n')


if __name__ == '__main__':
    main()
