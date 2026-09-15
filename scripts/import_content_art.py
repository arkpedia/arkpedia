#!/usr/bin/env python3
"""Imports per-content art into public/content-art/, keyed by CONTENT ID.

Two gaps this fills, both visible as a stage map standing in for a whole chapter or
mode on the stages landing page:

  main story    Every episode has its own art in game -- the square emblem the
                Terminal shows for it -- and the site had none, so a chapter was
                represented by whichever of its stages happened to have a render.
                The announcement banner exists too, but the in-game art is what the
                game itself puts on the episode.

  permanent     Reclamation Algorithm and Integrated Strategies get no event banner
  modes         and, deliberately, no name-matched one either: posterFor() restricts
                that to event and story kinds because matching a mode by name is how
                Annihilation Bolívar came to show the poster for "Bolívar Diagnosed".
                Keying by content id instead of by name is what makes this safe.

  Trials for    A special case worth naming: its banners were already sitting in
  Navigator     public/event-poster/, and nothing used them. The name-matched path
                goes through the schedule's event list, and TN is not in it, so six
                files were in the repo and six cards were blank.

KEYED BY ID ON PURPOSE. Every entry below is written out by hand, so there is no
fuzzy match to go wrong: an id either has art or it does not.

Run:  python3 scripts/import_content_art.py
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
out_dir = os.path.join(os.getcwd(), 'public', 'content-art')

API = 'https://arknights.wiki.gg/api.php'
# The wiki answers 403 to a request with no User-Agent, as its API policy says, and
# wants to know who is asking.
UA = 'Arkpedia-import/1.0 (+https://arkpedia.net) python-urllib'
# Image hosts are less accommodating: imgur answers 429 to the UA above and 200 to a
# browser's, so a plain file fetch off a CDN asks the ordinary way.
CDN_UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
          '(KHTML, like Gecko) Chrome/124.0 Safari/537.36')


def fetch(url):
    ua = UA if 'arknights.wiki.gg' in url or 'wiki.gg' in url else CDN_UA
    req = urllib.request.Request(url, headers={'User-Agent': ua})
    with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=90) as r:
        return r.read()

# content id -> where its art comes from. Either a "File:..." title on the wiki, or a
# direct URL.
#
# main_0 is the Prologue, which the wiki files under that name rather than as
# Episode 00. EP 15 and EP 16 shipped inside activity zones, so their ids are not
# main_N.
#
# sandbox_1 is a direct URL rather than a wiki title on purpose. The wiki's
# "EN Tales Within the Sand banner.png" is the ANNOUNCEMENT banner, a different
# picture; this is the mode's own key visual, the one with the title treatment on it.
# imgur is a weaker source than the wiki -- if it ever 404s this entry fails and the
# committed webp is what the site keeps using, which is the right way round.
ART = {
    'main_0': 'File:Prologue.png',
    **{f'main_{n}': f'File:Episode {n:02d}.png' for n in range(1, 15)},
    'act2mainss_zone1': 'File:Episode 15.png',
    'act3mainss_zone1': 'File:Episode 16.png',
    'sandbox_1': 'https://i.imgur.com/HFKNni1.png',

    # Integrated Strategies, one release banner per season. CN because the wiki has no
    # EN upload for any of them. IS4's file drops the special letter: the wiki files
    # Jǫklumarkar as Joklumarkar.
    'rogue_1': "File:CN Phantom & Crimson Solitaire banner.png",
    'rogue_2': "File:CN Mizuki & Caerula Arbor banner.png",
    'rogue_3': "File:CN Expeditioner's Joklumarkar banner.png",
    'rogue_4': "File:CN Sarkaz's Furnaceside Fables banner.png",
    'rogue_5': "File:CN Sui's Garden of Grotesqueries banner.png",

    # Trials for Navigator. Its banners were already in public/event-poster/, but the
    # name-matched path never found them: that goes through the schedule's event list,
    # and TN is not in it, so the file sat there unused. Keyed by id it just works.
    # Note the filenames carry no "#", unlike the content names.
    **{f'act{n}bossrush': f'File:EN Trials for Navigator {n} banner.png' for n in range(1, 7)},

    # Contingency Contract Battleplan. No season has an announcement banner on the
    # wiki -- there is none to find -- so this is the engraved medal art, the only
    # per-season art that exists. It carries the season's logo and colours down the
    # left, and at 1375x459 it is a ratio of 3.0 against a real banner's 3.12, so it
    # fills a card without cropping. The OST covers are the other candidate and are
    # cleaner art, but they are square: a wide card would crop their logo off.
    'crisis_v2_season_1_1': 'File:Battleplan Pyrolysis Engraved Medal Set.png',
    'crisis_v2_season_2_1': 'File:Battleplan Underdawn Engraved Medal Set.png',
    'crisis_v2_season_3_1': 'File:Battleplan Extinguished Sins Engraved Medal Set.png',
    'crisis_v2_season_4_1': 'File:Battleplan Arclight Engraved Medal Set.png',
}


def api(params):
    url = f'{API}?{urllib.parse.urlencode(params)}'
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=60) as r:
        return json.loads(r.read())


def main():
    os.makedirs(out_dir, exist_ok=True)

    # A direct URL needs no lookup; only wiki titles do.
    titles = sorted({v for v in ART.values() if v.startswith('File:')})
    urls = {v: v for v in ART.values() if not v.startswith('File:')}
    for i in range(0, len(titles), 40):
        data = api({
            'action': 'query', 'format': 'json', 'prop': 'imageinfo',
            'iiprop': 'url', 'titles': '|'.join(titles[i:i + 40]),
        })
        for page in data.get('query', {}).get('pages', {}).values():
            if 'missing' in page:
                print(f'  not on the wiki: {page["title"]}', file=sys.stderr)
                continue
            url = (page.get('imageinfo') or [{}])[0].get('url')
            if url:
                urls[page['title']] = url

    written = 0
    for content_id, title in sorted(ART.items()):
        url = urls.get(title)
        if not url:
            print(f'  skipped {content_id}: no url for {title}')
            continue
        try:
            raw = fetch(url)
        except Exception as exc:  # noqa: BLE001
            print(f'  FAILED {content_id} ({title}): {exc}', file=sys.stderr)
            continue
        im = Image.open(BytesIO(raw)).convert('RGB')
        path = os.path.join(out_dir, f'{content_id}.webp')
        im.save(path, 'WEBP', quality=82, method=6)
        print(f'  {content_id+".webp":24} {im.size[0]}x{im.size[1]:<5} '
              f'{round(os.path.getsize(path)/1024):4}KB  <- {title}')
        written += 1

    print(f'{written} of {len(ART)} -> public/content-art/')
    return 0 if written else 1


if __name__ == '__main__':
    sys.exit(main())
