#!/usr/bin/env python3
"""Turns screen captures of Stronghold Protocol alliance badges into masks.

scripts/build/build-alliance-icons.mjs sources every badge it can: the mode's own 45px icon
from arknights.wiki.gg, or the nation's emblem out of public/faction-icons. Three
alliances are in neither -- Arcane, Elite and Solo -- so those arrive as SCREENSHOTS of
the game, captured by hand, and this script keys them to match the fetched ones.

    python3 scripts/imports/import-alliance-icons.py "~/Desktop/stronghold_protocol"

WHAT ARRIVES. A ~290x200 grab of one badge: the glyph in pure white, a mid-grey ground
around luma 110, a slightly brighter disc behind the glyph, panel scanlines, and
whatever HUD text was near it on screen -- a version string in one corner, a label in
another.

WHAT IT DOES.

  * Keys white-on-alpha off luminance, floor set from the image's own border so a
    brighter or darker grab lands the same, exactly as import-story-marks.py does.
  * Keeps only what falls inside a disc centred on the capture. The badge is drawn
    inside a circle, so anything beyond it is HUD text that came along for the ride --
    and unlike "keep the biggest blob", a disc does not tear apart a glyph that is
    several pieces. Elite is a diamond plus four separate dots plus a bolt; Solo is a
    rook with detached wings.
  * Pads the glyph into a square filling 0.74 of it, which is what the wiki's badges
    fill of their own 45x45 canvas, then resizes to 45. Without this a wide glyph and
    a tall one would read at different weights in the same 15px chip.
  * Archives the capture under .cache/source-art/, because the shipped file cannot give
    it back: the ground and the colour are thrown away here and exist nowhere else.
"""
import os
import re
import sys

import numpy as np
from PIL import Image

OUT_DIR = os.path.join(os.getcwd(), 'public', 'alliance-icons')
ARCHIVE = os.path.join(os.getcwd(), '.cache', 'source-art', 'alliance-icons')

# The alliances that have no fetchable badge. Named rather than "every png in the
# folder", so a stray screenshot in the drop folder cannot become an alliance.
WANTED = ('arcane', 'elite', 'solo')

BOX = 45      # what the wiki's badges are
FILL = 0.74   # and how much of that canvas their glyph covers
DISC = 0.45   # radius of the kept disc, as a fraction of the capture's short side


def key(path: str) -> Image.Image:
    grey = Image.open(path).convert('L')
    a = np.asarray(grey)
    h, w = a.shape
    ground = int(np.median(np.concatenate([a[0, :], a[-1, :], a[:, 0], a[:, -1]])))
    lo, hi = min(ground + 40, 200), 245
    alpha = np.clip((a.astype(np.float32) - lo) * 255.0 / (hi - lo), 0, 255)

    yy, xx = np.mgrid[0:h, 0:w]
    r = DISC * min(w, h)
    alpha = np.where((yy - h / 2) ** 2 + (xx - w / 2) ** 2 <= r * r, alpha, 0).astype(np.uint8)

    white = np.full(alpha.shape, 255, np.uint8)
    glyph = Image.fromarray(np.dstack([white, white, white, alpha]), 'RGBA')
    glyph = glyph.crop(glyph.getbbox())

    side = round(max(glyph.size) / FILL)
    square = Image.new('RGBA', (side, side), (255, 255, 255, 0))
    square.paste(glyph, ((side - glyph.width) // 2, (side - glyph.height) // 2), glyph)
    return square.resize((BOX, BOX), Image.LANCZOS)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    src = os.path.expanduser(sys.argv[1])
    if not os.path.isdir(src):
        print(f'not a directory: {src}', file=sys.stderr)
        return 1
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(ARCHIVE, exist_ok=True)

    found = {}
    for name in sorted(os.listdir(src)):
        stem, ext = os.path.splitext(name)
        if ext.lower() not in ('.png', '.jpg', '.jpeg', '.webp'):
            continue
        slug = re.sub(r'[^a-z0-9]+', '-', stem.lower()).strip('-')
        if slug in WANTED:
            found[slug] = os.path.join(src, name)

    for slug in WANTED:
        if slug not in found:
            print(f'  {slug:10} no capture in {src}')
            continue
        mark = key(found[slug])
        out = os.path.join(OUT_DIR, f'{slug}.webp')
        mark.save(out, 'WEBP', lossless=True, method=6)
        # Quality 88 for captures, the rate source-art/README.md sets for photographs
        # of a screen; the mask itself is the lossless one.
        Image.open(found[slug]).convert('RGB').save(
            os.path.join(ARCHIVE, f'{slug}.webp'), 'WEBP', quality=88, method=6)
        print(f'  {slug+".webp":14} {mark.size[0]}x{mark.size[1]}  '
              f'{round(os.path.getsize(out))}B  <- {os.path.basename(found[slug])}')

    print(f'{len(found)} of {len(WANTED)} badges -> public/alliance-icons/, '
          f'captures archived under .cache/source-art/alliance-icons/')
    return 0 if found else 1


if __name__ == '__main__':
    sys.exit(main())
