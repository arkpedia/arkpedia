"""Offline checks of import_story_map.py: the board page's boot data is read into the map's own
shape, a link once set is kept, a new picture is linked only on a clear match with the reader's
covers, and a picture is drawn from the image repository only once it is published there.

Run with python3 scripts/imports/test-story-map.py.
"""
import io
import json
import os
import random
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import import_story_map as story  # noqa: E402

BOARD_HTML = "<html><head><meta property=\"og:title\" content=\"Arknights Story Map\"></head><script>window['bootstrap'] = JSON.parse('{boot}');</script></html>"


def art(seed, border=0):
    """A picture no other seed resembles, optionally inside a black frame."""
    rng = random.Random(seed)
    image = Image.new('RGB', (120, 150))
    draw = ImageDraw.Draw(image)
    for _ in range(30):
        x, y = rng.randrange(120), rng.randrange(150)
        draw.rectangle([x, y, x + rng.randrange(10, 60), y + rng.randrange(10, 60)], fill=tuple(rng.randrange(40, 256) for _ in range(3)))
    if border:
        framed = Image.new('RGB', (120 + 2 * border, 150 + 2 * border))
        framed.paste(image, (border, border))
        image = framed
    out = io.BytesIO()
    image.save(out, 'PNG')
    return out.getvalue()


def picture(media, x, y):
    return {'A?': 'I', 'A': x, 'B': y, 'D': 400.0, 'C': 400.0, 'a': {'B': {'A': {'A?': 'd', 'A': media, 'B': 1}}}}


def raster(media):
    return {'type': 'RASTER', 'id': media, 'files': [{'url': f'https://media.example/{media}/{h}', 'height': h, 'width': h} for h in (50, 384)]}


def boot(pictures=12, extra=()):
    elements = [picture(f'M{i:02d}', i * 500.0, 0.0) for i in range(pictures)]
    elements += [
        {'A?': 'K', 'A': 10.0, 'B': -200.0, 'D': 800.0, 'C': 96.0,
         'a': {'C': {'A': ['Chernobog (First Main Story)\n'], 'C': [{'G': '80px', 'c': 'center'}, {'M': '#000000'}]}}},
        {'A?': 'U', 'A': 0, 'B': 0, 'D': 50, 'C': 10, 'a': 10, 'd': '#5170ff', 'e': [3, 1],
         'b': {'C': {'A': 100.0, 'B': 400.0}}, 'c': {'C': {'A': 100.0, 'B': 900.0}}},
        # A group, as the board nests its frames: its members are drawn like any other.
        {'A?': 'i', 'E': [{'A?': 'J', 'A': -50.0, 'B': -250.0, 'D': 642.0, 'C': 177.0,
                           'b': [{'A': 'M0 0H64V64H0z', 'B': {'A': False, 'C': '#ff3131'}, 'D': 30.0}],
                           'c': {'A': {'D': 64, 'C': 64}, 'B': 214.0, 'C': 59.0},
                           'f': [{'A': {'C': {'A': ['OPTIONAL\n'], 'C': [{'G': '33.3px', 'I': 'bold', 'M': '#ffffff', 'c': 'center'}]}}}]}]},
        *extra,
    ]
    return {'page': {'Bj': {'A': elements}}, 'media': [raster(f'M{i:02d}') for i in range(pictures + 2)]}


def page(data):
    # A single-quoted JavaScript string: backslashes and quotes escaped, as the page writes it.
    text = json.dumps(data).replace('\\', '\\\\').replace("'", "\\'")
    return BOARD_HTML.replace('{boot}', text)


class ParseTests(unittest.TestCase):
    def test_a_javascript_string_decodes_as_the_browser_would(self):
        self.assertEqual(story.js_string(r"kukkikaze’s \'pick\' \\ \/ 😀"), "kukkikaze’s 'pick' \\ / \U0001F600")

    def test_the_board_reads_into_the_maps_own_shape_in_paint_order(self):
        elements, media = story.board_elements(story.bootstrap(page(boot())))
        kinds = [e['type'] for e in elements]
        self.assertEqual(kinds, ['picture'] * 12 + ['text', 'line', 'shape'])
        self.assertEqual(elements[0], {'type': 'picture', 'id': 'M00', 'x': 0.0, 'y': 0.0, 'width': 400.0, 'height': 400.0})
        # Canva's "A" is the top and "B" the left: the second picture, at A 0 and B 500, is beside the first.
        self.assertEqual((elements[1]['x'], elements[1]['y']), (0.0, 500.0))
        self.assertEqual(elements[12]['text'], 'Chernobog (First Main Story)')
        self.assertEqual((elements[12]['size'], elements[12]['align'], elements[12]['color']), (80.0, 'center', '#000000'))
        self.assertEqual(elements[13], {'type': 'line', 'x1': 400.0, 'y1': 100.0, 'x2': 900.0, 'y2': 100.0, 'color': '#5170ff', 'width': 10.0, 'dash': [3, 1]})
        shape = elements[14]
        self.assertEqual((shape['fill'], shape['stroke'], shape['radius'], shape['width'], shape['height']), ('#ff3131', None, 30.0, 642.0, 177.0))
        self.assertEqual((shape['label']['text'], shape['label']['bold'], shape['label']['color']), ('OPTIONAL', True, '#ffffff'))
        self.assertIn('M00', media)

    def test_a_page_that_no_longer_boots_the_same_way_fails(self):
        with self.assertRaises(ValueError):
            story.bootstrap('<html>Unsupported client</html>')
        with self.assertRaises(ValueError):
            story.board_elements(story.bootstrap(page(boot(pictures=3))))

    def test_a_picture_naming_no_media_of_the_board_fails(self):
        data = boot(extra=[picture('MISSING', 0.0, 900.0)])
        with self.assertRaises(ValueError):
            story.board_elements(story.bootstrap(page(data)))


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.root = Path(self.dir.name)
        (self.root/'data').mkdir()
        self.out = self.root/'data/story-map.json'
        self.reports = []
        self.saved = {name: getattr(story, name) for name in ('root', 'OUT', 'fetch', 'published_assets', 'report')}
        story.root, story.OUT = str(self.root), str(self.out)
        story.report = lambda stage, entries: self.reports.append((stage, entries))
        self.published = set()
        story.published_assets = lambda: frozenset(self.published)
        # M00 is cover act1 inside a frame; M01 resembles nothing the reader has.
        self.thumbs = {f'M{i:02d}': art(1000 + i) for i in range(14)}
        self.thumbs['M00'] = art(1, border=12)
        covers = {'act1side': ('side', art(1)), 'act2side': ('side', art(2)), 'main_0': ('main', art(3))}
        board = page(boot())

        def fetch(url, timeout=60):
            if url == story.BOARD:
                return board.encode()
            if url.startswith('https://media.example/'):
                return self.thumbs[url.split('/')[3]]
            if url.endswith('json/covers.json'):
                return json.dumps({'groups': {g: {'category': c, 'cover': f'{g}.png', 'title': g.upper()} for g, (c, _) in covers.items()}}).encode()
            if '/covers/' in url:
                return covers[url.rsplit('/', 1)[1][:-4]][1]
            if url == story.COMICS:
                return json.dumps({'data': {'rows': self.comics}}).encode()
            if url.startswith('https://covers.example/'):
                return art(77)
            if url.endswith('json/catalog.en.json'):
                return json.dumps({'review': {'act1side': {'name': 'Grani and the Knights\' Treasure'}}}).encode()
            raise AssertionError(url)
        story.fetch = fetch
        self.comics = [{'name': "Sui's Daily Slices: Time for Reunion", 'smallImage': 'https://covers.example/sui.png', 'bigImage': 'https://covers.example/book.png', 'comicDescribe': '<p>Dishes, people, and time&nbsp;aplenty.</p>', 'latestChapter': 1, 'updateTime': 1784688256532},
                       {'name': 'Operations Preparation Detachment A1', 'bigImage': 'https://covers.example/a1.png', 'comicDescribe': 'Columbia', 'latestChapter': 13, 'updateTime': 1758103823597}]
        self.cwd = os.getcwd()
        os.chdir(self.root)

    def tearDown(self):
        os.chdir(self.cwd)
        for name, value in self.saved.items():
            setattr(story, name, value)
        self.dir.cleanup()

    def pictures(self):
        return {e['id']: e for e in json.loads(self.out.read_text())['elements'] if e['type'] == 'picture'}

    def alerts(self):
        return {entry['key'] for _, entries in self.reports for entry in entries}

    def test_a_clear_match_links_and_anything_less_is_reported(self):
        story.main()
        pictures = self.pictures()
        self.assertEqual(pictures['M00']['link'], {'title': "Grani and the Knights' Treasure", 'url': 'https://arknights.timo.beer/story.html#side&act1side&0', 'story': 'act1side'})
        self.assertNotIn('link', pictures['M01'])
        self.assertIn('story-map:M01', self.alerts())
        self.assertNotIn('story-map:M00', self.alerts())

    def test_art_is_staged_until_published_and_drawn_only_after(self):
        story.main()
        self.assertIsNone(self.pictures()['M00']['image'])
        staged = json.loads((self.root/'.cache/story-map/staged.json').read_text())['files']
        self.assertIn('story-map/M00.webp', staged)
        self.assertIn('story-map-art:M00', self.alerts())
        self.published = {f'story-map/M{i:02d}.webp' for i in range(14)} | {
            f'story-map/{story.comic_id(c["name"])}.webp' for c in self.comics}
        self.reports.clear()
        story.main()
        self.assertEqual(self.pictures()['M00']['image'], 'story-map/M00.webp')
        self.assertFalse(any(key.startswith('story-map-art:') for key in self.alerts()))

    def test_a_link_once_set_is_kept_even_against_a_match(self):
        story.main()
        record = json.loads(self.out.read_text())
        for element in record['elements']:
            if element.get('id') == 'M00':
                element['link'] = {'title': 'Corrected by hand', 'url': 'https://example.org/'}
            if element.get('id') == 'M01':
                element['link'] = {'title': 'A manga the reader does not carry', 'url': None}
        self.out.write_text(json.dumps(record))
        self.reports.clear()
        story.main()
        pictures = self.pictures()
        self.assertEqual(pictures['M00']['link']['title'], 'Corrected by hand')
        self.assertEqual(pictures['M01']['link'], {'title': 'A manga the reader does not carry', 'url': None})
        self.assertNotIn('story-map:M01', self.alerts())

    def test_a_new_comic_is_unplaced_a_placed_one_stays_and_the_sites_words_refresh(self):
        story.main()
        comics = {c['id']: c for c in json.loads(self.out.read_text())['manga']}
        sui = comics['manga-sui-s-daily-slices-time-for-reunion']
        self.assertIsNone(sui['section'])
        self.assertEqual(sui['url'], 'https://www.arknights.global/comic?name=Sui%27s%20Daily%20Slices%3A%20Time%20for%20Reunion&chapter=1')
        self.assertEqual((sui['description'], sui['chapters'], sui['updated']), ('Dishes, people, and time aplenty.', 1, '2026-07-22'))
        self.assertEqual(comics['manga-operations-preparation-detachment-a1']['latestUrl'][-11:], '&chapter=13')
        self.assertEqual(sui['cover'], 'https://covers.example/sui.png', 'the flat cover, not the book mock-up')
        self.assertIn('story-map/manga-sui-s-daily-slices-time-for-reunion.webp', json.loads((self.root/'.cache/story-map/staged.json').read_text())['files'])
        # A person places one; the site then adds a chapter and drops the other.
        record = json.loads(self.out.read_text())
        for comic in record['manga']:
            if comic['id'] == 'manga-sui-s-daily-slices-time-for-reunion':
                comic['section'] = 'Sui'
        self.out.write_text(json.dumps(record))
        self.comics = [{**self.comics[0], 'latestChapter': 2}]
        story.main()
        comics = {c['id']: c for c in json.loads(self.out.read_text())['manga']}
        self.assertEqual((comics['manga-sui-s-daily-slices-time-for-reunion']['section'], comics['manga-sui-s-daily-slices-time-for-reunion']['chapters']), ('Sui', 2))
        self.assertIn('manga-operations-preparation-detachment-a1', comics, 'a comic the site drops is kept')

    def test_an_unreadable_comic_list_keeps_the_manga_and_says_so(self):
        story.main()
        before = json.loads(self.out.read_text())['manga']
        self.comics = None
        self.reports.clear()
        story.main()
        self.assertEqual([c['id'] for c in json.loads(self.out.read_text())['manga']], [c['id'] for c in before])
        self.assertIn('story-map-manga', self.alerts())


if __name__ == '__main__':
    unittest.main()
