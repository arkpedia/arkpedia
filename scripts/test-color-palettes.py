"""Offline generator checks; run with python3 scripts/test-color-palettes.py."""
import importlib.util
from pathlib import Path
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
            store = server.ReviewStore(root)
            payload = {'key': key, 'review': {**self.review, 'sourceSha256': digest}}
            saved = store.save(payload)
            self.assertEqual(store.catalog()[0]['status'], 'approved')
            self.assertEqual(store.details(key)['review'], saved)
            with self.assertRaises(ValueError):
                store.save(payload)
            with patch.multiple(generator, ROOT=root, OUTPUT=manifest_path, FEATURES=features_path), patch.object(generator, 'load_reviews', lambda: load_reviews(store.reviews_path)):
                generator.main()
                first = json.loads(manifest_path.read_text())['artworks'][key]
                self.assertEqual(first['colors'], self.colors)
                self.assertIn('reviewSha256', first)
                features = json.loads(features_path.read_text())
                features['references']['black'] = '#00ff00'
                atomic_json(features_path, features)
                generator.main()
                self.assertEqual(json.loads(manifest_path.read_text())['artworks'][key], first)
                self.image.putpixel((0, 0), (1, 2, 3, 255))
                self.image.save(art, lossless=True)
                self.assertEqual(store.catalog()[0]['status'], 'stale')
                with self.assertRaises(ValueError):
                    generator.main()
                self.assertEqual(json.loads(manifest_path.read_text())['artworks'][key], first)


if __name__ == '__main__':
    unittest.main()
