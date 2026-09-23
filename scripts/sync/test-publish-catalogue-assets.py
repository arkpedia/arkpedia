"""Offline checks for the catalogue media import; run with python3 scripts/sync/test-publish-catalogue-assets.py."""
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
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


if __name__ == '__main__':
    unittest.main()
