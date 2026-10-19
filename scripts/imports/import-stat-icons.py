#!/usr/bin/env python3
"""Imports the game's stat glyphs into public/stat-icons/ as webp.

These are the icons the game puts beside a figure: ATK, DEF, RES, Block, ASPD, HP,
Redeploy, DP cost, and Sanity. The site drew its own versions of most of them,
because the handbook's icons live in a UI sprite atlas and none of the mirrors this
project pulls from publishes that atlas as files -- see the header of
components/enemies/EnemyStatIcons.tsx for the search that concluded so.

Two sources, because no single one has all of them:

  stat glyphs   the Global client's own operator info screen
                (ui/pages/character_info_page.ab, read from the official servers by
                client_bundles.py): icon_atk, icon_def, icon_res, icon_block,
                icon_attack_speed, icon_hp, icon_time (redeploy) and icon_cost. Each
                sprite is a white glyph on the screen's dark 23px tile, so the tile is
                keyed out by brightness and the glyph centred on 26px, the size these
                files have always had. (They came from Eltik/myrtle's copy until
                2026-10-19; that repo has no licence, and the client is the source.)

  sanity        AP_GAMEPLAY.png, which IS in cn-resource's item/ folder, so it
                comes off the local cache rather than the network.

Every one is pure white with an alpha channel, which is what lets them render as a
CSS mask and take currentColor -- faint beside a stat label, red beside a
life-point figure, correct on both themes. Converted LOSSLESS: they are 26px line
art where a lossy pass smears the strokes, and the files are under a kilobyte
either way.

Run:  python3 scripts/imports/import-stat-icons.py
"""
import importlib.util
import json
import os
import ssl
import sys
import urllib.parse
import urllib.request
from io import BytesIO

import certifi
from PIL import Image

_spec = importlib.util.spec_from_file_location('client_bundles', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'client_bundles.py'))
client_bundles = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(client_bundles)

# The Global client's operator info screen, and the sprite in it behind each of our names.
BUNDLE = 'ui/pages/character_info_page.ab'
SPRITES = {
    'icon_atk': 'atk',
    'icon_def': 'def',
    'icon_res': 'res',
    'icon_block': 'block',
    'icon_attack_speed': 'aspd',
    'icon_hp': 'hp',
    'icon_time': 'redeploy',
    'icon_cost': 'cost',
}
SIZE = 26

CN = os.environ.get('ARKPEDIA_CN', '.cache/upstream/cn-resource')


def glyph(sprite):
    """A white glyph on its screen's dark tile -> the same glyph, pure white on transparent,
    centred on SIZE px. Brightness is the alpha: the tile's near-black goes clear, the white
    strokes stay whole, and the anti-aliased edge between keeps its weight."""
    rgba = sprite.convert('RGBA')
    lum = rgba.convert('L')
    floor = lum.getextrema()[0]
    span = max(1, 255 - floor)
    alpha = lum.point(lambda v: max(0, min(255, round((v - floor) * 255 / span))))
    alpha = Image.composite(alpha, Image.new('L', rgba.size, 0), rgba.split()[3])
    white = Image.new('RGBA', rgba.size, (255, 255, 255, 0))
    white.putalpha(alpha)
    canvas = Image.new('RGBA', (SIZE, SIZE), (255, 255, 255, 0))
    canvas.alpha_composite(white, ((SIZE - rgba.width) // 2, (SIZE - rgba.height) // 2))
    return canvas


# Local, from the CN dump: the game's own sanity glyph.
LOCAL = {os.path.join(CN, 'item', 'AP_GAMEPLAY.png'): 'sanity'}
# From arknights.wiki.gg, which is the only place the enemy-count marker exists as a
# file. Unlike the eight above this one is COLOUR art with the word ENEMY set into it,
# so it renders in its own colours rather than as a mask -- see StatGlyph.
WIKI = {'File:Enemy icon.png': 'enemies'}
WIKI_API = 'https://arknights.wiki.gg/api.php'
# The wiki answers 403 to a request with no User-Agent, as its API policy says.
WIKI_UA = 'Arkpedia-import/1.0 (+https://arkpedia.net) python-urllib'

out_dir = os.path.join(os.getcwd(), 'public', 'stat-icons')

# This interpreter has no system CA bundle of its own, so the trust store is named
# explicitly rather than fetching over an unverified connection.
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())


def save(im, name):
    """Lossless webp, alpha kept -- the alpha IS the icon when it masks."""
    path = os.path.join(out_dir, f'{name}.webp')
    im.convert('RGBA').save(path, 'WEBP', lossless=True, method=6)
    return path, os.path.getsize(path)


def wiki_urls(titles):
    """title -> file url, resolved through the wiki's API."""
    query = urllib.parse.urlencode({
        'action': 'query', 'format': 'json', 'prop': 'imageinfo',
        'iiprop': 'url', 'titles': '|'.join(titles),
    })
    req = urllib.request.Request(f'{WIKI_API}?{query}', headers={'User-Agent': WIKI_UA})
    with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=60) as r:
        data = json.loads(r.read())
    out = {}
    for page in data.get('query', {}).get('pages', {}).values():
        if 'missing' in page:
            continue
        url = (page.get('imageinfo') or [{}])[0].get('url')
        if url:
            out[page['title']] = url
    return out


def main():
    os.makedirs(out_dir, exist_ok=True)
    written = []

    try:
        client = client_bundles.Client('en')
        found = {name: image for name, image in client_bundles.sprites(client.bundle(BUNDLE))}
    except Exception as exc:  # noqa: BLE001 -- any failure is the same failure
        print(f'FAILED {BUNDLE}: {exc}', file=sys.stderr)
        return 1
    missing = sorted(set(SPRITES) - set(found))
    if missing:
        print(f'FAILED {BUNDLE} at {client.version} has no {", ".join(missing)}: the screen was reworked', file=sys.stderr)
        return 1
    for sprite, name in sorted(SPRITES.items()):
        im = glyph(found[sprite])
        path, size = save(im, name)
        written.append((name, im.size, size, f'{sprite} ({client.version})'))

    for src, name in LOCAL.items():
        if not os.path.exists(src):
            print(f'FAILED {name}: {src} not found -- is the CN cache present?', file=sys.stderr)
            return 1
        im = Image.open(src)
        path, size = save(im, name)
        written.append((name, im.size, size, os.path.basename(src)))

    for title, url in wiki_urls(list(WIKI)).items():
        name = WIKI[title]
        req = urllib.request.Request(url, headers={'User-Agent': WIKI_UA})
        try:
            with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=60) as r:
                raw = r.read()
        except Exception as exc:  # noqa: BLE001
            print(f'FAILED {title}: {exc}', file=sys.stderr)
            return 1
        im = Image.open(BytesIO(raw))
        path, size = save(im, name)
        written.append((name, im.size, size, title))

    for name, dims, size, src in sorted(written):
        print(f'  {name+".webp":16} {dims[0]}x{dims[1]:<4} {size:5} bytes   <- {src}')
    print(f'{len(written)} icons -> public/stat-icons/')
    return 0


if __name__ == '__main__':
    sys.exit(main())
