"""Offline generator checks; run with python3 scripts/palettes/test-color-palettes.py."""
import importlib.util
from contextlib import redirect_stderr
from io import BytesIO, StringIO
from pathlib import Path
from types import SimpleNamespace
import unittest
import tempfile
import hashlib
import json
from copy import deepcopy
from unittest.mock import patch
import sys
sys.dont_write_bytecode = True
from PIL import Image, ImageDraw

spec = importlib.util.spec_from_file_location('palettes', Path(__file__).with_name('build-color-palettes.py'))
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


class FeaturePalettes(unittest.TestCase):
    def test_small_features_are_not_outvoted_by_neutral_clothing(self):
        image = Image.new('RGBA', (100, 100), '#404040')
        draw = ImageDraw.Draw(image)
        colors = ['#b0c570', '#ebebeb', '#307fba', '#282828', '#ead040']
        for i, color in enumerate(colors):
            draw.rectangle((i * 10, 0, i * 10 + 2, 2), fill=color)
        self.assertEqual(generator.palette(image, colors), colors)

    def test_transparent_padding_cannot_supply_a_requested_color(self):
        image = Image.new('RGBA', (100, 100), (255, 0, 0, 0))
        ImageDraw.Draw(image).rectangle((45, 45, 55, 55), fill='#2070b0')
        self.assertEqual(generator.palette(image, ['#ff0000'] * 5), ['#2070b0'] * 5)

    def test_roles_keep_their_order_instead_of_sorting_by_brightness(self):
        image = Image.new('RGBA', (50, 10))
        colors = ['#eeeeee', '#222222', '#888888', '#444444', '#cccccc']
        draw = ImageDraw.Draw(image)
        for i, color in enumerate(colors):
            draw.rectangle((i * 10, 0, i * 10 + 9, 9), fill=color)
        self.assertEqual(generator.palette(image, colors), colors)

    def test_recipe_change_invalidates_the_cache(self):
        roles = ['hair', 'outfit-primary', 'outfit-secondary', 'outfit-detail', 'standout']
        a = ['#000000'] * 5
        b = [*a[:4], '#ffdd00']
        self.assertNotEqual(generator.recipe_digest(roles, a), generator.recipe_digest(roles, b))

    def test_empty_artwork_is_rejected(self):
        with self.assertRaises(ValueError):
            generator.palette(Image.new('RGBA', (10, 10)), ['#000000'] * 5)


ROLES = ['hair', 'outfit-primary', 'outfit-secondary', 'outfit-detail', 'standout']
NO_RECIPES = {'roles': ROLES, 'references': {}, 'artworks': {}}


def webp(image):
    out = BytesIO()
    image.save(out, 'WEBP', lossless=True)
    return out.getvalue()


def figure():
    """A standing figure on a transparent canvas: red hair over the top sixth, a skin band, then
    a body of blue, grey and white with one small yellow badge."""
    image = Image.new('RGBA', (60, 120), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 59, 19), fill='#c03030')
    draw.rectangle((0, 20, 59, 39), fill='#f0d0b0')
    draw.rectangle((0, 40, 29, 119), fill='#2040a0')
    draw.rectangle((30, 40, 44, 119), fill='#606060')
    draw.rectangle((45, 40, 59, 119), fill='#f0f0f0')
    draw.rectangle((10, 60, 14, 64), fill='#f0e020')
    return image


class FakeSkins:
    """A skin repository in memory: {path: bytes}, with the manifest listing each file's sha256
    (or `digests` overriding one)."""

    def __init__(self, files, digests=None):
        self.files, self.fetched = files, []
        self.digests = {path: hashlib.sha256(data).hexdigest() for path, data in files.items()}
        self.digests.update(digests or {})

    def manifest(self):
        return {'files': {path: {'sha256': digest} for path, digest in self.digests.items()}}

    def fetch(self, path):
        self.fetched.append(path)
        return self.files[path]

    def describe(self):
        return 'fake'


class ReleaseStage(unittest.TestCase):
    """The palettes stage: every Base/Elite 2 artwork the pinned skin repository lists gets a
    palette, and one artwork's problem is held for that artwork alone."""

    path = 'five-star-skins/Example - Base.webp'
    key = '/' + path

    def test_new_art_without_a_review_or_recipe_gets_an_automatic_palette_and_a_hold(self):
        skins = FakeSkins({self.path: webp(figure()), 'five-star-skins/Example - Outfit.webp': b'not art'})
        output, holds = generator.build(skins, {}, NO_RECIPES, {})
        entry = output['artworks'][self.key]
        self.assertEqual(list(output['artworks']), [self.key], 'outfits are not palette art')
        self.assertEqual(entry['automatic'], generator.AUTOMATIC)
        self.assertEqual(entry['sha256'], skins.digests[self.path])
        self.assertEqual(len(entry['colors']), 5)
        self.assertTrue(all(len(color) == 7 and color.startswith('#') for color in entry['colors']))
        self.assertEqual([(h['key'], h['action']) for h in holds], [('palette:' + self.key, 'published-partial')])
        self.assertIn('npm run palettes:review', holds[0]['reason'])

    def test_automatic_palettes_follow_the_games_slot_order(self):
        colors = generator.palette(figure(), generator.automatic_targets(figure()))
        self.assertEqual(colors[0], '#c03030', 'the top of the figure is its hair')
        self.assertEqual(colors[4], '#f0e020', 'the most saturated visible detail is the accent')
        self.assertEqual(set(colors[1:4]), {'#2040a0', '#606060', '#f0f0f0'})

    def test_unchanged_art_is_not_downloaded_again(self):
        skins = FakeSkins({self.path: webp(figure())})
        first, _ = generator.build(skins, {}, NO_RECIPES, {})
        skins.fetched.clear()
        again, holds = generator.build(skins, {}, NO_RECIPES, first)
        self.assertEqual(skins.fetched, [])
        self.assertEqual(again, first)
        self.assertEqual(len(holds), 1, 'still unreviewed, so still held')

    def test_a_recipe_or_review_replaces_the_automatic_palette(self):
        skins = FakeSkins({self.path: webp(figure())})
        features = {'roles': ROLES, 'references': {'red': '#ff0000', 'blue': '#0000ff'}, 'artworks': {self.key: ['red', 'blue', 'blue', 'blue', 'red']}}
        output, holds = generator.build(skins, {}, features, {})
        self.assertIn('recipeSha256', output['artworks'][self.key])
        self.assertNotIn('automatic', output['artworks'][self.key])
        self.assertEqual(holds, [])
        colors = ['#111111', '#222222', '#333333', '#444444', '#555555']
        review = {'status': 'accepted', 'sourceSha256': skins.digests[self.path], 'colors': colors}
        output, holds = generator.build(skins, {self.key: review}, NO_RECIPES, {})
        self.assertEqual(output['artworks'][self.key]['colors'], colors)
        self.assertEqual(holds, [])

    def test_art_changed_since_its_review_keeps_its_previous_palette(self):
        skins = FakeSkins({self.path: webp(figure())})
        previous = {'version': generator.VERSION, 'artworks': {self.key: {'colors': ['#010101'] * 5, 'sha256': 'old', 'reviewSha256': 'x'}}}
        review = {'status': 'accepted', 'sourceSha256': 'old', 'colors': ['#010101'] * 5}
        output, holds = generator.build(skins, {self.key: review}, NO_RECIPES, previous)
        self.assertEqual(output['artworks'][self.key], previous['artworks'][self.key])
        self.assertEqual([(h['key'], h['action']) for h in holds], [('palette:' + self.key, 'kept-previous')])

    def test_unreadable_or_mismatched_new_art_is_left_out_alone(self):
        good = 'five-star-skins/Other - Base.webp'
        for skins in (FakeSkins({self.path: b'not an image', good: webp(figure())}),
                      FakeSkins({self.path: webp(figure()), good: webp(figure())}, {self.path: 'f' * 64})):
            output, holds = generator.build(skins, {}, NO_RECIPES, {})
            self.assertEqual(output['unavailable'], [self.key])
            self.assertIn('/' + good, output['artworks'])
            self.assertIn(('palette:' + self.key, 'omitted-new'), [(h['key'], h['action']) for h in holds])

    def test_a_manifest_without_artwork_fails_the_run_before_anything_is_written(self):
        for manifest in ({'files': {}}, {'files': {'five-star-skins/Outfit - Summer.webp': {'sha256': '0' * 64}}},
                         {'files': {self.path: {}}}, {'nope': 1}):
            skins = FakeSkins({})
            skins.manifest = lambda manifest=manifest: manifest
            with self.subTest(manifest=manifest), self.assertRaises(ValueError):
                generator.build(skins, {}, NO_RECIPES, {})

    def test_the_pinned_source_reads_one_commit_only(self):
        for revision in (None, 'main', 'master', 'eb9f58b6'):
            with self.subTest(revision=revision), self.assertRaises(ValueError):
                generator.PinnedSkins(revision)
        self.assertEqual(generator.PinnedSkins('a' * 40).describe(), 'arkpedia-skin-assets@' + 'a' * 12)

    def test_the_command_needs_a_source(self):
        with self.assertRaises(SystemExit), redirect_stderr(StringIO()):
            generator.main([])


from palette_review import validate_review, approved_palette, atomic_json, load_reviews
server_spec = importlib.util.spec_from_file_location('review_server', Path(__file__).with_name('review-color-palettes.py'))
server = importlib.util.module_from_spec(server_spec)
server_spec.loader.exec_module(server)


class ManualReviews(unittest.TestCase):
    def setUp(self):
        self.image = Image.new('RGBA', (6, 1))
        self.colors = ['#a0a0b0', '#202030', '#6080b0', '#eeeeee', '#703040']
        for x, color in enumerate(self.colors):
            self.image.putpixel((x, 0), tuple(bytes.fromhex(color[1:])) + (255,))
        self.review = {'sourceSha256': 'source', 'status': 'approved', 'notes': '',
                       'samples': [{'x': x, 'y': 0, 'color': color, 'label': f'Feature {x}'} for x, color in enumerate(self.colors)]}

    def test_approved_colors_are_exact_and_drafts_do_not_override(self):
        self.assertEqual(approved_palette(self.review, self.image, 'source')['colors'], self.colors)
        for status in ('draft', 'flagged'):
            self.assertIsNone(approved_palette({**self.review, 'status': status}, self.image, 'source'))

    def test_accepted_suggestion_preserves_colors_without_inventing_pixel_samples(self):
        review = {'status': 'accepted', 'sourceSha256': 'source', 'colors': self.colors}
        result = approved_palette(review, self.image, 'source')
        self.assertEqual(result['colors'], self.colors)
        self.assertIn('reviewSha256', result)
        for invalid in ({**review, 'sourceSha256': 'old'}, {**review, 'colors': ['#123456']},
                        {**review, 'colors': ['bad'] * 5}):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                approved_palette(invalid, self.image, 'source')
        self.assertIsNone(approved_palette({**review, 'status': 'declined'}, self.image, 'source'))

    def test_quick_decisions_and_undo_preserve_other_reviews_and_reject_stale_choices(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'public/five-star-skins').mkdir(parents=True)
            (root / 'data').mkdir()
            key = '/five-star-skins/Example - Base.webp'
            self.image.save(root / 'public' / key.lstrip('/'), lossless=True)
            atomic_json(root / 'data/color-palettes.json', {'artworks': {key: {'colors': self.colors}}})
            prior = {'status': 'draft', 'sourceSha256': 'unused', 'notes': 'Keep this other review'}
            atomic_json(root / 'data/color-palette-reviews.json', {'version': 1, 'artworks': {'other': prior}})
            store = server.ReviewStore(root)
            details = store.details(key)
            payload = {'key': key, 'decision': 'accept', 'sourceSha256': details['sourceSha256'], 'colors': self.colors}
            saved = store.decide(payload)
            self.assertEqual(saved['status'], 'accepted')
            self.assertEqual(load_reviews(store.reviews_path)['artworks']['other'], prior)
            with self.assertRaises(ValueError):
                store.decide(payload)
            store.undo({'key': key, 'updatedAt': saved['updatedAt']})
            self.assertNotIn(key, load_reviews(store.reviews_path)['artworks'])
            with self.assertRaises(ValueError):
                store.decide({**payload, 'colors': ['#ffffff'] * 5})
            declined = store.decide({**payload, 'decision': 'decline'})
            self.assertEqual(declined['status'], 'declined')
            draft = store.save({'key': key, 'previousUpdatedAt': declined['updatedAt'],
                               'review': {'sourceSha256': details['sourceSha256'], 'status': 'draft', 'samples': [None] * 5}})
            with self.assertRaises(ValueError):
                store.undo({'key': key, 'updatedAt': declined['updatedAt']})
            self.assertEqual(load_reviews(store.reviews_path)['artworks'][key], draft)

    def test_stale_or_incomplete_approval_cannot_pass(self):
        with self.assertRaises(ValueError):
            validate_review(self.review, self.image, 'changed')
        for replacement in (None, {**self.review['samples'][0], 'label': ' '},
                            {**self.review['samples'][0], 'color': '#ffffff'},
                            {**self.review['samples'][0], 'x': -1},
                            {**self.review['samples'][0], 'x': True},
                            {'x': 5, 'y': 0, 'color': '#000000', 'label': 'Transparent'}):
            review = deepcopy(self.review)
            review['samples'][0] = replacement
            with self.subTest(replacement=replacement), self.assertRaises(ValueError):
                validate_review(review, self.image, 'source')
        draft = {**self.review, 'status': 'flagged', 'samples': [None] * 5}
        self.assertEqual(validate_review(draft, self.image, 'source')['samples'], [None] * 5)

    def test_saved_approval_survives_reference_changes_and_conflicting_saves_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'public/five-star-skins').mkdir(parents=True)
            (root / 'data').mkdir()
            key = '/five-star-skins/Example - Base.webp'
            art = root / 'public' / key.lstrip('/')
            self.image.save(art, lossless=True)
            digest = hashlib.sha256(art.read_bytes()).hexdigest()
            manifest_path = root / 'data/color-palettes.json'
            atomic_json(manifest_path, {'version': 2, 'artworks': {key: {'colors': ['#000000'] * 5, 'sha256': digest}}})
            features_path = root / 'data/color-palette-features.json'
            atomic_json(features_path, {'roles': ['hair', 'outfit-primary', 'outfit-secondary', 'outfit-detail', 'standout'],
                                       'references': {'black': '#000000'}, 'artworks': {key: ['black'] * 5}})
            # public/ laid out like arkpedia-skin-assets, manifest and all, as the stage reads it.
            skin_manifest = root / 'public/asset-manifest.json'
            publish = lambda: atomic_json(skin_manifest, {'files': {key.lstrip('/'): {'sha256': hashlib.sha256(art.read_bytes()).hexdigest()}}})
            publish()
            store = server.ReviewStore(root)
            payload = {'key': key, 'review': {**self.review, 'sourceSha256': digest}}
            saved = store.save(payload)
            self.assertEqual(store.catalog()[0]['status'], 'approved')
            self.assertEqual(store.details(key)['review'], saved)
            with self.assertRaises(ValueError):
                store.save(payload)
            holds = []
            run = lambda: generator.main(['--source-dir', str(root / 'public')])
            with patch.multiple(generator, ROOT=root, OUTPUT=manifest_path, FEATURES=features_path), \
                    patch.object(generator, 'load_reviews', lambda: load_reviews(store.reviews_path)), \
                    patch.object(generator, 'report', lambda entries: holds.append(entries)):
                run()
                first = json.loads(manifest_path.read_text())['artworks'][key]
                self.assertEqual(first['colors'], self.colors)
                self.assertIn('reviewSha256', first)
                features = json.loads(features_path.read_text())
                features['references']['black'] = '#00ff00'
                atomic_json(features_path, features)
                run()
                self.assertEqual(json.loads(manifest_path.read_text())['artworks'][key], first)
                self.assertEqual(holds, [[], []])
                # The art changes under its approval: the palette stays as approved and the
                # artwork is held for another review, instead of failing every other palette.
                self.image.putpixel((0, 0), (1, 2, 3, 255))
                self.image.save(art, lossless=True)
                publish()
                self.assertEqual(store.catalog()[0]['status'], 'stale')
                run()
                self.assertEqual(json.loads(manifest_path.read_text())['artworks'][key], first)
                self.assertEqual([(h['key'], h['action']) for h in holds[-1]], [('palette:' + key, 'kept-previous')])

    def test_the_reviewer_opens_art_from_the_pinned_skin_repository(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data/assets').mkdir(parents=True)
            key = '/five-star-skins/Example - Base.webp'
            atomic_json(root / 'data/color-palettes.json', {'artworks': {key: {'colors': self.colors}}})
            atomic_json(root / 'data/assets/revisions.json', {'arkpedia-skin-assets': 'b' * 40})
            art = webp(self.image)
            fetched = []
            skins = SimpleNamespace(revision='b' * 40, fetch=lambda path: fetched.append(path) or art)
            with patch.object(server, 'generator_module', lambda: SimpleNamespace(PinnedSkins=lambda revision: skins)):
                store = server.ReviewStore(root)
                path = store.art_path(key)
                self.assertEqual(path, (root / '.cache/palette-art' / ('b' * 40) / key.lstrip('/')).resolve())
                self.assertEqual(path.read_bytes(), art)
                self.assertEqual(store.details(key)['sourceSha256'], hashlib.sha256(art).hexdigest())
                store.art_path(key)
                self.assertEqual(fetched, [key.lstrip('/')], 'downloaded once')


if __name__ == '__main__':
    unittest.main()
