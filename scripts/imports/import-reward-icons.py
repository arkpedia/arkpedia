#!/usr/bin/env python3
"""Finds the reward-item icons the event stores reference and stages them in
.cache/reward-icons/, so a future banner's rewards never render as broken
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

None of these sources can fail the refresh. A name no source resolves, or whose
download fails, renders without an icon and goes on the quarantine list under
'reward-icons'; the next run tries it again. The reason says which step failed and
never the day's error text, which goes to the log: data/quarantine.json is a release
input, and an outage that answers 502 one day and refuses the connection the next must
not publish a release each day.

NOTHING HERE PUBLISHES. Art reaches readers only through arkpedia-image-assets,
and a file in this repository's public/ is refused by check:assets, which the
daily release runs: writing the icon there turned every SUCCESSFUL fetch into a
blocked release. A fetched icon is therefore staged in .cache/reward-icons/, as its
source serves it (staged_art.py): the game's own circled art, which the publisher keeps
at its native 183px, never shrunk. The release's staged-art stage publishes it as
material-icons/<name>.webp and runs this again; until a run does, it is reported under
'reward-icons' too, with its source.

Run:  python3 scripts/imports/import-reward-icons.py
"""
from published_assets import published_assets
from quarantine import WIKI_API as WIKI_API_URL, report
from staged_art import Staging
import glob
import json
import os
import re
import ssl
import subprocess
import time
import urllib.error
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


def pinned(variable, branch):
    """The commit this run pinned for a mirror (scripts/content/pin-upstream.mjs; the
    stage runner passes it in), else its branch, as before pinning."""
    commit = os.environ.get(variable) or ''
    return commit if re.fullmatch(r'[0-9a-f]{40}', commit) else branch


PIN_UPSTREAM = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'content', 'pin-upstream.mjs')


def cn_tables():
    """The CN tables' raw folder: the mirror and commit this run settled on for every CN table
    (scripts/content/cn-tables.mjs; the stage runner passes them in as ARKPEDIA_CN_TABLES),
    else -- run by hand -- the primary mirror at its pin, else its branch. pin-upstream.mjs
    works it out (cnTableUrl()), so this script names no CN mirror and reads no mirror's pin
    for a table: at one mirror's pin it would read another mirror, or another commit, than
    the rest of the run on a day upstream-cn fell back."""
    result = subprocess.run(['node', PIN_UPSTREAM, 'cn-table-url', 'excel'], capture_output=True, text=True)
    if result.returncode:
        raise SystemExit(f'Could not tell which CN tables this run reads:\n{result.stderr.strip()}')
    return result.stdout.strip()


EN_REF = pinned('ARKPEDIA_PIN_ARKNIGHTSASSETS_ARKNIGHTSGAMEDATA', 'master')
CN_REF = pinned('ARKPEDIA_PIN_YUANYAN3060_ARKNIGHTSGAMERESOURCE', 'main')
RAW_EN = f'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/{EN_REF}/en/gamedata/excel'
RAW_CN = cn_tables()
ITEM_ART = f'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/{CN_REF}/item'
FURNI_ART = 'https://torappu.prts.wiki/assets/furniture'
WIKI_API = WIKI_API_URL

# Names that look like items but are not: the wiki's own missing-furniture
# placeholder, scraped into the data. Skipped loudly rather than hunted.
NOT_REAL = {'Furniture not found'}

ITEM_MIRROR = 'yuanyan3060/ArknightsGameResource'


def fetch(url, timeout=90, attempts=3):
    # A dropped connection is retried: a run fetching hundreds of icons meets the odd one
    # (an SSL EOF from prts.wiki's CDN on 2026-10-05).
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError:
            raise  # an answer, not a dropped connection
        except (ssl.SSLError, ConnectionError, TimeoutError, urllib.error.URLError) as error:
            reason = getattr(error, 'reason', error)
            dropped = isinstance(reason, (ssl.SSLError, ConnectionError, TimeoutError))
            if not dropped or attempt == attempts - 1:
                raise
            time.sleep(2 * (attempt + 1))


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


# --- what the event pages want --------------------------------------------------

# Each icon a page asks for, by the file it asks for: {target: (name, event, furniture id or None)}.
# A reward is asked for under its name (material-icons/<name>.webp); a piece of furniture the game
# names by id under its id (material-icons/<id>.webp, rewardIconPath in lib/events/rewardIcons.ts),
# because two events' "Duel Trophy" are different pieces with different art.
wanted = {}


def want_name(name, event, item_id=None):
    if name:
        wanted.setdefault(f'material-icons/{safe(name)}.webp', (name, event, None, item_id))


def want_furniture(furniture_id, name, event):
    wanted.setdefault(f'material-icons/{safe(furniture_id)}.webp', (name, event, furniture_id, None))


for path in sorted(glob.glob(os.path.join(root, 'data', 'events', 'events_*.json'))):
    with open(path, encoding='utf-8') as f:
        rows = json.load(f)
    for ev in rows:
        rw = ev.get('rewards')
        for block in rw if isinstance(rw, list) else ([rw] if rw else []):
            for item in (block or {}).get('items', []):
                # A reward renamed to its Global name keeps showing the published
                # CN-named file until an EN-named one exists (sync-reward-names.mjs),
                # so that is the file it needs, not one under the EN name.
                name = item.get('iconName') or item.get('name')
                # Skins resolve through the skins dataset, not this folder.
                if name and item.get('type') != 'skin':
                    want_name(name, ev['name'])


def read_data(name):
    path = os.path.join(root, 'data', name)
    if not os.path.exists(path):
        return {}
    with open(path, encoding='utf-8') as f:
        return json.load(f)


# The rewards the game tables list for each event (data/event-rewards.json: sign-ins, missions,
# milestones, first clears, gifts, the packs' contents) and its store as the wiki lists it
# (data/event-stores.json). This stage runs after the event-rewards stage writes the first, so a
# new event's rewards get their icons in the run that lists them. Kinds the item tables name;
# operators and outfits have art of their own, a player icon is profile art.
ITEM_KINDS = {'material', 'currency', 'permit', 'sanity', 'voucher'}
event_stores = read_data('event-stores.json').get('events', {})
for event, entry in read_data('event-rewards.json').get('events', {}).items():
    groups = entry.get('groups', [])
    # The event's own furniture by name, for a store row that names a piece and gives no id.
    furniture_ids = {}
    for group in groups:
        for item in group.get('items', []):
            if item.get('kind') == 'furniture' and str(item.get('id', '')).startswith('furni_'):
                furniture_ids[item['name']] = item['id']
        for piece in group.get('pieces', []) or []:
            furniture_ids[piece['name']] = piece['id']
    for group in groups:
        for item in group.get('items', []):
            if item.get('kind') == 'furniture' and str(item.get('id', '')).startswith('furni_'):
                want_furniture(item['id'], item['name'], event)
            elif item.get('kind') in ITEM_KINDS:
                # By the item's id where the tables give one: a name the site words its own way
                # ("... Headhunting Permit (ten-roll)") is not the item table's.
                want_name(item.get('name'), event, item.get('id'))
        for pack in group.get('packs', []) or []:
            for item in pack.get('contents', []):
                if item.get('kind') in ITEM_KINDS:
                    want_name(item.get('name'), event)
    for store in event_stores.get(event, {}).get('stores', []):
        for item in store.get('items', []):
            if item.get('type') == 'furniture':
                if item.get('name') in furniture_ids:
                    want_furniture(furniture_ids[item['name']], item['name'], event)
            elif item.get('type') not in ('skin', 'upware'):
                want_name(item.get('name'), event)

missing = {
    target: want for target, want in wanted.items()
    if want[0] not in NOT_REAL and target not in published_assets()
}
skipped_placeholders = sorted({want[0] for want in wanted.values() if want[0] in NOT_REAL})

# This run's staged icons; the last run's list goes now, so a day with nothing to stage stages nothing.
staging = Staging('reward-icons', root)

if not missing:
    print('Every event reward already has its icon.')
    for n in skipped_placeholders:
        print(f'  (still in the data and still not a real item: "{n}")')
    report('reward-icons', [])
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


furniture_by_id = None


def load_furniture():
    global furniture_by_name, furniture_by_id
    if furniture_by_name is None:
        furniture_by_name, furniture_by_id = {}, {}
        for local_dir, raw in ((CN, RAW_CN), (EN, RAW_EN)):  # EN wins ties
            data = table(local_dir, raw, 'building_data.json')
            for furniture_id, f in data.get('customData', {}).get('furnitures', {}).items():
                if f.get('iconId'):
                    furniture_by_id[furniture_id] = f['iconId']
                    if f.get('name'):
                        furniture_by_name[f['name']] = f['iconId']


def furniture_icon(name):
    load_furniture()
    return furniture_by_name.get(name)


def furniture_icon_by_id(furniture_id):
    load_furniture()
    return furniture_by_id.get(furniture_id)


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


# Why a name has no icon yet, in words that stay the same while the problem does.
NOT_FOUND = 'has no icon from the item tables, the furniture art or the EN wiki'
WIKI_DOWN = 'has no icon from the item tables or the furniture art, and the EN wiki could not be reached to ask for one'
FAILED = 'has an icon at {host}, but downloading it failed'
UNREADABLE = 'has an icon at {host}, but it is not an image that decodes'

icon_by_id = {item_id: it['iconId'] for src in (items_cn, items_en) for item_id, it in src.items() if it.get('iconId')}

fetched, unresolved = [], []
for target, (name, event, furniture_id, item_id) in sorted(missing.items()):
    url = mirror = None
    icon = None if furniture_id else (icon_by_id.get(item_id) if item_id else None) or by_name.get(name)
    if furniture_id:
        # A piece the game names by id: its own icon, whatever other pieces share its name.
        icon = furniture_icon_by_id(furniture_id)
        if not icon:
            unresolved.append((furniture_id, name, event, NOT_FOUND))
            continue
        url = f'{FURNI_ART}/{urllib.parse.quote(icon)}.png'
    elif icon:
        url = f'{ITEM_ART}/{urllib.parse.quote(icon)}.png'
        # The mirror's own file at the pinned commit, which the image repository maps for its sync.
        if re.fullmatch(r'[0-9a-f]{40}', CN_REF):
            mirror = {'repository': ITEM_MIRROR, 'path': f'item/{icon}.png', 'commit': CN_REF}
    else:
        icon = furniture_icon(name)
        if icon:
            url = f'{FURNI_ART}/{urllib.parse.quote(icon)}.png'
        else:
            try:
                url = wiki_file(name)
            except Exception as e:  # noqa: BLE001 -- the wiki is enrichment, never a gate
                print(f'  the wiki could not be asked about "{name}": {e}')
                unresolved.append((name, name, event, WIKI_DOWN))
                continue
    if not url:
        unresolved.append((name, name, event, NOT_FOUND))
        continue
    host = url.split('/')[2]
    try:
        blob = fetch(url)
    except Exception as e:  # noqa: BLE001 -- a 404 here is data, not a crash
        print(f'  FAILED "{name}" from {url}: {e}')
        unresolved.append((furniture_id or name, name, event, FAILED.format(host=host)))
        continue
    try:
        im = Image.open(BytesIO(blob))
        im.load()
    except Exception as e:  # noqa: BLE001 -- e.g. an HTML page answered 200
        print(f'  UNREADABLE "{name}" from {url}: {e}')
        unresolved.append((furniture_id or name, name, event, UNREADABLE.format(host=host)))
        continue
    # As the source serves it: the publisher encodes it at the size material-icons/ keeps.
    staged = staging.stage(target, blob, source=url, mirror=mirror)
    fetched.append((furniture_id or name, name, event, url, staged.name, target))
    # A moment between downloads: the first run after event-rewards.json lists the table rewards
    # stages several hundred icons from prts.wiki's furniture CDN.
    time.sleep(0.2)
    print(f'  + {staged.name}  ({im.size[0]}x{im.size[1]}, from {host})')
staging.commit()

print(f'{len(fetched)} fetched, {len(unresolved)} unresolved')
for key, name, event, why in unresolved:
    print(f'  ? "{name}" of {event} {why}')
# Keyed by the furniture id for a piece (two events' "Duel Trophy" are two reports), else the name.
report('reward-icons', [{'key': f'reward-icon:{key}', 'action': 'published-partial',
                         'reason': f'The reward "{name}" of {event} {why}; it renders without one until a later run finds it.'}
                        for key, name, event, why in unresolved]
       + [{'key': f'reward-icon:{key}', 'action': 'published-partial', 'sourceRef': url,
           'reason': f'The reward "{name}" of {event} has an icon at {url.split("/")[2]}, staged as '
                     f'.cache/reward-icons/{file}, but no run has published it to arkpedia-image-assets as '
                     f'{target} yet; it renders without one until one does.'}
          for key, name, event, url, file, target in fetched])
for n in skipped_placeholders:
    print(f'  ! "{n}" is the wiki\'s missing-item placeholder scraped into the data -- fix the scrape')
