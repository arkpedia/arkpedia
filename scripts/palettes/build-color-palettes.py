#!/usr/bin/env python3
"""Regenerate the game's five-swatch palettes from Base/Elite 2 art only.

Requires Pillow (python3 -m pip install Pillow). Run manually when artwork changes;
normal website builds read the committed JSON and do not decode hundreds of images.
"""
from pathlib import Path
from PIL import Image, UnidentifiedImageError
import hashlib
import json
import unicodedata
import sys
sys.dont_write_bytecode = True
from palette_review import load_reviews, approved_palette, atomic_json

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'data' / 'color-palettes.json'
FEATURES = ROOT / 'data' / 'color-palette-features.json'
VERSION = 2


def lab(rgb):
    """sRGB to CIELAB, for comparing shades without mixing different hues."""
    r, g, b = [(v / 255 / 12.92 if v / 255 <= .04045 else ((v / 255 + .055) / 1.055) ** 2.4) for v in rgb]
    xyz = ((.4124564*r + .3575761*g + .1804375*b) / .95047,
           .2126729*r + .7151522*g + .0721750*b,
           (.0193339*r + .1191920*g + .9503041*b) / 1.08883)
    x, y, z = [v ** (1/3) if v > .008856 else 7.787*v + 16/116 for v in xyz]
    return (116*y - 16, 500*(x-y), 200*(y-z))


def distance(a, b):
    return sum((x-y)**2 for x, y in zip(a, b))


def recipe_digest(roles, targets):
    return hashlib.sha256(json.dumps([roles, targets], separators=(',', ':')).encode()).hexdigest()


def palette(image, targets):
    """Suggest five reference-guided colors, independent of their pixel area.

    The recipes identify hair, three outfit colors and a standout detail. They
    are visual annotations, not an attempt to infer anatomy from pixel counts.
    Helmets/shells/fur take the first slot when hair is covered or absent.
    """
    image = image.convert('RGBA')
    bounds = image.getchannel('A').getbbox()
    if not bounds:
        raise ValueError('Artwork has no opaque pixels')
    image = image.crop(bounds)
    image.thumbnail((512, 512), Image.Resampling.LANCZOS)
    # Bin only very similar RGB shades (8 levels per channel). Averaging these
    # cannot turn separate green/blue highlights and beige shadows into gray.
    bins = {}
    pixels = image.get_flattened_data() if hasattr(image, 'get_flattened_data') else image.getdata()
    for r, g, b, a in pixels:
        if a < 192:
            continue
        key = (r // 8, g // 8, b // 8)
        total = bins.setdefault(key, [0, 0, 0, 0])
        for k, value in enumerate((r, g, b, 1)):
            total[k] += value
    if sum(bucket[3] for bucket in bins.values()) < 5:
        raise ValueError('Artwork has too few opaque pixels')
    candidates = [tuple(round(v / bucket[3]) for v in bucket[:3]) for bucket in bins.values() if bucket[3] >= 2]
    if not candidates:
        candidates = [tuple(round(v / bucket[3]) for v in bucket[:3]) for bucket in bins.values()]
    candidates = sorted(set(candidates))
    indexed = [(color, lab(color)) for color in candidates]
    selected = []
    for target in targets:
        wanted = lab(tuple(int(target[i:i+2], 16) for i in (1, 3, 5)))
        # If hair and clothing share a color, prefer distinguishable nearby
        # shades; never invent a hue that does not occur in this artwork.
        nearby = sorted(indexed, key=lambda entry: distance(entry[1], wanted))
        best = nearby[0]
        distinct = next((entry for entry in nearby if all(distance(entry[1], prior[1]) >= 64 for prior in selected)), None)
        if distinct and distance(distinct[1], wanted) <= distance(best[1], wanted) + 144:
            best = distinct
        selected.append(best)
    # Keep semantic order: hair, outfit, outfit, outfit, standout.
    return ['#%02x%02x%02x' % color for color, _ in selected]


def main():
    reviews = load_reviews()['artworks']
    features = json.loads(FEATURES.read_text())
    if len(features['roles']) != 5:
        raise ValueError('Exactly five feature roles are required')
    previous = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {}
    cache = previous.get('artworks', {}) if previous.get('version') == VERSION else {}
    artworks = {}
    unavailable = []
    for path in sorted((ROOT / 'public').glob('*-star-skins/*.webp')):
        if not path.name.endswith((' - Base.webp', ' - Elite 2.webp')):
            continue
        key = unicodedata.normalize('NFC', '/' + path.relative_to(ROOT / 'public').as_posix())
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        # Unreadable source files are skipped; a readable but unreviewed image
        # must get a feature recipe before regeneration can succeed.
        try:
            with Image.open(path) as image:
                image.verify()
        except (UnidentifiedImageError, OSError, ValueError) as error:
            unavailable.append(key)
            print(f'Skipping unreadable artwork: {key} ({type(error).__name__})')
            continue
        with Image.open(path) as image:
            manual = approved_palette(reviews.get(key), image, digest)
        if manual:
            artworks[key] = manual
            continue
        recipe = features['artworks'].get(key)
        if not recipe or len(recipe) != 5:
            raise ValueError(f'Add five provisional feature choices to {FEATURES.name}: {key}')
        targets = [features['references'][name] for name in recipe]
        recipe_sha = recipe_digest(features['roles'], targets)
        if cache.get(key, {}).get('sha256') == digest and cache[key].get('recipeSha256') == recipe_sha:
            artworks[key] = cache[key]
        else:
            try:
                with Image.open(path) as image:
                    artworks[key] = {'colors': palette(image, targets), 'sha256': digest, 'recipeSha256': recipe_sha}
            except (UnidentifiedImageError, OSError, ValueError) as error:
                unavailable.append(key)
                print(f'Skipping unreadable artwork: {key} ({type(error).__name__})')
    atomic_json(OUTPUT, {'version': VERSION, 'artworks': artworks, 'unavailable': unavailable})
    print(f'{len(artworks)} Base/Elite 2 palettes written to {OUTPUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
