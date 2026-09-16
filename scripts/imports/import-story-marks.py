#!/usr/bin/env python3
"""Turns screenshots of the game's storyline emblems into masks in public/story-marks/.

The Score screen prints a small emblem beside every storyline -- "Story Line * RL"
next to the Ark's mark. The ids for these are in the gamedata (stage_table.storylines
carries storylineIconId, storylineLogoId and backgroundId for all 14 lines), but the
files are in none of the five asset mirrors this project can reach: not
yuanyan3060/ArknightsGameResource (no ui/), not fexli/ArknightsResource, not
Aceship/Arknight-Images, not arknights.wiki.gg, not prts.wiki. So these came in as
SCREENSHOTS, captured by hand from the live game.

Which is why this script exists and why it takes a directory: the input is not
fetchable, and the committed webp is the artifact of record. Re-run it only if the
screenshots are captured again.

    python3 scripts/imports/import-story-marks.py "~/Desktop/Story Icons"

WHAT IT DOES. A screenshot arrives fully opaque, on a background between rgb(19) and
rgb(53) depending on where on the screen it was taken, with the emblem itself a dim
mid-grey (strokes around luma 80-120, nothing above 160). Pasting that onto the page
would put fourteen slightly different dark boxes in a row. So each one is keyed to a
WHITE-ON-ALPHA mask instead:

  * alpha comes from luminance, on a curve fitted per image -- the floor just above
    that image's own background, the ceiling at its 95th percentile -- so a dim
    capture and a bright one both come out fully opaque;
  * the colour is thrown away and replaced with white, so the site can mask it and
    give it whatever colour the theme wants, the way it does the COST glyph;
  * the transparent border is trimmed, since the captures are not framed alike.

Nothing here is clever about shapes: it is a luminance key, and it works because
these are line art on a flat ground.
"""
import os
import re
import sys

from PIL import Image

OUT_DIR = os.path.join(os.getcwd(), 'public', 'story-marks')


def slug(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def percentile(hist: list[int], q: float) -> int:
    """The luma at which q of the pixels are darker."""
    total = sum(hist)
    seen = 0
    for value, count in enumerate(hist):
        seen += count
        if seen >= total * q:
            return value
    return 255


def background_level(grey: Image.Image) -> int:
    """The image's own ground, from its border: the captures differ by 30 levels."""
    w, h = grey.size
    edge = [grey.getpixel((x, 0)) for x in range(w)] + [grey.getpixel((x, h - 1)) for x in range(w)]
    edge += [grey.getpixel((0, y)) for y in range(h)] + [grey.getpixel((w - 1, y)) for y in range(h)]
    edge.sort()
    return edge[len(edge) // 2]


def key(path: str) -> Image.Image:
    grey = Image.open(path).convert('L')
    lo = min(background_level(grey) + 14, 200)
    hi = max(percentile(grey.histogram(), 0.95), lo + 20)
    span = hi - lo
    alpha = grey.point(lambda v: 0 if v <= lo else min(255, round((v - lo) * 255 / span)))
    out = Image.new('RGBA', grey.size, (255, 255, 255, 0))
    out.putalpha(alpha)
    return out.crop(out.getbbox() or (0, 0, *grey.size))


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    src = os.path.expanduser(sys.argv[1])
    if not os.path.isdir(src):
        print(f'not a directory: {src}', file=sys.stderr)
        return 1
    os.makedirs(OUT_DIR, exist_ok=True)

    written = 0
    for name in sorted(os.listdir(src)):
        stem, ext = os.path.splitext(name)
        if ext.lower() not in ('.png', '.jpg', '.jpeg', '.webp'):
            continue
        # The act wordmarks live in the same folder and have their own importer.
        if stem.startswith('act_'):
            continue
        mark = key(os.path.join(src, name))
        out = os.path.join(OUT_DIR, f'{slug(stem)}.webp')
        mark.save(out, 'WEBP', lossless=True, method=6)
        print(f'  {slug(stem)+".webp":28} {mark.size[0]}x{mark.size[1]:<4} '
              f'{round(os.path.getsize(out)/1024):3}KB  <- {name}')
        written += 1

    print(f'{written} marks -> public/story-marks/')
    return 0 if written else 1


if __name__ == '__main__':
    sys.exit(main())
