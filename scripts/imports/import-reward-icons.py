#!/usr/bin/env python3
"""Fetches the reward-item icons the event stores reference into
public/material-icons/, so a future banner's rewards never render as broken
placeholders while the event is still CN-only.

CN FIRST, GLOBAL TAKES OVER BY ITSELF. Global runs six-odd months behind CN, so
the events data regularly names items the EN client has not shipped -- some
under hand-translated names, some still under their CN names. The art is the
same on both servers, so an icon fetched from a CN source IS the final icon;
what changes at global launch is the item's display NAME in the events data.
Since these files are keyed by display name, the moment a name flips from CN
to its official EN spelling this importer sees a "new" missing icon and
resolves it again -- by then the EN item table carries it. The CN-named file
it replaces goes stale and harmless; it is reported, not deleted, because
nothing breaks by keeping it and an importer should not delete what it cannot
reproduce.

WHERE ICONS LIVE, tried in order:

  1. item_table (EN, then CN) name -> iconId, art from the CN resource repo's
     item/ tree. Covers materials, tickets, packs, and operator tokens.
  2. building_data (EN, then CN) furniture name -> iconId, art from
     prts.wiki's asset CDN -- furniture art is in NO gamedata mirror at all
     (established by searching both repos' full file trees).
  3. The EN wiki's File:<name>.png uploads, for items the wiki has translated
     ahead of the client (CC store machines and the like).

Entries typed "skin" are NOT items: they resolve through the skins dataset
(findSkinIconPath) and appear when the skin itself lands there. "Furniture
not found" is the EN wiki's own missing-item placeholder scraped into the CC
store data; it is skipped and reported so the scrape gets fixed instead.

Run:  python3 scripts/imports/import-reward-icons.py
"""
from published_assets import published_assets
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

SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
UA = 'Arkpedia-import/1.0 (+https://arkpedia.net) python-urllib'

root = os.getcwd()
EN = os.path.join(os.environ.get('ARKPEDIA_EN', '.cache/upstream/en-gamedata/en'), 'gamedata', 'excel')
CN = os.path.join(os.environ.get('ARKPEDIA_CN', '.cache/upstream/cn-resource'), 'gamedata', 'excel')
RAW_EN = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/en/gamedata/excel'
RAW_CN = 'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/gamedata/excel'
ITEM_ART = 'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/item'
FURNI_ART = 'https://torappu.prts.wiki/assets/furniture'
WIKI_API = 'https://arknights.wiki.gg/api.php'

# Names that look like items but are not: the wiki's own missing-furniture
# placeholder, scraped into the data. Skipped loudly rather than hunted.
NOT_REAL = {'Furniture not found'}

out_dir = os.path.join(root, 'public', 'material-icons')


def fetch(url, timeout=90):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=timeout) as r:
        return r.read()


def table(local_dir, raw_base, name):
    at = os.path.join(root, local_dir, name)
    if os.path.exists(at):
        with open(at, encoding='utf-8') as f:
            return json.load(f)
    return json.loads(fetch(f'{raw_base}/{name}'))


def safe(name):
    """The same character filter getMaterialIconPath applies, so the file this
    writes is the file the page asks for."""
    return re.sub(r'[\\/*?:"<>|]', '', name).strip()


# --- what the event stores want ---------------------------------------------------

wanted = {}
for path in sorted(glob.glob(os.path.join(root, 'data', 'events', 'events_*.json'))):
    with open(path, encoding='utf-8') as f:
        rows = json.load(f)
    for ev in rows:
        rw = ev.get('rewards')
        for block in rw if isinstance(rw, list) else ([rw] if rw else []):
            for item in (block or {}).get('items', []):
                # A reward renamed to its Global name keeps showing the published
                # CN-named file until an EN-named one exists (sync-reward-names.mjs),
                # so that is the file it needs. Fetching the EN name here would put an
                # unpublished file in public/ and fail check:assets.
                name = item.get('iconName') or item.get('name')
                # Skins resolve through the skins dataset, not this folder.
                if name and item.get('type') != 'skin':
                    wanted.setdefault(name, ev['name'])

missing = {
    n: ev for n, ev in wanted.items()
    if n not in NOT_REAL and f'material-icons/{safe(n)}.webp' not in published_assets()
    and not os.path.exists(os.path.join(out_dir, f'{safe(n)}.webp'))
}
skipped_placeholders = sorted(n for n in wanted if n in NOT_REAL)

if not missing:
    print('Every event reward already has its icon.')
    for n in skipped_placeholders:
        print(f'  (still in the data and still not a real item: "{n}")')
    raise SystemExit(0)

# --- resolve each name to a URL, cheapest source first ----------------------------

items_en = table(EN, RAW_EN, 'item_table.json')['items']
items_cn = table(CN, RAW_CN, 'item_table.json')['items']
by_name = {}
for src in (items_cn, items_en):  # EN written second so it wins ties
    for it in src.values():
        if it.get('name') and it.get('iconId'):
            by_name[it['name']] = it['iconId']

furniture_by_name = None  # loaded lazily: building_data is heavyweight


def furniture_icon(name):
    global furniture_by_name
    if furniture_by_name is None:
        furniture_by_name = {}
        for local_dir, raw in ((CN, RAW_CN), (EN, RAW_EN)):  # EN wins ties
            data = table(local_dir, raw, 'building_data.json')
            for f in data.get('customData', {}).get('furnitures', {}).values():
                if f.get('name') and f.get('iconId'):
                    furniture_by_name[f['name']] = f['iconId']
    return furniture_by_name.get(name)


def wiki_file(name):
    q = urllib.parse.urlencode({
        'action': 'query', 'prop': 'imageinfo', 'iiprop': 'url',
        'format': 'json', 'titles': f'File:{name}.png',
    })
    pages = json.loads(fetch(f'{WIKI_API}?{q}'))['query']['pages']
    for p in pages.values():
        if 'missing' not in p and p.get('imageinfo'):
            return p['imageinfo'][0]['url']
    return None


fetched, unresolved = [], []
for name, event in sorted(missing.items()):
    url = None
    icon = by_name.get(name)
    if icon:
        url = f'{ITEM_ART}/{urllib.parse.quote(icon)}.png'
    else:
        icon = furniture_icon(name)
        if icon:
            url = f'{FURNI_ART}/{urllib.parse.quote(icon)}.png'
        else:
            url = wiki_file(name)
    if not url:
        unresolved.append((name, event))
        continue
    try:
        im = Image.open(BytesIO(fetch(url))).convert('RGBA')
    except Exception as e:  # noqa: BLE001 -- a 404 here is data, not a crash
        unresolved.append((name, f'{event} (fetch failed: {e})'))
        continue
    # 96px: crisp at the 36px the reward rows render, retina included, without
    # carrying the mirrors' full-size art in the repo.
    im.thumbnail((96, 96), Image.LANCZOS)
    out = os.path.join(out_dir, f'{safe(name)}.webp')
    im.save(out, 'WEBP', quality=90)
    fetched.append(name)
    print(f'  + {safe(name)}.webp  ({im.size[0]}x{im.size[1]}, from {url.split("/")[2]})')

print(f'{len(fetched)} fetched, {len(unresolved)} unresolved')
for name, why in unresolved:
    print(f'  ? "{name}" ({why}) -- not in the item tables, furniture data, or the EN wiki yet')
for n in skipped_placeholders:
    print(f'  ! "{n}" is the wiki\'s missing-item placeholder scraped into the data -- fix the scrape')
