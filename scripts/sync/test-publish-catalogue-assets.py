"""Offline checks for the catalogue media import; run with python3 scripts/sync/test-publish-catalogue-assets.py."""
import hashlib
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from contextlib import redirect_stderr
from unittest.mock import patch
from urllib.parse import parse_qsl, urlparse
sys.dont_write_bytecode = True
from PIL import Image

spec = importlib.util.spec_from_file_location('publish', Path(__file__).with_name('publish-catalogue-assets.py'))
publish = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publish)

REVISION = 'a' * 40


def png(color, size=(300, 200)):
    output = io.BytesIO()
    Image.new('RGBA', size, color).save(output, format='PNG')
    return output.getvalue()


def git_blob(data):
    # Git itself, not the formula under test.
    return subprocess.run(['git', 'hash-object', '--stdin'], input=data, capture_output=True, check=True).stdout.decode().strip()


def asset_repository(root, *scripts):
    """A clean checkout of an asset repository with nothing published yet."""
    (root/'scripts').mkdir(parents=True)
    (root/'asset-manifest.json').write_text('{"files":{}}\n')
    (root/'asset-source-map.json').write_text('{"version":1,"files":{}}\n')
    (root/'scripts/validate_images.py').write_text('')
    for name, text in scripts:
        (root/'scripts'/name).write_text(text)
    subprocess.run(['git', 'init', '-q', str(root)], check=True)


class CatalogueImports(unittest.TestCase):
    def test_an_image_row_records_the_git_blob_of_the_bytes_fetched_at_the_plan_revision(self):
        avatar, skin, poster = png('#c03030'), png('#3030c0'), png('#30c030')
        responses = {
            f'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/{REVISION}/avatar/char_900_test.png': avatar,
            f'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/{REVISION}/skin/char_900_test_1b.png': skin,
            'https://arknights.wiki.gg/images/CN_Test_banner.png': poster,
        }
        fetched = []

        def fetch(url):
            fetched.append(url)
            if url.startswith('https://arknights.wiki.gg/api.php?'):
                return json.dumps({'query': {'pages': {'1': {'title': 'File:CN Test banner.png',
                    'imageinfo': [{'url': 'https://arknights.wiki.gg/images/CN_Test_banner.png', 'sha1': '0' * 40}]}}}}).encode()
            return responses[url]

        plan = {'sourceRepository': 'yuanyan3060/ArknightsGameResource', 'revision': REVISION, 'files': [
            {'path': 'six-star-icons/Test - Base.webp', 'sourcePath': 'avatar/char_900_test.png'},
            {'path': 'six-star-skins/Test - Base.webp', 'sourcePath': 'skin/char_900_test_1b.png'},
            {'path': 'event-poster/Test.webp', 'wikiFiles': ['CN Test banner.png']},
        ]}
        with tempfile.TemporaryDirectory() as temporary:
            image_root, skin_root = Path(temporary)/'image', Path(temporary)/'skin'
            asset_repository(image_root)
            asset_repository(skin_root, ('build_artwork_variants.py', 'def build_one(job):\n    return job[0], {}\n'))
            with patch.object(publish, 'fetch', fetch):
                publish.build(plan, image_root, skin_root)
            image_map = json.loads((image_root/'asset-source-map.json').read_text())['files']
            skin_map = json.loads((skin_root/'asset-source-map.json').read_text())['files']
            published = (image_root/'six-star-icons/Test - Base.webp').read_bytes()

        self.assertIn(f'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/{REVISION}/avatar/char_900_test.png', fetched)
        self.assertEqual(image_map['six-star-icons/Test - Base.webp'],
                         {'sourcePath': 'avatar/char_900_test.png', 'sourceBlob': git_blob(avatar), 'maxWidth': 180})
        # The fetched source, not the re-encoded file the repository stores.
        self.assertNotEqual(image_map['six-star-icons/Test - Base.webp']['sourceBlob'], git_blob(published))
        # A wiki poster has no upstream path to map, and the artwork repository keeps bare paths.
        self.assertNotIn('event-poster/Test.webp', image_map)
        self.assertEqual(skin_map, {'six-star-skins/Test - Base.webp': 'skin/char_900_test_1b.png'})

    def test_art_the_wiki_cannot_serve_is_left_out_and_reported_while_the_rest_is_built(self):
        avatar = png('#c03030')
        icon_url = f'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/{REVISION}/avatar/char_900_test.png'
        fetched = []

        def fetch(url):
            fetched.append(url)
            if url == icon_url:
                return avatar
            query = dict(parse_qsl(urlparse(url).query))
            titles = query.get('titles', '')
            if 'CN Down banner.png' in titles:
                raise subprocess.CalledProcessError(7, ['curl'], output=b'', stderr=b'Failed to connect')
            if 'CN Elsewhere banner.png' in titles:
                return json.dumps({'query': {'pages': {'1': {'title': 'File:CN Elsewhere banner.png',
                    'imageinfo': [{'url': 'https://images.example/Elsewhere.png', 'sha1': '0' * 40}]}}}}).encode()
            # The API's answer for a file that has not been uploaded.
            return json.dumps({'query': {'pages': {'-1': {'title': 'File:CN Missing banner.png', 'missing': ''}}}}).encode()

        plan = {'sourceRepository': 'yuanyan3060/ArknightsGameResource', 'revision': REVISION, 'files': [
            {'path': 'six-star-icons/Test - Base.webp', 'sourcePath': 'avatar/char_900_test.png'},
            {'path': 'event-poster/Missing.webp', 'wikiFiles': ['CN Missing banner.png']},
            {'path': 'headhunting-banner-images/Down.webp', 'wikiFiles': ['CN Down banner.png', 'Down banner.png']},
            {'path': 'event-poster/Elsewhere.webp', 'wikiFiles': ['CN Elsewhere banner.png']},
        ]}
        with tempfile.TemporaryDirectory() as temporary:
            image_root, skin_root, app = Path(temporary)/'image', Path(temporary)/'skin', Path(temporary)/'app'
            asset_repository(image_root)
            asset_repository(skin_root, ('build_artwork_variants.py', 'def build_one(job):\n    return job[0], {}\n'))
            (app/'data').mkdir(parents=True)
            (Path(temporary)/'plan.json').write_text(json.dumps(plan))
            cwd = os.getcwd()
            try:
                os.chdir(app)
                with patch.object(publish, 'fetch', fetch), patch.dict(os.environ, {'ARKPEDIA_NOW': '2026-09-23T20:00:00Z'}):
                    publish.main([str(Path(temporary)/'plan.json'), str(image_root), str(skin_root)])
            finally:
                os.chdir(cwd)
            manifest = json.loads((image_root/'asset-manifest.json').read_text())['files']
            entries = json.loads((app/'data/quarantine.json').read_text())['entries']

        self.assertEqual(list(manifest), ['six-star-icons/Test - Base.webp'])
        self.assertEqual([(e['key'], e['stage'], e['action'], e['firstSeen']) for e in entries], [
            ('art:event-poster/Elsewhere.webp', 'catalogue-art', 'published-partial', '2026-09-23'),
            ('art:event-poster/Missing.webp', 'catalogue-art', 'published-partial', '2026-09-23'),
            ('art:headhunting-banner-images/Down.webp', 'catalogue-art', 'published-partial', '2026-09-23'),
        ])
        reasons = {e['key']: e['reason'] for e in entries}
        self.assertIn('has no upload for File:CN Missing banner.png yet', reasons['art:event-poster/Missing.webp'])
        self.assertIn('could not be reached to ask for File:CN Down banner.png', reasons['art:headhunting-banner-images/Down.webp'])
        self.assertIn('unexpected host (images.example)', reasons['art:event-poster/Elsewhere.webp'])
        # An image on a host the importer does not trust is never requested.
        self.assertNotIn('https://images.example/Elsewhere.png', fetched)


    def test_key_art_comes_from_the_official_post_first_then_the_wiki_and_no_other_host_is_ever_fetched(self):
        poster, wiki_banner = png('#3060c0', (1560, 500)), png('#30c060', (1560, 500))
        official = 'https://web.hycdn.cn/upload/image/20260929/77e4be6e8952f9027dd611befc59111a.jpg'
        gone = 'https://web.hycdn.cn/upload/image/20260929/61906002d14af20348268b00ee96cb75.jpg'
        wiki_url = 'https://arknights.wiki.gg/images/CN_Abyssal_Cruise_banner.png'
        challenge = 'https://web.hycdn.cn/upload/image/20260929/challenge.jpg'
        divider = 'https://web.hycdn.cn/upload/image/20260929/divider.png'
        fetched = []

        def fetch(url):
            fetched.append(url)
            if url == official:
                return poster
            if url == wiki_url:
                return wiki_banner
            if url == challenge:
                # A 200 that is a page, not the picture: a challenge or an error page.
                return b'<!DOCTYPE html><html>please enable javascript</html>'
            if url == divider:
                return png('#808080', (1560, 24))
            if url.startswith('https://web.hycdn.cn/'):
                raise subprocess.CalledProcessError(22, ['curl'], output=b'', stderr=b'HTTP 404 on a Tuesday')
            titles = dict(parse_qsl(urlparse(url).query)).get('titles', '')
            if 'CN Abyssal Cruise banner.png' in titles:
                return json.dumps({'query': {'pages': {'1': {'title': 'File:CN Abyssal Cruise banner.png',
                    'imageinfo': [{'url': wiki_url, 'sha1': '0' * 40}]}}}}).encode()
            return json.dumps({'query': {'pages': {'-1': {'title': 'File:CN Nowhere banner.png', 'missing': ''}}}}).encode()

        plan = {'files': [
            # A post's image: built from the source, the wiki never asked.
            {'path': 'event-poster/CN 5101-1.webp', 'urls': [official], 'wikiFiles': ['CN Yet Another Wave banner.png']},
            # The post's image cannot be had: the wiki's upload of the same art is.
            {'path': 'headhunting-banner-images/CN 5101-2.webp', 'urls': [gone], 'wikiFiles': ['CN Abyssal Cruise banner.png']},
            # A page instead of the picture, then a strip no key art is: each is passed over, and
            # the wiki's upload is had.
            {'path': 'event-poster/CN 5101-3.webp', 'urls': [challenge, divider], 'wikiFiles': ['CN Abyssal Cruise banner.png']},
            # Neither: left out, saying both.
            {'path': 'headhunting-banner-images/Nowhere.webp', 'urls': [gone], 'wikiFiles': ['CN Nowhere banner.png']},
            # An address on no official host, or not https, is never requested.
            {'path': 'event-poster/CN 9999-1.webp', 'urls': ['https://images.example/a.jpg', 'http://web.hycdn.cn/upload/a.jpg']},
        ]}
        with tempfile.TemporaryDirectory() as temporary:
            image_root, app = Path(temporary)/'image', Path(temporary)/'app'
            asset_repository(image_root)
            (app/'data').mkdir(parents=True)
            (Path(temporary)/'plan.json').write_text(json.dumps(plan))
            cwd = os.getcwd()
            try:
                os.chdir(app)
                with patch.object(publish, 'fetch', fetch), patch.dict(os.environ, {'ARKPEDIA_NOW': '2026-10-06T20:00:00Z'}), patch.object(sys, 'stderr', io.StringIO()):
                    publish.main([str(Path(temporary)/'plan.json'), str(image_root)])
            finally:
                os.chdir(cwd)
            manifest = json.loads((image_root/'asset-manifest.json').read_text())['files']
            provenance = json.loads((image_root/'sources/catalogue-imports.json').read_text())
            entries = json.loads((app/'data/quarantine.json').read_text())['entries']
            built = Image.open(image_root/'event-poster/CN 5101-1.webp')

        self.assertEqual(sorted(manifest), ['event-poster/CN 5101-1.webp', 'event-poster/CN 5101-3.webp', 'headhunting-banner-images/CN 5101-2.webp'])
        self.assertEqual(provenance['event-poster/CN 5101-3.webp']['url'], wiki_url)
        self.assertEqual(fetched.count(challenge) + fetched.count(divider), 2)
        # The poster's own 1560x500, which the folder's 1600px box keeps.
        self.assertEqual((built.width, built.height, manifest['event-poster/CN 5101-1.webp']['width']), (1560, 500, 1560))
        self.assertEqual(provenance['event-poster/CN 5101-1.webp'], {'url': official, 'sha256': hashlib.sha256(poster).hexdigest()})
        self.assertEqual(provenance['headhunting-banner-images/CN 5101-2.webp']['url'], wiki_url)
        self.assertFalse(any('Yet Another Wave' in url for url in fetched), 'the wiki is asked only when the post\'s image cannot be had')
        self.assertNotIn('https://images.example/a.jpg', fetched)
        self.assertNotIn('http://web.hycdn.cn/upload/a.jpg', fetched)
        reasons = {e['key']: e['reason'] for e in entries}
        self.assertEqual(sorted(reasons), ['art:event-poster/CN 9999-1.webp', 'art:headhunting-banner-images/Nowhere.webp'])
        self.assertIn(f'No official image could be had (downloading the official image {gone} failed), and the wiki has no upload for File:CN Nowhere banner.png yet',
            reasons['art:headhunting-banner-images/Nowhere.webp'])
        self.assertIn('is not on an official image host (web.hycdn.cn) and is never fetched', reasons['art:event-poster/CN 9999-1.webp'])
        # The day's error text goes to the log, never into a release input.
        self.assertFalse(any('Tuesday' in reason for reason in reasons.values()))
        self.assertEqual({e['sourceRef'] for e in entries}, {gone, 'https://images.example/a.jpg'})

    def test_a_mirror_file_that_fails_or_does_not_decode_is_left_out_and_reported_while_the_rest_is_built(self):
        base = f'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/{REVISION}'
        responses = {f'{base}/avatar/char_900_test.png': png('#c03030'), f'{base}/avatar/char_901_html.png': b'<html>rate limited</html>'}

        def fetch(url):
            if url in responses:
                return responses[url]
            raise subprocess.CalledProcessError(22, ['curl'], output=b'', stderr=b'404')

        plan = {'sourceRepository': 'yuanyan3060/ArknightsGameResource', 'revision': REVISION, 'files': [
            {'path': 'six-star-icons/Test - Base.webp', 'sourcePath': 'avatar/char_900_test.png'},
            {'path': 'six-star-icons/Renamed - Base.webp', 'sourcePath': 'avatar/char_902_renamed.png'},
            {'path': 'six-star-icons/Html - Base.webp', 'sourcePath': 'avatar/char_901_html.png'},
        ]}
        alerts = []
        with tempfile.TemporaryDirectory() as temporary:
            image_root, skin_root = Path(temporary)/'image', Path(temporary)/'skin'
            asset_repository(image_root)
            asset_repository(skin_root, ('build_artwork_variants.py', 'def build_one(job):\n    return job[0], {}\n'))
            with patch.object(publish, 'fetch', fetch):
                publish.build(plan, image_root, skin_root, alerts)
            manifest = json.loads((image_root/'asset-manifest.json').read_text())['files']
        self.assertEqual(list(manifest), ['six-star-icons/Test - Base.webp'])
        self.assertEqual([(a['key'], a['action'], a['sourceRef']) for a in alerts], [
            ('art:six-star-icons/Renamed - Base.webp', 'published-partial', f'{base}/avatar/char_902_renamed.png'),
            ('art:six-star-icons/Html - Base.webp', 'published-partial', f'{base}/avatar/char_901_html.png'),
        ])
        self.assertIn('Downloading avatar/char_902_renamed.png from yuanyan3060/ArknightsGameResource failed', alerts[0]['reason'])
        self.assertIn('is not an image that decodes', alerts[1]['reason'])
    def test_the_same_art_failing_on_two_days_of_an_outage_writes_the_same_quarantine_file(self):
        # data/quarantine.json is a release input. The same files failing the same way must
        # leave it byte for byte the same whatever the day's error said, and whatever commit
        # the mirror moved to overnight; the error goes to the log.
        def day(revision, wiki_error, mirror_error, html):
            base = f'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/{revision}'
            def fetch(url):
                if url.startswith(publish.quarantine.WIKI_API):
                    if 'CN Down banner.png' in dict(parse_qsl(urlparse(url).query))['titles']:
                        raise subprocess.CalledProcessError(wiki_error, ['curl', url], output=b'', stderr=b'')
                    return json.dumps({'query': {'pages': {'1': {'title': 'File:CN Gone banner.png',
                        'imageinfo': [{'url': 'https://arknights.wiki.gg/images/CN_Gone_banner.png?0a1b2c', 'sha1': '0' * 40}]}}}}).encode()
                if url == f'{base}/avatar/char_901_html.png':
                    return html
                raise subprocess.CalledProcessError(mirror_error, ['curl', url], output=b'', stderr=b'')
            plan = {'sourceRepository': 'yuanyan3060/ArknightsGameResource', 'revision': revision, 'files': [
                {'path': 'six-star-icons/Renamed - Base.webp', 'sourcePath': 'avatar/char_902_renamed.png'},
                {'path': 'six-star-icons/Html - Base.webp', 'sourcePath': 'avatar/char_901_html.png'},
                {'path': 'headhunting-banner-images/Down.webp', 'wikiFiles': ['CN Down banner.png']},
                {'path': 'event-poster/Gone.webp', 'wikiFiles': ['CN Gone banner.png']},
            ]}
            return fetch, plan

        with tempfile.TemporaryDirectory() as temporary:
            app = Path(temporary)/'app'
            (app/'data').mkdir(parents=True)
            files, logs = [], []
            for now, (fetch, plan) in (('2026-09-23T20:00:00Z', day('a' * 40, 7, 22, b'<html>maintenance</html>')),
                                       ('2026-09-24T20:00:00Z', day('b' * 40, 28, 56, b'<html>rate limited</html>'))):
                image_root, skin_root = Path(temporary)/now/'image', Path(temporary)/now/'skin'
                asset_repository(image_root)
                asset_repository(skin_root, ('build_artwork_variants.py', 'def build_one(job):\n    return job[0], {}\n'))
                (Path(temporary)/'plan.json').write_text(json.dumps(plan))
                cwd, log = os.getcwd(), io.StringIO()
                try:
                    os.chdir(app)
                    with patch.object(publish, 'fetch', fetch), patch.dict(os.environ, {'ARKPEDIA_NOW': now}), patch.object(sys, 'stderr', log):
                        publish.main([str(Path(temporary)/'plan.json'), str(image_root), str(skin_root)])
                finally:
                    os.chdir(cwd)
                files.append((app/'data/quarantine.json').read_text())
                logs.append(log.getvalue())
            entries = json.loads(files[1])['entries']

        self.assertEqual(files[1], files[0])
        self.assertEqual({e['key']: e['reason'] for e in entries}, {
            'art:event-poster/Gone.webp': 'Downloading File:CN Gone banner.png on the EN wiki failed; the record is published without event-poster/Gone.webp until a later run imports it.',
            'art:headhunting-banner-images/Down.webp': 'The wiki could not be reached to ask for File:CN Down banner.png; the record is published without headhunting-banner-images/Down.webp until a later run imports it.',
            'art:six-star-icons/Html - Base.webp': 'avatar/char_901_html.png is not an image that decodes; the record is published without six-star-icons/Html - Base.webp until a later run imports it.',
            'art:six-star-icons/Renamed - Base.webp': 'Downloading avatar/char_902_renamed.png from yuanyan3060/ArknightsGameResource failed; the record is published without six-star-icons/Renamed - Base.webp until a later run imports it.',
        })
        # The mirror's permalink stays the one first reported (scripts/lib/quarantine.mjs).
        self.assertTrue(all('b' * 40 not in e.get('sourceRef', '') for e in entries))
        self.assertIn('exit status 7', logs[0])
        self.assertIn('exit status 28', logs[1])
        self.assertIn('exit status 56', logs[1])


def staged_file(app, kind, target, data, stage='ok', mirror=None, source=None):
    """An importer's staged file and its listing, as scripts/imports/staged_art.py writes them."""
    folder = app/'.cache'/kind
    folder.mkdir(parents=True, exist_ok=True)
    name = Path(target).stem + '.png'
    (folder/name).write_bytes(data)
    listing = folder/'staged.json'
    files = json.loads(listing.read_text())['files'] if listing.exists() else {}
    files[target] = {'file': name, 'source': source or f'https://example.invalid/{name}', 'sha256': publish.sha(data),
                     **({'mirror': {**mirror, 'blob': git_blob(data)}} if mirror else {})}
    listing.write_text(json.dumps({'version': 1, 'kind': kind, 'files': files}))


class StagedArt(unittest.TestCase):
    """The art the refresh's importers staged under .cache/, published by the same builder."""

    def test_the_staged_plan_lists_only_what_a_stage_that_ran_to_the_end_staged(self):
        with tempfile.TemporaryDirectory() as temporary:
            app = Path(temporary)
            (app/'data').mkdir()
            staged_file(app, 'stage-renders', 'stages-images/pa-1.webp', png('#101010', (320, 180)),
                        mirror={'repository': 'yuanyan3060/ArknightsGameResource', 'path': 'map/act51side_01.png', 'commit': REVISION})
            staged_file(app, 'item-icons', 'item-icons/act51side_token.png', png('#202020', (183, 183)))
            staged_file(app, 'is-nodes', 'stages-images/ro9_n_1_1.webp', png('#303030', (512, 286)))
            (app/'data/stage-report.json').write_text(json.dumps({'version': 1, 'stages': [
                {'stage': 'stage-renders', 'status': 'ok'}, {'stage': 'item-icons', 'status': 'ok'},
                # Rolled back with the dataset it ran on: what it staged waits for a run that keeps it.
                {'stage': 'is-nodes', 'status': 'rolled-back'}]}))
            plan = publish.staged_plan(app)
            self.assertEqual([(e['path'], e['stage'], e['localPath']) for e in plan['files']], [
                ('item-icons/act51side_token.png', 'item-icons', '.cache/item-icons/act51side_token.png'),
                ('stages-images/pa-1.webp', 'stage-renders', '.cache/stage-renders/pa-1.png'),
            ])
            self.assertEqual(plan['files'][1]['mirror']['path'], 'map/act51side_01.png')
            # A kind may publish only into the folders config/staged-art.json gives it.
            staged_file(app, 'item-icons', 'material-icons/Stray.webp', png('#202020', (183, 183)))
            with self.assertRaisesRegex(ValueError, 'outside the folders'):
                publish.staged_plan(app)

    def test_each_folder_keeps_its_own_size_and_a_mirror_file_is_mapped_with_its_blob(self):
        render, icon, token, cover, crest = (png('#404040', (320, 180)), png('#505050', (183, 183)), png('#606060', (183, 183)),
                                             png('#707070', (800, 800)), png((255, 255, 255, 0), (460, 446)))
        mirror = lambda path: {'repository': 'yuanyan3060/ArknightsGameResource', 'path': path, 'commit': REVISION}
        with tempfile.TemporaryDirectory() as temporary:
            app, image_root = Path(temporary)/'app', Path(temporary)/'image'
            (app/'data').mkdir(parents=True)
            asset_repository(image_root)
            (image_root/'asset-source-map.json').write_text(json.dumps({'version': 1, 'sourceRepository': 'https://github.com/yuanyan3060/ArknightsGameResource', 'files': {}}))
            staged_file(app, 'stage-renders', 'stages-images/pa-1.webp', render, mirror=mirror('map/act51side_01.png'))
            staged_file(app, 'item-icons', 'item-icons/act51side_token.png', icon, mirror=mirror('item/act51side_token.png'))
            staged_file(app, 'reward-icons', 'material-icons/Paper Crown.webp', token, source='https://torappu.prts.wiki/assets/furniture/crown.png')
            staged_file(app, 'album-covers', 'album-covers/月明人间_cover.webp', cover, source='https://web.hycdn.cn/siren/pic/20260924/c.jpg')
            staged_file(app, 'nation-marks', 'nation-marks/atlantis.webp', crest)
            plan = publish.staged_plan(app)
            built = publish.build(plan, image_root, None, [], app)
            manifest = json.loads((image_root/'asset-manifest.json').read_text())['files']
            mapping = json.loads((image_root/'asset-source-map.json').read_text())['files']
            provenance = json.loads((image_root/'sources/catalogue-imports.json').read_text())
            formats = {target: Image.open(image_root/target).format for target in built}
            modes = {target: Image.open(image_root/target).mode for target in built}

        self.assertEqual(sorted(built), sorted(e['path'] for e in plan['files']))
        sizes = {target: (row['width'], row['height']) for target, row in manifest.items()}
        # The game's circled icons at their native 183px, never squeezed to a portrait's 180;
        # a stage render at its own size; a cover at the catalogue's 500px.
        self.assertEqual(sizes, {'stages-images/pa-1.webp': (320, 180), 'item-icons/act51side_token.png': (183, 183),
                                 'material-icons/Paper Crown.webp': (183, 183), 'album-covers/月明人间_cover.webp': (500, 500),
                                 'nation-marks/atlantis.webp': (460, 446)})
        self.assertEqual(formats['item-icons/act51side_token.png'], 'PNG')
        self.assertEqual({formats[t] for t in formats if not t.endswith('.png')}, {'WEBP'})
        self.assertEqual((modes['stages-images/pa-1.webp'], modes['album-covers/月明人间_cover.webp'], modes['nation-marks/atlantis.webp']), ('RGB', 'RGB', 'RGBA'))
        # Only the mirror's files are mapped for the image repository's sync, by the blob of the
        # exact bytes staged and at the width its folder keeps.
        self.assertEqual(mapping, {
            'stages-images/pa-1.webp': {'sourcePath': 'map/act51side_01.png', 'sourceBlob': git_blob(render), 'maxWidth': 512},
            'item-icons/act51side_token.png': {'sourcePath': 'item/act51side_token.png', 'sourceBlob': git_blob(icon), 'maxWidth': 183},
        })
        self.assertEqual(provenance['material-icons/Paper Crown.webp'],
                         {'url': 'https://torappu.prts.wiki/assets/furniture/crown.png', 'sha256': publish.sha(token), 'importer': 'reward-icons'})
        self.assertEqual(provenance['stages-images/pa-1.webp']['importer'], 'stage-renders')

    def test_a_catalogue_token_icon_from_the_mirror_keeps_its_183px_ring(self):
        token = png('#c0a030', (183, 183))
        url = f'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/{REVISION}/item/p_char_900_test.png'
        plan = {'sourceRepository': 'yuanyan3060/ArknightsGameResource', 'revision': REVISION, 'files': [
            {'path': "material-icons/Test's Token.webp", 'sourcePath': 'item/p_char_900_test.png'}]}
        with tempfile.TemporaryDirectory() as temporary:
            image_root, skin_root = Path(temporary)/'image', Path(temporary)/'skin'
            asset_repository(image_root)
            asset_repository(skin_root, ('build_artwork_variants.py', 'def build_one(job):\n    return job[0], {}\n'))
            with patch.object(publish, 'fetch', lambda u: {url: token}[u]):
                publish.build(plan, image_root, skin_root)
            row = json.loads((image_root/'asset-manifest.json').read_text())['files']["material-icons/Test's Token.webp"]
            mapped = json.loads((image_root/'asset-source-map.json').read_text())['files']["material-icons/Test's Token.webp"]
        self.assertEqual((row['width'], row['height'], mapped['maxWidth']), (183, 183, 183))

    def test_a_staged_file_changed_after_staging_undecodable_or_gone_is_left_out_and_logged_but_not_held_again(self):
        # Its importer holds it until a run publishes it (stage-render:pa-2 under
        # stage-renders), so an entry here would name the same file twice in the day's issue.
        with tempfile.TemporaryDirectory() as temporary:
            app, image_root = Path(temporary)/'app', Path(temporary)/'image'
            (app/'data').mkdir(parents=True)
            asset_repository(image_root)
            staged_file(app, 'stage-renders', 'stages-images/pa-1.webp', png('#101010', (320, 180)))
            staged_file(app, 'stage-renders', 'stages-images/pa-2.webp', png('#111111', (320, 180)))
            staged_file(app, 'stage-renders', 'stages-images/pa-4.webp', png('#141414', (320, 180)))
            staged_file(app, 'ra-maps', 'stages-images/ra-9.webp', b'<html>not a map</html>')
            (app/'.cache/stage-renders/pa-2.png').write_bytes(png('#999999', (320, 180)))
            (app/'.cache/stage-renders/pa-4.png').unlink()
            alerts, log = [], io.StringIO()
            with redirect_stderr(log):
                built = publish.build(publish.staged_plan(app), image_root, None, alerts, app)
        self.assertEqual(built, ['stages-images/pa-1.webp'])
        self.assertEqual(alerts, [])
        self.assertIn('Left out stages-images/pa-2.webp: The staged file .cache/stage-renders/pa-2.png is not the file its importer staged', log.getvalue())
        self.assertIn('Left out stages-images/pa-4.webp: The staged file .cache/stage-renders/pa-4.png could not be read: ', log.getvalue())
        self.assertIn('Left out stages-images/ra-9.webp: .cache/ra-maps/ra-9.png is not an image that decodes: ', log.getvalue())

    def test_a_staged_path_outside_the_cache_is_refused(self):
        with tempfile.TemporaryDirectory() as temporary:
            app, image_root = Path(temporary)/'app', Path(temporary)/'image'
            (app/'data').mkdir(parents=True)
            asset_repository(image_root)
            plan = {'files': [{'path': 'stages-images/x.webp', 'localPath': '.cache/../data/x.png', 'stage': 'stage-renders', 'source': 'https://example.invalid/x.png'}]}
            with self.assertRaisesRegex(ValueError, 'Unsafe staged path'):
                publish.build(plan, image_root, None, [], app)
            with self.assertRaisesRegex(ValueError, 'Unexpected asset destination'):
                publish.build({'files': [{'path': 'public/x.webp', 'localPath': '.cache/x.png', 'source': 'https://example.invalid/x.png'}]}, image_root, None, [], app)


if __name__ == '__main__':
    unittest.main()
