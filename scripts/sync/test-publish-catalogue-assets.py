"""Offline checks for the catalogue media import; run with python3 scripts/sync/test-publish-catalogue-assets.py."""
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
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
            'art:event-poster/Gone.webp': 'Downloading https://arknights.wiki.gg/images/CN_Gone_banner.png?0a1b2c failed; the record is published without event-poster/Gone.webp until a later run imports it.',
            'art:headhunting-banner-images/Down.webp': 'The wiki could not be reached to ask for File:CN Down banner.png; the record is published without headhunting-banner-images/Down.webp until a later run imports it.',
            'art:six-star-icons/Html - Base.webp': 'avatar/char_901_html.png is not an image that decodes; the record is published without six-star-icons/Html - Base.webp until a later run imports it.',
            'art:six-star-icons/Renamed - Base.webp': 'Downloading avatar/char_902_renamed.png from yuanyan3060/ArknightsGameResource failed; the record is published without six-star-icons/Renamed - Base.webp until a later run imports it.',
        })
        # The mirror's permalink stays the one first reported (scripts/lib/quarantine.mjs).
        self.assertTrue(all('b' * 40 not in e.get('sourceRef', '') for e in entries))
        self.assertIn('exit status 7', logs[0])
        self.assertIn('exit status 28', logs[1])
        self.assertIn('exit status 56', logs[1])


if __name__ == '__main__':
    unittest.main()
