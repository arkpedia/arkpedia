#!/usr/bin/env python3
"""Imports the main story's act wordmarks into public/act-marks/ as webp.

The four marks the game sets above an act's name on the Score screen. They are
white line-art on transparency at 86x33, so they go through LOSSLESS webp with the
alpha kept: a lossy pass smears 1px strokes, and flattening the alpha would put a
white box on a black page.

WHICH MARK BELONGS TO WHICH ACT. chapter_table has four acts and the wiki has four
marks -- I, II, III and `initium`, Latin for "the beginning" -- because the game does
not number the first one:

    chapter_0  Hour of An Awakening    Act initium   ("act 0")
    chapter_1  Shatter of A Vision     Act I
    chapter_2  Shadow of A Dying Sun   Act II
    chapter_3  Nexus Point of Future   Act III

Nothing in the gamedata ties a mark to a chapter, so this comes from the game itself:
the numbering was confirmed by a player, and it agrees with a screenshot of the live
Score screen showing "Act III" over NEXUS POINT OF FUTURE, which is chapter_3.

Run:  python3 scripts/import-act-marks.py
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

SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
out_dir = os.path.join(os.getcwd(), 'public', 'act-marks')

API = 'https://arknights.wiki.gg/api.php'
# The wiki answers 403 to a request with no User-Agent, as its API policy says.
UA = 'Arkpedia-import/1.0 (+https://arkpedia.net) python-urllib'

# our file name -> wiki title
MARKS = {
    'initium': 'File:Act initium.png',
    'i': 'File:Act I.png',
    'ii': 'File:Act II.png',
    'iii': 'File:Act III.png',
}


def api(params):
    url = f'{API}?{urllib.parse.urlencode(params)}'
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=60) as r:
        return json.loads(r.read())


def main():
    os.makedirs(out_dir, exist_ok=True)
    data = api({
        'action': 'query', 'format': 'json', 'prop': 'imageinfo',
        'iiprop': 'url', 'titles': '|'.join(sorted(MARKS.values())),
    })
    urls = {}
    for page in data.get('query', {}).get('pages', {}).values():
        if 'missing' in page:
            print(f'  not on the wiki: {page["title"]}', file=sys.stderr)
            continue
        url = (page.get('imageinfo') or [{}])[0].get('url')
        if url:
            urls[page['title']] = url

    written = 0
    for name, title in sorted(MARKS.items()):
        url = urls.get(title)
        if not url:
            print(f'  skipped {name}: no url for {title}')
            continue
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=60) as r:
            raw = r.read()
        # RGBA, lossless: white strokes on transparency, and the page behind them
        # is not white.
        im = Image.open(BytesIO(raw)).convert('RGBA')
        path = os.path.join(out_dir, f'{name}.webp')
        im.save(path, 'WEBP', lossless=True, method=6)
        print(f'  {name+".webp":14} {im.size[0]}x{im.size[1]:<4} '
              f'{round(os.path.getsize(path)/1024):3}KB  <- {title}')
        written += 1

    print(f'{written} of {len(MARKS)} -> public/act-marks/')
    return 0 if written == len(MARKS) else 1


if __name__ == '__main__':
    sys.exit(main())
