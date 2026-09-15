#!/usr/bin/env python3
"""Swaps CN key art for the EN upload once global has the banner or event.

Covers both kinds of key art the front page shows: headhunting banners
(data/headhunting_banners.json -> public/headhunting-banner-images/) and event
posters (data/events/events_<year>.json -> public/event-poster/).

Banner images are collected while the banner is still CN-only, so the file on
disk is the CN client's art -- Chinese title, CN run dates baked into the
pixels. The EN wiki uploads the global art as `File:EN <name> banner.png`
around each global release; this walks every banner whose global window has
started (or starts within the week) and is not long over, and replaces the
local image with that upload when it exists.

Idempotence lives in data/banner_art_sources.json: the wiki file's sha1 is
recorded per banner, so an unchanged upload is never downloaded twice, and
the record travels with the repo the way the rest of the pipeline's data
does. A banner with no EN upload yet is reported and retried next run.

Run:  python3 scripts/sync-banner-art.py
"""
import datetime
import glob
import json
import os
import re
import ssl
import urllib.parse
import urllib.request
from io import BytesIO

import certifi
from PIL import Image

CTX = ssl.create_default_context(cafile=certifi.where())
UA = 'Arkpedia-import/1.0 (+https://arkpedia.net) python-urllib'
WIKI_API = 'https://arknights.wiki.gg/api.php'

root = os.getcwd()
BANNERS_AT = os.path.join(root, 'data', 'headhunting_banners.json')
EVENTS_DIR = os.path.join(root, 'data', 'events')
SOURCES_AT = os.path.join(root, 'data', 'banner_art_sources.json')

# The window worth syncing: art shows up on the wiki about a week early, and a
# banner more than ~45 days done is history whose art nobody is looking at.
SOON = datetime.timedelta(days=7)
RECENT = datetime.timedelta(days=45)


def fetch(url, timeout=120):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, context=CTX, timeout=timeout) as r:
        return r.read()


def parse_range(text):
    if not text:
        return None
    parts = [p.strip() for p in re.split('[–-]', text) if p.strip()]
    if len(parts) != 2:
        return None
    try:
        a = datetime.datetime.strptime(parts[0], '%Y/%m/%d').date()
        z = datetime.datetime.strptime(parts[1], '%Y/%m/%d').date()
        return a, z
    except ValueError:
        return None


def wiki_titles(name):
    """Every spelling worth trying, best first. The wiki drops the '#' and our
    '(Global)' suffix ('Standard Pool #173 (Global)' is its 'EN Standard Pool
    173 banner.png'), writes our bracketed prefixes as nothing, and numbers an
    event's halves as Parts ('Alliance 2nd Half' is 'Alliance Part 2'). The
    bare, suffix-stripped name is tried LAST: an event that never split has
    only that one, and a rerun falls back to its original's art."""
    base = re.sub(r'^\[[^\]]*\]\s*', '', name).replace('#', '').replace(' (Global)', '').strip()
    halves = {'1st Half': 'Part 1', '2nd Half': 'Part 2', 'Part One': 'Part 1', 'Part Two': 'Part 2'}
    cands = [base]
    cands += [base.replace(k, v) for k, v in halves.items() if k in base]
    cands.append(re.sub(r'\s+(?:1st|2nd)\s+Half$', '', base))
    cands.append(re.sub(r'\s+Rerun$', '', base))
    seen, out = set(), []
    for c in cands:
        if c and c not in seen:
            seen.add(c)
            out.append(f'File:EN {c} banner.png')
    return out


def wiki_image(titles):
    """The first of these titles the wiki actually holds, with its sha1. One
    query for all of them, then OUR preference order rather than the API's --
    it answers in page-id order and normalises titles on the way."""
    q = urllib.parse.urlencode({
        'action': 'query', 'prop': 'imageinfo', 'iiprop': 'url|sha1',
        'format': 'json', 'titles': '|'.join(titles),
    })
    data = json.loads(fetch(f'{WIKI_API}?{q}'))['query']
    found = {}
    for p in data['pages'].values():
        if 'missing' not in p and p.get('imageinfo'):
            found[p['title']] = p['imageinfo'][0]
    renamed = {n['from']: n['to'] for n in data.get('normalized', [])}
    for t in titles:
        hit = found.get(renamed.get(t, t))
        if hit:
            return hit
    return None


def art_jobs():
    """(name, global window, image path) for every banner and event whose art
    is worth checking -- the two files are shaped differently and this is the
    only place that has to know."""
    for b in json.load(open(BANNERS_AT, encoding='utf-8')):
        yield b['name'], parse_range(b.get('global_date')), b.get('banner_image')
    for path in sorted(glob.glob(os.path.join(EVENTS_DIR, 'events_*.json'))):
        for e in json.load(open(path, encoding='utf-8')):
            window = (e.get('global') or {}).get('dateRange')
            yield e['name'], parse_range(window), e.get('poster')


sources = {}
if os.path.exists(SOURCES_AT):
    sources = json.load(open(SOURCES_AT, encoding='utf-8'))

today = datetime.date.today()
swapped, waiting = [], []
for name, window, image in art_jobs():
    if not window or not image:
        continue
    start, end = window
    if start > today + SOON or end < today - RECENT:
        continue
    out = os.path.join(root, 'public', image.lstrip('/'))
    if not os.path.exists(out):
        continue  # nothing on disk to replace; the scrape owns creating it
    info = wiki_image(wiki_titles(name))
    if not info:
        waiting.append(name)
        continue
    if sources.get(name) == info['sha1']:
        continue  # already carrying this exact upload
    im = Image.open(BytesIO(fetch(info['url']))).convert('RGB')
    if im.width > 1024:  # the folders' own convention
        im = im.resize((1024, round(im.height * 1024 / im.width)), Image.LANCZOS)
    im.save(out, 'WEBP', quality=85)
    sources[name] = info['sha1']
    swapped.append(name)
    print(f'  + {name} ({im.width}x{im.height})')

with open(SOURCES_AT, 'w', encoding='utf-8') as f:
    json.dump(dict(sorted(sources.items())), f, indent=2, ensure_ascii=False)
    f.write('\n')

print(f'{len(swapped)} swapped to EN art, {len(waiting)} still CN-only')
for n in waiting:
    print(f'  ? "{n}" has no EN upload yet -- retried next run')
