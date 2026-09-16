#!/usr/bin/env python3
"""Keys a screen capture of a Defence Strategy badge into public/stronghold-stratagems/.

scripts/build/build-stronghold-icons.mjs takes all 36 badges from prts.wiki, and 34 of them are
the art the game draws. Two are not: prts holds an untinted variant for Ioleta Russell
and Touch, so on the page they read as ordinary portraits beside 34 teal ones. A capture
from the live game settles it, and this keys that capture to match the fetched ones.

    python3 scripts/imports/import-stratagem-captures.py "~/Desktop/stronghold_protocol"

WHAT IT DOES. A capture is the whole card, rectangular and dimmer than a PNG pulled from
a wiki. So it is cropped to its largest centred square, scaled so its bright end matches
what the fetched badges use, and masked with the circular alpha the fetched badges carry
-- taken from one of them rather than drawn here, so the two cannot drift apart.

The capture is archived under .cache/source-art/, per the rule there: this masks and
regrades, so what goes in cannot be recovered from what comes out.
"""
import os
import re
import sys

import numpy as np
from PIL import Image

OUT_DIR = os.path.join(os.getcwd(), 'public', 'stronghold-stratagems')
ARCHIVE = os.path.join(os.getcwd(), '.cache', 'source-art', 'stronghold-stratagems')
# Any badge the builder fetched; only its alpha is used, as the shape to cut to.
SHAPE = os.path.join(OUT_DIR, 'warfarin.webp')

# Capture file name -> the badge it replaces. Named rather than "every png in the
# folder", so a stray screenshot cannot overwrite a fetched badge.
WANTED = {'ioleta russel': 'ioleta-russell', 'ioleta russell': 'ioleta-russell',
          'touch': 'touch'}


def key(path: str, shape: Image.Image) -> Image.Image:
    cap = Image.open(path).convert('RGB')
    w, h = cap.size
    side = min(w, h)
    square = cap.crop(((w - side) // 2, (h - side) // 2,
                       (w - side) // 2 + side, (h - side) // 2 + side))
    square = square.resize(shape.size, Image.LANCZOS)

    alpha = np.asarray(shape)[..., 3]
    lit = alpha > 200
    a = np.asarray(square).astype(float)
    lum = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    ref = np.asarray(shape)[..., :3].astype(float)
    ref_lum = (0.299 * ref[..., 0] + 0.587 * ref[..., 1] + 0.114 * ref[..., 2])[lit]
    # The 90th percentile rather than the max: a capture usually has a specular blown
    # pixel or two, and matching on those would leave the whole badge too dark.
    scale = np.percentile(ref_lum, 90) / max(np.percentile(lum[lit], 90), 1)
    graded = (a * scale).clip(0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack([graded, alpha]), 'RGBA')


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    src = os.path.expanduser(sys.argv[1])
    if not os.path.isdir(src):
        print(f'not a directory: {src}', file=sys.stderr)
        return 1
    if not os.path.exists(SHAPE):
        print(f'no fetched badge to take the shape from: {SHAPE}', file=sys.stderr)
        print('run scripts/build/build-stronghold-icons.mjs first', file=sys.stderr)
        return 1
    os.makedirs(ARCHIVE, exist_ok=True)
    shape = Image.open(SHAPE).convert('RGBA')

    written = 0
    for name in sorted(os.listdir(src)):
        stem, ext = os.path.splitext(name)
        if ext.lower() not in ('.png', '.jpg', '.jpeg', '.webp'):
            continue
        slug = WANTED.get(re.sub(r'[^a-z0-9 ]+', '', stem.lower()).strip())
        if not slug:
            continue
        badge = key(os.path.join(src, name), shape)
        out = os.path.join(OUT_DIR, f'{slug}.webp')
        badge.save(out, 'WEBP', quality=90, method=6)
        Image.open(os.path.join(src, name)).convert('RGB').save(
            os.path.join(ARCHIVE, f'{slug}.webp'), 'WEBP', quality=88, method=6)
        print(f'  {slug + ".webp":24} {badge.size[0]}x{badge.size[1]}  '
              f'{round(os.path.getsize(out) / 1024, 1)}KB  <- {name}')
        written += 1

    print(f'{written} badge(s) keyed from captures -> public/stronghold-stratagems/')
    if not written:
        print('  nothing matched; expected a file named after the leader, e.g. "touch.png"')
    return 0


if __name__ == '__main__':
    sys.exit(main())
