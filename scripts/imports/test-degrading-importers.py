"""Offline checks that the stage refresh's media importers degrade instead of failing it,
and that none of them writes into public/, which check:assets refuses.

Run with python3 scripts/imports/test-degrading-importers.py. Each importer runs as the
refresh runs it, in a scratch working directory, with ARKPEDIA_WIKI_BASE on a closed
local port: any request it makes to the wiki is refused at once, so a clean exit with no
quarantine entry also proves that no request was made. Published files are read from
this checkout's data/assets/external-asset-index.json, as the importers always do.
"""
import hashlib
import http.server
import io
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.parse
from pathlib import Path

from PIL import Image

sys.dont_write_bytecode = True
IMPORTS = Path(__file__).resolve().parent
PUBLISHED = json.loads((IMPORTS.parents[1]/'data/assets/external-asset-index.json').read_text())['files']
UNREACHABLE = {'ARKPEDIA_WIKI_BASE': 'http://127.0.0.1:65534', 'ARKPEDIA_NOW': '2026-09-23T20:00:00Z'}


def run(script, cwd, **env):
    result = subprocess.run([sys.executable, str(IMPORTS/script)], cwd=cwd, capture_output=True, text=True,
                            env={**os.environ, **UNREACHABLE, 'PYTHONDONTWRITEBYTECODE': '1', **env})
    if result.returncode:
        raise AssertionError(f'{script} exited {result.returncode}:\n{result.stdout}\n{result.stderr}')
    return result


def run_node(script, cwd, **env):
    """A Node importer of the same refresh, run the same way."""
    result = subprocess.run(['node', str(IMPORTS/script)], cwd=cwd, capture_output=True, text=True,
                            env={**os.environ, **UNREACHABLE, **env})
    if result.returncode:
        raise AssertionError(f'{script} exited {result.returncode}:\n{result.stdout}\n{result.stderr}')
    return result


def staged(root, kind):
    """What an importer listed for the staged-art stage: {destination: row}."""
    path = Path(root)/'.cache'/kind/'staged.json'
    return json.loads(path.read_text())['files'] if path.exists() else None


def git_blob(data):
    # Git itself, not the formula under test.
    return subprocess.run(['git', 'hash-object', '--stdin'], input=data, capture_output=True, check=True).stdout.decode().strip()


def entries(root):
    path = Path(root)/'data/quarantine.json'
    return json.loads(path.read_text())['entries'] if path.exists() else None


def write(root, relative, value):
    path = Path(root)/relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value))


class FakeWiki:
    """A local wiki whose API answers imageinfo for the given File: titles with a URL on
    itself, and serves `body` for any other path. `with FakeWiki(...) as base:`."""

    def __init__(self, titles, body):
        self.titles, self.body = titles, body

    def __enter__(self):
        titles, body = self.titles, self.body

        class Wiki(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path.startswith('/api.php'):
                    base = f'http://127.0.0.1:{self.server.server_port}'
                    pages = {str(i): {'title': title, 'imageinfo': [{'url': f'{base}/upload/{i}.png'}]} for i, title in enumerate(titles)}
                    data = json.dumps({'query': {'pages': pages}}).encode()
                else:
                    data = body
                self.send_response(200)
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *args):
                pass

        self.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Wiki)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        return f'http://127.0.0.1:{self.server.server_port}'

    def __exit__(self, *exc):
        self.server.shutdown()
        self.server.server_close()


def png(size, colour):
    buffer = io.BytesIO()
    Image.new('RGBA', size, colour).save(buffer, 'PNG')
    return buffer.getvalue()


class WikiImportersDegrade(unittest.TestCase):
    def test_ra_maps_asks_only_about_unpublished_maps_and_survives_an_unreachable_wiki(self):
        published = next(f for f in PUBLISHED if f.startswith('stages-images/'))[len('stages-images/'):-len('.webp')]
        with tempfile.TemporaryDirectory() as root:
            stage = lambda slug, name: write(root, f'data/stages/{slug}.json', {'slug': slug, 'name': name, 'preview': None, 'content': {'kind': 'reclamation'}})
            stage(published, 'Already Imported')
            run('import_ra_maps.py', root)
            # Everything published: the preview is restored and the wiki is never asked, and
            # with nothing to report no quarantine file is started.
            self.assertEqual(json.loads((Path(root)/f'data/stages/{published}.json').read_text())['preview'], f'images/stages/{published}.png')
            self.assertIsNone(entries(root))
            stage('ra-new-season-1', 'Nowhere Sands')
            run('import_ra_maps.py', root)
            self.assertIsNone(json.loads((Path(root)/'data/stages/ra-new-season-1.json').read_text())['preview'])
            [entry] = entries(root)
            self.assertEqual((entry['key'], entry['stage'], entry['action']), ('ra-map:ra-new-season-1', 'ra-maps', 'published-partial'))
            self.assertIn('could not be reached to ask for the map of Nowhere Sands', entry['reason'])

    def test_nation_marks_keeps_published_crests_and_reports_the_one_it_cannot_fetch(self):
        with tempfile.TemporaryDirectory() as root:
            write(root, 'data/stages-content.json', {
                'camp_zone_3': {'kind': 'annihilation', 'name': 'Ursus'},
                'camp_zone_1': {'kind': 'annihilation', 'name': 'Yan-Lungmen'},
                'camp_zone_99': {'kind': 'annihilation', 'name': 'Atlantis'},
            })
            self.assertIn('nation-marks/ursus.webp', PUBLISHED)
            run('import-nation-marks.py', root)
            self.assertEqual(json.loads((Path(root)/'data/nation-marks.json').read_text()), {'camp_zone_1': 'yan.webp', 'camp_zone_3': 'ursus.webp'})
            [entry] = entries(root)
            self.assertEqual((entry['key'], entry['stage'], entry['action']), ('nation-mark:atlantis', 'nation-marks', 'published-partial'))
            self.assertIn('could not be reached to ask for the Atlantis crest', entry['reason'])

    def test_reward_icons_reports_a_reward_the_wiki_cannot_be_asked_about(self):
        with tempfile.TemporaryDirectory() as root:
            for region in ('en', 'cn'):
                write(root, f'{region}/gamedata/excel/item_table.json', {'items': {}})
                write(root, f'{region}/gamedata/excel/building_data.json', {'customData': {'furnitures': {}}})
            write(root, 'data/events/events_2099.json', [{'name': '[Side Story] Test', 'rewards': {'items': [{'name': 'Imaginary Widget', 'type': 'material'}]}}])
            run('import-reward-icons.py', root, ARKPEDIA_EN=str(Path(root)/'en'), ARKPEDIA_CN=str(Path(root)/'cn'))
            [entry] = entries(root)
            self.assertEqual((entry['key'], entry['stage'], entry['action']), ('reward-icon:Imaginary Widget', 'reward-icons', 'published-partial'))
            self.assertIn('the EN wiki could not be reached to ask for one', entry['reason'])
            # Once nothing is missing the stage still reports, which clears the entry.
            write(root, 'data/events/events_2099.json', [{'name': '[Side Story] Test', 'rewards': {'items': []}}])
            run('import-reward-icons.py', root, ARKPEDIA_EN=str(Path(root)/'en'), ARKPEDIA_CN=str(Path(root)/'cn'))
            self.assertEqual(entries(root), [])

    def test_reward_icons_fetch_a_table_reward_furniture_by_its_id(self):
        with tempfile.TemporaryDirectory() as root:
            # Two seasons' "Duel Trophy" are two pieces: each is asked for by its id, from its own
            # building_data icon, and reported under its id. Downloads are recorded and refused.
            offline = Path(root)/'offline'
            offline.mkdir()
            (offline/'sitecustomize.py').write_text(
                'import os, urllib.request\n'
                'def refuse(request, *args, **kwargs):\n'
                '    open(os.environ["FETCH_LOG"], "a").write(getattr(request, "full_url", request) + "\\n")\n'
                '    raise OSError("offline")\n'
                'urllib.request.urlopen = refuse\n')
            furnitures = {'furni_duel_a': {'name': 'Duel Trophy', 'iconId': 'furni_duel_a'}, 'furni_duel_b': {'name': 'Duel Trophy', 'iconId': 'furni_duel_b'}}
            for region in ('en', 'cn'):
                write(root, f'{region}/gamedata/excel/item_table.json', {'items': {}})
                write(root, f'{region}/gamedata/excel/building_data.json', {'customData': {'furnitures': furnitures}})
            write(root, 'data/events/events_2099.json', [])
            trophy = lambda furniture_id: {'kind': 'milestones', 'title': 't', 'source': 's', 'items': [{'name': 'Duel Trophy', 'count': 1, 'kind': 'furniture', 'id': furniture_id}]}
            write(root, 'data/event-rewards.json', {'events': {'Duel Channel: A': {'groups': [trophy('furni_duel_a')]}, 'Duel Channel: B': {'groups': [trophy('furni_duel_b')]}}})
            log = Path(root)/'fetched.txt'
            run('import-reward-icons.py', root, ARKPEDIA_EN=str(Path(root)/'en'), ARKPEDIA_CN=str(Path(root)/'cn'), FETCH_LOG=str(log), PYTHONPATH=str(offline))
            self.assertEqual(sorted(log.read_text().split()), ['https://torappu.prts.wiki/assets/furniture/furni_duel_a.png', 'https://torappu.prts.wiki/assets/furniture/furni_duel_b.png'])
            self.assertEqual(sorted(entry['key'] for entry in entries(root)), ['reward-icon:furni_duel_a', 'reward-icon:furni_duel_b'])

    def test_reward_icons_reads_the_mirrors_at_the_commits_this_run_pinned(self):
        with tempfile.TemporaryDirectory() as root:
            # Every download is recorded and refused, so the icon ends up reported.
            offline = Path(root)/'offline'
            offline.mkdir()
            (offline/'sitecustomize.py').write_text(
                'import os, urllib.request\n'
                'def refuse(request, *args, **kwargs):\n'
                '    open(os.environ["FETCH_LOG"], "a").write(getattr(request, "full_url", request) + "\\n")\n'
                '    raise OSError("offline")\n'
                'urllib.request.urlopen = refuse\n')
            for region in ('en', 'cn'):
                write(root, f'{region}/gamedata/excel/item_table.json', {'items': {'w': {'name': 'Imaginary Widget', 'iconId': 'MTL_WIDGET'}}})
            write(root, 'data/events/events_2099.json', [{'name': '[Side Story] Test', 'rewards': {'items': [{'name': 'Imaginary Widget', 'type': 'material'}]}}])
            log, pin = Path(root)/'fetched.txt', '3' * 40
            run('import-reward-icons.py', root, ARKPEDIA_EN=str(Path(root)/'en'), ARKPEDIA_CN=str(Path(root)/'cn'), FETCH_LOG=str(log),
                PYTHONPATH=str(offline), ARKPEDIA_PIN_YUANYAN3060_ARKNIGHTSGAMERESOURCE=pin)
            self.assertEqual(log.read_text().split(), [f'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/{pin}/item/MTL_WIDGET.png'])
            [entry] = entries(root)
            self.assertIn('has an icon at raw.githubusercontent.com, but downloading it failed', entry['reason'])

    def test_reward_icons_stages_a_fetched_icon_outside_public_and_reports_it(self):
        # A wiki that has the upload. The icon is found, and must still stay out of public/:
        # check:assets refuses any image there, so a successful fetch blocked the release.
        upload = io.BytesIO()
        Image.new('RGBA', (120, 120), (200, 30, 30, 255)).save(upload, 'PNG')

        class Wiki(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                url = f'http://127.0.0.1:{self.server.server_port}/widget.png'
                body = json.dumps({'query': {'pages': {'1': {'title': 'File:Imaginary Widget.png', 'imageinfo': [{'url': url}]}}}}).encode() \
                    if self.path.startswith('/api.php') else upload.getvalue()
                self.send_response(200)
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Wiki)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{server.server_port}'
        try:
            with tempfile.TemporaryDirectory() as root:
                for region in ('en', 'cn'):
                    write(root, f'{region}/gamedata/excel/item_table.json', {'items': {}})
                    write(root, f'{region}/gamedata/excel/building_data.json', {'customData': {'furnitures': {}}})
                write(root, 'data/events/events_2099.json', [{'name': '[Side Story] Test', 'rewards': {'items': [{'name': 'Imaginary Widget', 'type': 'material'}]}}])
                run('import-reward-icons.py', root, ARKPEDIA_EN=str(Path(root)/'en'), ARKPEDIA_CN=str(Path(root)/'cn'), ARKPEDIA_WIKI_BASE=base)
                self.assertFalse((Path(root)/'public').exists())
                # As the source serves it, never shrunk: the publisher keeps material icons at
                # the game's native 183px, and the icon is listed for the staged-art stage.
                self.assertEqual((Path(root)/'.cache/reward-icons/Imaginary Widget.png').read_bytes(), upload.getvalue())
                self.assertEqual({target: (row['file'], row['source']) for target, row in staged(root, 'reward-icons').items()},
                                 {'material-icons/Imaginary Widget.webp': ('Imaginary Widget.png', f'{base}/widget.png')})
                [entry] = entries(root)
                self.assertEqual((entry['key'], entry['stage'], entry['action'], entry['sourceRef']),
                                 ('reward-icon:Imaginary Widget', 'reward-icons', 'published-partial', f'{base}/widget.png'))
                self.assertIn('no run has published it to arkpedia-image-assets as material-icons/Imaginary Widget.webp yet', entry['reason'])
        finally:
            server.shutdown()
            server.server_close()

    def test_ra_maps_stages_a_downloaded_map_outside_public_and_leaves_the_preview_unset(self):
        # check:assets refuses any image under public/, so a map written there made every
        # SUCCESSFUL download a blocked release.
        with tempfile.TemporaryDirectory() as root, FakeWiki(['File:Nowhere Sands map.png'], png((64, 48), (10, 20, 30, 255))) as base:
            write(root, 'data/stages/ra-new-season-1.json', {'slug': 'ra-new-season-1', 'name': 'Nowhere Sands', 'preview': None, 'content': {'kind': 'reclamation'}})
            run('import_ra_maps.py', root, ARKPEDIA_WIKI_BASE=base)
            self.assertFalse((Path(root)/'public').exists())
            with Image.open(Path(root)/'.cache/ra-maps/ra-new-season-1.png') as staged_map:
                self.assertEqual(staged_map.size, (64, 48))
            self.assertEqual(list(staged(root, 'ra-maps')), ['stages-images/ra-new-season-1.webp'])
            self.assertIsNone(json.loads((Path(root)/'data/stages/ra-new-season-1.json').read_text())['preview'])
            [entry] = entries(root)
            self.assertEqual((entry['key'], entry['stage'], entry['action'], entry['sourceRef']),
                             ('ra-map:ra-new-season-1', 'ra-maps', 'published-partial', f'{base}/upload/0.png'))
            self.assertIn('no run has published it to arkpedia-image-assets as stages-images/ra-new-season-1.webp yet', entry['reason'])
            # Staged already, in whatever format the wiki served it (a webp here): the next run
            # lists it again for the staged-art stage and reports it, without downloading it
            # again -- the wiki would have answered with the PNG.
            (Path(root)/'.cache/ra-maps/ra-new-season-1.png').unlink()
            kept = io.BytesIO()
            Image.new('RGB', (40, 30), (1, 2, 3)).save(kept, 'WEBP')
            (Path(root)/'.cache/ra-maps/ra-new-season-1.webp').write_bytes(kept.getvalue())
            run('import_ra_maps.py', root, ARKPEDIA_WIKI_BASE=base)
            self.assertEqual({target: row['file'] for target, row in staged(root, 'ra-maps').items()},
                             {'stages-images/ra-new-season-1.webp': 'ra-new-season-1.webp'})
            self.assertEqual((Path(root)/'.cache/ra-maps/ra-new-season-1.webp').read_bytes(), kept.getvalue())
            self.assertFalse((Path(root)/'.cache/ra-maps/ra-new-season-1.png').exists())
            self.assertEqual([e['key'] for e in entries(root)], ['ra-map:ra-new-season-1'])

    def test_ra_maps_reports_a_download_that_is_not_an_image(self):
        with tempfile.TemporaryDirectory() as root, FakeWiki(['File:Nowhere Sands map.png'], b'<html>maintenance</html>') as base:
            write(root, 'data/stages/ra-new-season-1.json', {'slug': 'ra-new-season-1', 'name': 'Nowhere Sands', 'preview': None, 'content': {'kind': 'reclamation'}})
            run('import_ra_maps.py', root, ARKPEDIA_WIKI_BASE=base)
            self.assertFalse((Path(root)/'.cache/ra-maps/ra-new-season-1.png').exists())
            self.assertIsNone(staged(root, 'ra-maps'))
            [entry] = entries(root)
            self.assertIn('is not an image that decodes', entry['reason'])

    def test_nation_marks_stages_a_downloaded_crest_outside_public_and_leaves_it_out_of_the_index(self):
        with tempfile.TemporaryDirectory() as root, FakeWiki(['File:Atlantis.png'], png((40, 40), (255, 255, 255, 255))) as base:
            write(root, 'data/stages-content.json', {
                'camp_zone_3': {'kind': 'annihilation', 'name': 'Ursus'},
                'camp_zone_99': {'kind': 'annihilation', 'name': 'Atlantis'},
                'camp_zone_98': {'kind': 'annihilation', 'name': 'Atlantis-Deep'},
            })
            run('import-nation-marks.py', root, ARKPEDIA_WIKI_BASE=base)
            self.assertFalse((Path(root)/'public').exists())
            # The mask, lossless; the publisher writes the webp.
            with Image.open(Path(root)/'.cache/nation-marks/atlantis.png') as mask:
                self.assertEqual((mask.format, mask.mode), ('PNG', 'RGBA'))
            self.assertEqual(list(staged(root, 'nation-marks')), ['nation-marks/atlantis.webp'])
            # The published crest is mapped; the staged one is not, for either of its contents.
            self.assertEqual(json.loads((Path(root)/'data/nation-marks.json').read_text()), {'camp_zone_3': 'ursus.webp'})
            [entry] = entries(root)
            self.assertEqual((entry['key'], entry['stage'], entry['action'], entry['sourceRef']),
                             ('nation-mark:atlantis', 'nation-marks', 'published-partial', f'{base}/upload/0.png'))
            self.assertIn('no run has published it to arkpedia-image-assets as nation-marks/atlantis.webp yet', entry['reason'])

    def test_cc_stages_stages_a_new_season_render_outside_public_and_leaves_it_unset(self):
        with tempfile.TemporaryDirectory() as root:
            write(root, 'data/stages/ccb-9-1.json', {'slug': 'ccb-9-1', 'stage_type': 'contingency_contract', 'id': 'obt/crisis/v2/level_crisis_v2_09-01'})
            write(root, 'data/stages/ccb-9-2.json', {'slug': 'ccb-9-2', 'stage_type': 'contingency_contract', 'id': 'obt/crisis/v2/level_crisis_v2_09-02'})
            write(root, 'data/stages-content.json', {'crisis_v2_s9': {'kind': 'contingency_contract', 'label': 'CC#9'}})
            write(root, 'en/gamedata/excel/medal_table.json', {'medalList': []})
            (Path(root)/'cn/map').mkdir(parents=True)
            render = png((32, 32), (1, 2, 3, 255))
            (Path(root)/'cn/map/crisis_v2_09-01.png').write_bytes(render)
            pin = '5' * 40
            run('import_cc_stages.py', root, ARKPEDIA_CN=str(Path(root)/'cn'), ARKPEDIA_EN=str(Path(root)/'en'), ARKPEDIA_PIN_YUANYAN3060_ARKNIGHTSGAMERESOURCE=pin)
            self.assertFalse((Path(root)/'public').exists())
            # The mirror's own bytes, with the path, commit and blob the image repository maps it by.
            self.assertEqual((Path(root)/'.cache/cc-stages/crisis_v2_09-01.png').read_bytes(), render)
            self.assertEqual(staged(root, 'cc-stages'), {'stages-images/crisis_v2_09-01.webp': {
                'file': 'crisis_v2_09-01.png', 'sha256': hashlib.sha256(render).hexdigest(),
                'source': f'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/{pin}/map/crisis_v2_09-01.png',
                'mirror': {'repository': 'yuanyan3060/ArknightsGameResource', 'path': 'map/crisis_v2_09-01.png', 'commit': pin, 'blob': git_blob(render)}}})
            self.assertEqual(json.loads((Path(root)/'data/cc-stages.json').read_text()), {'ccb-9-1': {'code': 'CCB#9-1'}, 'ccb-9-2': {'code': 'CCB#9-2'}})
            self.assertEqual([(e['key'], e['stage'], e['action']) for e in entries(root)],
                             [('cc-render:ccb-9-1', 'cc-stages', 'published-partial'), ('cc-render:ccb-9-2', 'cc-stages', 'published-partial')])
            self.assertIn('no run has published it to arkpedia-image-assets as stages-images/crisis_v2_09-01.webp yet', entries(root)[0]['reason'])
            self.assertIn('has no map/crisis_v2_09-02.png', entries(root)[1]['reason'])

    def test_cc_stages_names_every_stage_on_a_day_without_the_cn_art(self):
        # The art is a stage of its own (upstream-cn-art); on a day it fails, cn-resource has
        # no map/ at all, and the stages are still named and labelled, published renders kept.
        with tempfile.TemporaryDirectory() as root:
            published = next(f[len('stages-images/'):-len('.webp')] for f in PUBLISHED if f.startswith('stages-images/crisis_v2_'))
            write(root, 'data/stages/ccb-a.json', {'slug': 'ccb-a', 'stage_type': 'contingency_contract', 'id': f'obt/crisis/v2/level_{published}'})
            write(root, 'data/stages/ccb-9-2.json', {'slug': 'ccb-9-2', 'stage_type': 'contingency_contract', 'id': 'obt/crisis/v2/level_crisis_v2_09-02'})
            write(root, 'data/stages-content.json', {'crisis_v2_s9': {'kind': 'contingency_contract', 'label': 'CC#9'}})
            write(root, 'en/gamedata/excel/medal_table.json', {'medalList': []})
            (Path(root)/'cn').mkdir()
            run('import_cc_stages.py', root, ARKPEDIA_CN=str(Path(root)/'cn'), ARKPEDIA_EN=str(Path(root)/'en'))
            self.assertEqual(json.loads((Path(root)/'data/cc-stages.json').read_text())['ccb-a']['render'], f'{published}.webp')
            self.assertEqual(json.loads((Path(root)/'data/stages-content.json').read_text())['crisis_v2_s9']['label'], 'CCB#9')
            [entry] = entries(root)
            self.assertEqual((entry['key'], entry['action']), ('cc-render:ccb-9-2', 'published-partial'))
            self.assertIn('the CN art (map/) could not be synced this run', entry['reason'])

    def test_is_nodes_stages_a_fetched_render_outside_public_and_leaves_its_form_out(self):
        with tempfile.TemporaryDirectory() as root:
            # The render source answers every request with one PNG; no network is used.
            offline = Path(root)/'offline'
            offline.mkdir()
            (offline/'render.png').write_bytes(png((20, 10), (5, 6, 7, 255)))
            (offline/'sitecustomize.py').write_text(
                'import io, os, urllib.request\n'
                'class Answer(io.BytesIO):\n'
                '    def __enter__(self): return self\n'
                '    def __exit__(self, *exc): return False\n'
                'def serve(request, *args, **kwargs):\n'
                '    return Answer(open(os.path.join(os.path.dirname(__file__), "render.png"), "rb").read())\n'
                'urllib.request.urlopen = serve\n')
            topic = {'details': {'rogue_9': {'stages': {'ro9_n_1_1': {'id': 'ro9_n_1_1', 'levelId': 'Obt/Roguelike/RO9/level_rogue9_1-1', 'isElite': False}}}}}
            for region in ('cn', 'en/en'):
                write(root, f'{region}/gamedata/excel/roguelike_topic_table.json', topic)
            write(root, 'data/stages/is9-1.json', {'slug': 'is9-1', 'stage_type': 'integrated_strategies', 'id': 'obt/roguelike/ro9/level_rogue9_1-1', 'name': 'Nine'})
            run('import_is_nodes.py', root, ARKPEDIA_CN=str(Path(root)/'cn'), ARKPEDIA_EN=str(Path(root)/'en/en'), PYTHONPATH=str(offline))
            self.assertFalse((Path(root)/'public').exists())
            self.assertEqual((Path(root)/'.cache/is-nodes/ro9_n_1_1.png').read_bytes(), (offline/'render.png').read_bytes())
            self.assertEqual([(target, row['source']) for target, row in staged(root, 'is-nodes').items()],
                             [('stages-images/ro9_n_1_1.webp', 'https://raw.githubusercontent.com/fexli/ArknightsResource/6d02b532c2380abd11c467daf706bf4761fae919/mapreview/ro9_n_1_1.png')])
            self.assertEqual(json.loads((Path(root)/'data/is-nodes.json').read_text()), {})
            [entry] = entries(root)
            self.assertEqual((entry['key'], entry['stage'], entry['action']), ('is-render:ro9_n_1_1', 'is-nodes', 'published-partial'))
            self.assertIn('no run has published it to arkpedia-image-assets as stages-images/ro9_n_1_1.webp yet', entry['reason'])

    def test_item_icons_stages_a_new_token_icon_outside_public_and_leaves_it_unmapped(self):
        # check:assets refuses any image under public/, so copying a new event token's
        # icon there blocked the release the day its side story reached the EN tables.
        with tempfile.TemporaryDirectory() as root:
            write(root, 'data/assets/external-asset-index.json', {'files': ['item-icons/drill_battle_record.png', 'item-icons/act1_token_old.png']})
            write(root, 'data/item-icons.json', {'2001': 'drill_battle_record.png', '9999': 'gone_from_the_repo.png'})
            write(root, 'data/stages/pa-1.json', {'drops': [
                {'item': {'id': '2001', 'name': 'Drill Battle Record'}},
                {'item': {'id': 'act1_token_old', 'name': 'Old Token'}},
                {'item': {'id': 'act99side_token_new', 'name': 'New Token'}},
                {'item': {'id': 'furni_chair', 'name': 'A Chair'}},
                {'item': {'id': 'char_002_amiya', 'name': 'Amiya', 'is_operator': True}},
            ]})
            (Path(root)/'cn/item').mkdir(parents=True)
            icon = png((8, 8), (9, 9, 9, 255))
            (Path(root)/'cn/item/act99side_token_new.png').write_bytes(icon)
            pin = '4' * 40
            run_node('import-item-icons.mjs', root, ARKPEDIA_CN=str(Path(root)/'cn'), ARKPEDIA_PIN_YUANYAN3060_ARKNIGHTSGAMERESOURCE=pin)
            self.assertFalse((Path(root)/'public').exists())
            self.assertTrue((Path(root)/'.cache/item-icons/act99side_token_new.png').exists())
            self.assertEqual(staged(root, 'item-icons')['item-icons/act99side_token_new.png']['mirror'],
                             {'repository': 'yuanyan3060/ArknightsGameResource', 'path': 'item/act99side_token_new.png', 'commit': pin, 'blob': git_blob(icon)})
            # Published icons are mapped, the published token too; the staged one is not.
            self.assertEqual(json.loads((Path(root)/'data/item-icons.json').read_text()),
                             {'2001': 'drill_battle_record.png', 'act1_token_old': 'act1_token_old.png'})
            [entry] = entries(root)
            self.assertEqual((entry['key'], entry['stage'], entry['action'], entry['sourceRef']),
                             ('item-icon:act99side_token_new', 'item-icons', 'published-partial',
                              f'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/{pin}/item/act99side_token_new.png'))
            self.assertIn('no run has published it to arkpedia-image-assets as item-icons/act99side_token_new.png yet', entry['reason'])
            # Once the image repository publishes it, it is mapped and the entry clears.
            write(root, 'data/assets/external-asset-index.json', {'files': ['item-icons/drill_battle_record.png', 'item-icons/act1_token_old.png', 'item-icons/act99side_token_new.png']})
            run_node('import-item-icons.mjs', root, ARKPEDIA_CN=str(Path(root)/'cn'))
            self.assertEqual(json.loads((Path(root)/'data/item-icons.json').read_text())['act99side_token_new'], 'act99side_token_new.png')
            self.assertEqual(entries(root), [])
            # Nothing is left to stage, and last run's list is gone with it.
            self.assertIsNone(staged(root, 'item-icons'))
            self.assertFalse((Path(root)/'public').exists())


class Outage:
    """A local wiki whose answers change from one day to the next, as an outage's do. The API
    answers imageinfo for the asked titles that are in `titles`, each with a URL on itself, or
    `api` when that is a status; `uploads[i]` answers the i-th title's file: (status, body),
    or None to drop the connection unanswered. close() leaves the port refusing connections."""

    def __init__(self, titles=()):
        self.titles, self.api, self.uploads = list(titles), 200, {}

    def __enter__(self):
        outage = self

        class Wiki(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                url = urllib.parse.urlparse(self.path)
                if url.path == '/api.php':
                    if outage.api != 200:
                        return self.answer(outage.api, b'<html>Bad gateway</html>')
                    asked = urllib.parse.parse_qs(url.query).get('titles', [''])[0].split('|')
                    pages = {str(i): {'title': t, 'imageinfo': [{'url': f'{outage.base}/upload/{i}.png'}]}
                             for i, t in enumerate(outage.titles) if t in asked}
                    return self.answer(200, json.dumps({'query': {'pages': pages}}).encode())
                answer = outage.uploads.get(int(url.path.split('/')[-1].split('.')[0]), (404, b'not found'))
                if answer is not None:
                    self.answer(*answer)

            def answer(self, status, body):
                self.send_response(status)
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        self.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Wiki)
        self.base = f'http://127.0.0.1:{self.server.server_port}'
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        return self

    def close(self):
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            self.server = None

    def __exit__(self, *exc):
        self.close()


class OutageReasonsStayTheSame(unittest.TestCase):
    """data/quarantine.json is a release input: the same records failing the same way on two
    days of one outage must leave it byte for byte the same, whatever each day's error said,
    or every day of the outage publishes a release. The error itself goes to the log."""

    def two_days(self, script, root, first, second, **env):
        """Runs `script` on two days, `first` and `second` setting up each day's failure; the
        file must not change between them. Returns the entries and each day's log."""
        logs = []
        for day, setup in (('2026-09-23T20:00:00Z', first), ('2026-09-24T20:00:00Z', second)):
            day_env = setup() or {}
            result = run(script, root, ARKPEDIA_NOW=day, **{**env, **day_env})
            logs.append(result.stdout + result.stderr)
            if len(logs) == 1:
                before = (Path(root)/'data/quarantine.json').read_bytes()
        self.assertEqual((Path(root)/'data/quarantine.json').read_bytes().decode(), before.decode())
        self.assertTrue(all(e['firstSeen'] == '2026-09-23' for e in entries(root)))
        return {e['key']: e['reason'] for e in entries(root)}, logs

    def unreachable(self, outage):
        """502 on the first day, the connection refused on the second."""
        return (lambda: setattr(outage, 'api', 502)), outage.close

    def test_ra_maps(self):
        with tempfile.TemporaryDirectory() as root, Outage(['File:Nowhere Sands map.png', 'File:Glass Dunes map.png']) as wiki:
            for slug, name in (('ra-new-season-1', 'Nowhere Sands'), ('ra-new-season-2', 'Glass Dunes')):
                write(root, f'data/stages/{slug}.json', {'slug': slug, 'name': name, 'preview': None, 'content': {'kind': 'reclamation'}})
            # The download fails differently each day; the second file is a different non-image each day.
            days = [{0: (500, b'oops'), 1: (200, b'<html>maintenance</html>')}, {0: None, 1: (200, b'<html>rate limited</html>')}]
            reasons, logs = self.two_days('import_ra_maps.py', root, lambda: setattr(wiki, 'uploads', days[0]),
                                          lambda: setattr(wiki, 'uploads', days[1]), ARKPEDIA_WIKI_BASE=wiki.base)
            self.assertEqual(reasons, {
                'ra-map:ra-new-season-1': 'Downloading File:Nowhere Sands map.png failed; the stage is published without a map.',
                'ra-map:ra-new-season-2': 'File:Glass Dunes map.png is not an image that decodes; the stage is published without a map.'})
            self.assertIn('HTTP Error 500', logs[0])
            self.assertIn('Remote end closed connection without response', logs[1])
            # The wiki itself goes down: a 502, then a refused connection.
            reasons, logs = self.two_days('import_ra_maps.py', root, *self.unreachable(wiki), ARKPEDIA_WIKI_BASE=wiki.base)
            self.assertEqual(set(reasons.values()), {
                f'The wiki could not be reached to ask for the map of {name}; the stage is published without one.' for name in ('Nowhere Sands', 'Glass Dunes')})
            self.assertIn('HTTP Error 502', logs[0])
            self.assertIn('Connection refused', logs[1])

    def test_nation_marks(self):
        with tempfile.TemporaryDirectory() as root, Outage(['File:Atlantis.png', 'File:Lemuria.png']) as wiki:
            write(root, 'data/stages-content.json', {
                'camp_zone_3': {'kind': 'annihilation', 'name': 'Ursus'},
                'camp_zone_98': {'kind': 'annihilation', 'name': 'Lemuria'},
                'camp_zone_99': {'kind': 'annihilation', 'name': 'Atlantis'},
            })
            days = [{0: (503, b'busy'), 1: (200, b'<html>maintenance</html>')}, {0: None, 1: (200, b'GIF89a')}]
            reasons, logs = self.two_days('import-nation-marks.py', root, lambda: setattr(wiki, 'uploads', days[0]),
                                          lambda: setattr(wiki, 'uploads', days[1]), ARKPEDIA_WIKI_BASE=wiki.base)
            self.assertEqual(reasons, {
                'nation-mark:atlantis': 'Downloading the Atlantis crest failed; its Annihilation cards are published without it.',
                'nation-mark:lemuria': 'The Lemuria crest the wiki serves is not an image that decodes; its Annihilation cards are published without it.'})
            self.assertIn('HTTP Error 503', logs[0])
            self.assertIn('Remote end closed connection without response', logs[1])
            reasons, logs = self.two_days('import-nation-marks.py', root, *self.unreachable(wiki), ARKPEDIA_WIKI_BASE=wiki.base)
            self.assertEqual(reasons['nation-mark:atlantis'], 'The wiki could not be reached to ask for the Atlantis crest; its Annihilation cards are published without a crest.')
            self.assertIn('HTTP Error 502', logs[0])
            self.assertIn('Connection refused', logs[1])

    def test_reward_icons(self):
        with tempfile.TemporaryDirectory() as root, Outage(['File:Imaginary Widget.png', 'File:Paper Crown.png']) as wiki:
            for region in ('en', 'cn'):
                write(root, f'{region}/gamedata/excel/item_table.json', {'items': {}})
                write(root, f'{region}/gamedata/excel/building_data.json', {'customData': {'furnitures': {}}})
            write(root, 'data/events/events_2099.json', [{'name': '[Side Story] Test', 'rewards': {'items': [
                {'name': 'Imaginary Widget', 'type': 'material'}, {'name': 'Paper Crown', 'type': 'material'}]}}])
            env = {'ARKPEDIA_EN': str(Path(root)/'en'), 'ARKPEDIA_CN': str(Path(root)/'cn'), 'ARKPEDIA_WIKI_BASE': wiki.base}
            days = [{0: (500, b'oops'), 1: (200, b'<html>maintenance</html>')}, {0: None, 1: (200, b'<html>rate limited</html>')}]
            reasons, logs = self.two_days('import-reward-icons.py', root, lambda: setattr(wiki, 'uploads', days[0]),
                                          lambda: setattr(wiki, 'uploads', days[1]), **env)
            host = wiki.base.split('/')[2]
            self.assertEqual(reasons, {
                'reward-icon:Imaginary Widget': f'The reward "Imaginary Widget" of [Side Story] Test has an icon at {host}, but downloading it failed; it renders without one until a later run finds it.',
                'reward-icon:Paper Crown': f'The reward "Paper Crown" of [Side Story] Test has an icon at {host}, but it is not an image that decodes; it renders without one until a later run finds it.'})
            self.assertIn('HTTP Error 500', logs[0])
            self.assertIn('Remote end closed connection without response', logs[1])
            reasons, logs = self.two_days('import-reward-icons.py', root, *self.unreachable(wiki), **env)
            self.assertIn('the EN wiki could not be reached to ask for one', reasons['reward-icon:Paper Crown'])
            self.assertIn('HTTP Error 502', logs[0])
            self.assertIn('Connection refused', logs[1])

    def test_cc_stages(self):
        with tempfile.TemporaryDirectory() as root:
            write(root, 'data/stages/ccb-9-1.json', {'slug': 'ccb-9-1', 'stage_type': 'contingency_contract', 'id': 'obt/crisis/v2/level_crisis_v2_09-01'})
            write(root, 'data/stages-content.json', {})
            write(root, 'en/gamedata/excel/medal_table.json', {'medalList': []})
            # The same broken render, in a checkout at another path the next day: the error names the path.
            for day, body in (('1', b'not a png'), ('2', b'still not a png')):
                (Path(root)/f'cn-{day}/map').mkdir(parents=True)
                (Path(root)/f'cn-{day}/map/crisis_v2_09-01.png').write_bytes(body)
            reasons, logs = self.two_days('import_cc_stages.py', root, lambda: {'ARKPEDIA_CN': str(Path(root)/'cn-1')},
                                          lambda: {'ARKPEDIA_CN': str(Path(root)/'cn-2')}, ARKPEDIA_EN=str(Path(root)/'en'))
            self.assertEqual(reasons, {'cc-render:ccb-9-1': 'CCB#9-1 (ccb-9-1): map/crisis_v2_09-01.png does not decode, so it is published without a render.'})
            self.assertIn('cn-1', logs[0])
            self.assertIn('cn-2', logs[1])


if __name__ == '__main__':
    unittest.main()
