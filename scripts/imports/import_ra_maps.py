#!/usr/bin/env python3
"""Imports the Reclamation Algorithm stage maps from arknights.wiki.gg.

All 106 RA stages came through with preview: null, and it was not a resolution bug --
the renders are genuinely not in cn-resource. That repo publishes map/, avatar/,
enemy/, skill/, portrait/, skin/, item/ and building_skill/, and not one of its 3,055
map/ renders is sandbox-named; the only sandbox images in the whole repo are two item
icons. RA stage ids are level paths ("obt/sandbox/sandbox_1/level_sandbox1_65") rather
than the render ids map/ is keyed by, so there was nothing to match either.

The wiki does have them, one per stage, named after the stage rather than its id.
Three naming forms, in the order tried here:

  "<name> map.png"                              83 of 102 names
  "<name> (Tales Within the Sand) map.png"      15 more -- the wiki disambiguates a
                                                name an event stage also uses
  apostrophes dropped                           the last 4: the wiki writes
                                                'Treasury' as Treasury and
                                                The Lost 'Zhayedan' as
                                                The Lost Zhayedan (Tales Within the
                                                Sand)

102 distinct names cover all 106 stages -- four names are shared by two stages each,
which take the same map.

Output is public/stages-images/, the same folder and the same webp the rest of the
preview set uses, keyed by stage slug so getStagePreviewFile finds it without a
lookup table. Written back into each stage record's `preview` too, so the field means
the same thing for RA as for everything else.

Run:  python3 scripts/imports/import_ra_maps.py
"""
from published_assets import published_assets
import json
import os
import ssl
import sys
import urllib.parse
import urllib.request
from io import BytesIO

import certifi
from PIL import Image

API = 'https://arknights.wiki.gg/api.php'
# The wiki rejects a request with no User-Agent outright (403), as its API policy says
# it will. Naming the project is also just the polite thing to do.
UA = 'Arkpedia-import/1.0 (+https://arkpedia.net) python-urllib'

root = os.getcwd()
stages_dir = os.path.join(root, 'data', 'stages')
out_dir = os.path.join(root, 'public', 'stages-images')

SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())


def api(params):
    url = f'{API}?{urllib.parse.urlencode(params)}'
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=60) as r:
        return json.loads(r.read())


def candidates(name):
    """The forms the wiki files a stage's map under, best first."""
    bare = name.replace("'", '').replace('’', '')
    seen = []
    for stem in (name, f'{name} (Tales Within the Sand)', bare, f'{bare} (Tales Within the Sand)'):
        title = f'File:{stem} map.png'
        if title not in seen:
            seen.append(title)
    return seen


def resolve(names):
    """name -> the url of its map, for every name the wiki has one for."""
    wanted = {}
    for n in names:
        for title in candidates(n):
            wanted.setdefault(title, n)

    titles = list(wanted)
    urls = {}
    for i in range(0, len(titles), 40):
        batch = titles[i:i + 40]
        data = api({
            'action': 'query', 'format': 'json', 'prop': 'imageinfo',
            'iiprop': 'url', 'titles': '|'.join(batch),
        })
        for page in data.get('query', {}).get('pages', {}).values():
            if 'missing' in page:
                continue
            info = (page.get('imageinfo') or [{}])[0]
            url = info.get('url')
            name = wanted.get(page['title'])
            # First candidate form wins, so a plain name is never overwritten by the
            # disambiguated file of a different stage.
            if url and name and name not in urls:
                urls[name] = (page['title'], url)
    return urls


def main():
    os.makedirs(out_dir, exist_ok=True)

    records = {}
    for entry in sorted(os.listdir(stages_dir)):
        if not entry.endswith('.json'):
            continue
        path = os.path.join(stages_dir, entry)
        with open(path) as fh:
            stage = json.load(fh)
        if (stage.get('content') or {}).get('kind') != 'reclamation':
            continue
        records[stage['slug']] = (path, stage)

    if not records:
        print('no reclamation stages found -- nothing to do')
        return 0

    names = sorted({s.get('name') for _, s in records.values() if s.get('name')})
    print(f'{len(records)} RA stages, {len(names)} distinct names')
    urls = resolve(names)
    print(f'  the wiki has a map for {len(urls)} of them')

    fetched = {}
    written = 0
    for slug, (path, stage) in sorted(records.items()):
        name = stage.get('name')
        if f'stages-images/{slug}.webp' in published_assets() and not os.environ.get('ARKPEDIA_REFETCH'):
            stage['preview'] = f'images/stages/{slug}.png'
            with open(path, 'w') as fh:
                json.dump(stage, fh, ensure_ascii=False, separators=(',', ':'))
            written += 1
            continue
        hit = urls.get(name)
        if not hit:
            print(f'  no map: {slug} ({name})')
            continue
        title, url = hit
        # Already imported: the record's preview is all that needs restoring, which is
        # the normal case after a pipeline run rewrites these records from the level
        # files. Re-fetching 106 images off the wiki to arrive at the same bytes is
        # rude to it and slow for us. ARKPEDIA_REFETCH=1 forces the download.
        target = os.path.join(out_dir, f'{slug}.webp')
        if os.path.exists(target) and not os.environ.get('ARKPEDIA_REFETCH'):
            stage['preview'] = f'images/stages/{slug}.png'
            with open(path, 'w') as fh:
                json.dump(stage, fh, ensure_ascii=False, separators=(',', ':'))
            written += 1
            continue
        if url not in fetched:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            try:
                with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=90) as r:
                    fetched[url] = r.read()
            except Exception as exc:  # noqa: BLE001
                print(f'  FAILED {title}: {exc}', file=sys.stderr)
                continue
        # Keyed by slug, so two stages sharing a name each get their own file rather
        # than one of them pointing at the other's.
        im = Image.open(BytesIO(fetched[url])).convert('RGB')
        im.save(os.path.join(out_dir, f'{slug}.webp'), 'WEBP', quality=80, method=6)

        stage['preview'] = f'images/stages/{slug}.png'
        # Minified and with no trailing newline, which is how the pipeline writes
        # these -- anything else reformats all 106 files into a diff that hides the
        # one field that actually changed.
        with open(path, 'w') as fh:
            json.dump(stage, fh, ensure_ascii=False, separators=(',', ':'))
        written += 1

    print(f'{written} maps -> public/stages-images/, and preview set on their records')
    return 0


if __name__ == '__main__':
    sys.exit(main())
