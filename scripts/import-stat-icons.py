#!/usr/bin/env python3
"""Imports the game's stat glyphs into public/stat-icons/ as webp.

These are the icons the game puts beside a figure: ATK, DEF, RES, Block, ASPD, HP,
Redeploy, DP cost, and Sanity. The site drew its own versions of most of them,
because the handbook's icons live in a UI sprite atlas and none of the mirrors this
project pulls from publishes that atlas as files -- see the header of
components/EnemyStatIcons.tsx for the search that concluded so.

Two sources, because no single one has all of them:

  stat glyphs   Eltik/myrtle mirrors the atlas as individual 26x26 PNGs, which is
                the gap the earlier search could not fill. The commit is pinned so
                a re-run fetches the same files. NOTE: that repo carries no
                licence. The art itself is Hypergryph's, the same as every other
                game asset on this site and the same as what the other unofficial
                mirrors (yuanyan3060, fexli, Aceship) redistribute -- the repo is a
                convenient mirror of it, not its author. If it ever goes away, or a
                first-party extraction is preferred, these nine files are the only
                thing to replace.

  sanity        AP_GAMEPLAY.png, which IS in cn-resource's item/ folder, so it
                comes off the local cache rather than the network.

Every one is pure white with an alpha channel, which is what lets them render as a
CSS mask and take currentColor -- faint beside a stat label, red beside a
life-point figure, correct on both themes. Converted LOSSLESS: they are 26px line
art where a lossy pass smears the strokes, and the files are under a kilobyte
either way.

Run:  python3 scripts/import-stat-icons.py
"""
import json
import os
import ssl
import sys
import urllib.parse
import urllib.request
from io import BytesIO

import certifi
from PIL import Image

# Pinned: bumping this picks up whatever the mirror has re-extracted since.
REPO_COMMIT = '0ff3dd71ad9e6d2f06ab440675760c818c1dcc00'
RAW = f'https://raw.githubusercontent.com/Eltik/myrtle/{REPO_COMMIT}/frontend/public/stat-icons'

CN = os.environ.get('ARKPEDIA_CN', '.cache/upstream/cn-resource')

# Upstream name -> ours. Lowercase, matching public/enemy-stat-icons/.
REMOTE = {
    'ATK': 'atk',
    'DEF': 'def',
    'RES': 'res',
    'BLOCK': 'block',
    'ASPD': 'aspd',
    'HP': 'hp',
    'RDP': 'redeploy',
    'COST': 'cost',
}
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

    for remote, name in sorted(REMOTE.items()):
        url = f'{RAW}/{remote}.png'
        try:
            with urllib.request.urlopen(url, context=SSL_CONTEXT, timeout=30) as r:
                raw = r.read()
        except Exception as exc:  # noqa: BLE001 -- any failure is the same failure
            print(f'FAILED {remote}: {exc}', file=sys.stderr)
            return 1
        im = Image.open(BytesIO(raw))
        path, size = save(im, name)
        written.append((name, im.size, size, remote))

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
