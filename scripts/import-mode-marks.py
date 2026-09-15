#!/usr/bin/env python3
"""Turns the game's mode emblems into assets in public/mode-marks/.

The Terminal prints an emblem beside every mode -- the hex cluster for Supplies, the
bracket for Score, the four class chips on the Supplies cards. Their ids are in the
gamedata, the FILES are in none of the five asset mirrors this project can reach
(yuanyan3060/ArknightsGameResource has no ui/, nor do fexli/ArknightsResource,
Aceship/Arknight-Images, arknights.wiki.gg or prts.wiki), so like the storyline
emblems these came in BY HAND -- traced or captured from the live game.

Which is why this takes a directory: the input is not fetchable, and the committed
output is the artifact of record. Re-run it only when the source art changes.

    python3 scripts/import-mode-marks.py "~/Desktop/Arknights Stages Page"

WHAT IT DOES. Three kinds of input, told apart by what is in them rather than by a
list of filenames:

  * SVG line art (Score, Supplies, the mode hexes) is copied through as SVG. It is
    path art with no fill, which draws black, and that is exactly what a CSS mask
    wants: the site colours it from the theme, as it already does the COST glyph.

  * a PNG that is ONE colour on alpha (Annihilation, Stationary Security Service,
    the Reclamation Algorithm wordmark -- black or near-white, no hue at all) is a
    mask too, so its colour is thrown away and replaced with white. Two of these
    arrived black and one white; as masks they now behave alike.

  * a PNG with real colour (the four class chips: teal, blue, gold) is artwork, and
    is kept as it is. Recolouring these would throw away the thing that tells
    Solid Defense from Fierce Attack at a glance.

Everything is trimmed to its own content, because hand-cut art is not framed alike,
and written lossless: these are flat-shaded emblems, where lossy webp shows on the
edges and saves a few hundred bytes.

AND AN ARCHIVE. Every picture in the folder is also copied, as webp, to
assets/source-art/ -- including the ones with importers of their own and the
reference screenshots. None of this is fetchable: it exists on one desktop, and a
desktop is not a backup. assets/ is not served, so nothing here reaches the deploy;
public/mode-marks/ holds what the site actually renders. Line art is archived
lossless and screenshots at quality 88, decided by how many colours are in the file
rather than by its extension.

The SVGs are rasterized for the archive with qlmanage, which is macOS's own
QuickLook and the only rasterizer on this machine (no cairo, no rsvg, no inkscape).
It renders black-on-white, which keys straight back to a white-on-alpha mask because
that is what the source art is. Elsewhere that step is skipped and says so -- the
SVGs are in the repo as SVG regardless, which is the better master anyway.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

OUT_DIR = os.path.join(os.getcwd(), 'public', 'mode-marks')
ARCHIVE_DIR = os.path.join(os.getcwd(), 'assets', 'source-art')
IMAGES = ('.svg', '.png', '.jpg', '.jpeg', '.webp')

# Screenshots and the story emblems live in the same folder and have their own
# importers (import-story-marks.py, import-act-marks.py). An EN_*_banner is an event
# poster and belongs in public/event-poster/ under the event's own name, which is what
# the poster lookup matches on -- as an emblem it would be a 1560x500 landscape in a
# row of square marks. All of these are still ARCHIVED; they are only not emblems.
SKIP = re.compile(r'^(SCR-|act_|Story Icons$|Life_Points|squad_size|EN_.*_banner)', re.I)


def slug(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def is_monochrome(im: Image.Image) -> bool:
    """One colour on alpha, i.e. a shape rather than a picture."""
    raw = im.tobytes()
    hues = {raw[i:i + 3] for i in range(0, len(raw), 4) if raw[i + 3] > 40}
    if not hues:
        return False
    # Anti-aliased edges wander a little, so this asks whether every visible pixel
    # is the same GREY, not whether every pixel is identical.
    return all(abs(r - g) < 12 and abs(g - b) < 12 for r, g, b in hues)


def whiten(im: Image.Image) -> Image.Image:
    """Keep the shape, drop the colour: a mask the theme can paint."""
    out = Image.new('RGBA', im.size, (255, 255, 255, 0))
    out.putalpha(im.getchannel('A'))
    return out


def rasterize(path: str) -> Image.Image | None:
    """An SVG as a white-on-alpha image, via QuickLook. None where it is unavailable."""
    with tempfile.TemporaryDirectory() as tmp:
        try:
            subprocess.run(['qlmanage', '-t', '-s', '512', '-o', tmp, path],
                           check=True, capture_output=True, timeout=60)
        except (OSError, subprocess.SubprocessError):
            return None
        made = [f for f in os.listdir(tmp) if f.lower().endswith('.png')]
        if not made:
            return None
        grey = Image.open(os.path.join(tmp, made[0])).convert('L')
        # Black art on a white page: the ink IS the alpha, inverted.
        out = Image.new('RGBA', grey.size, (255, 255, 255, 0))
        out.putalpha(grey.point(lambda v: 255 - v))
        return out.crop(out.getbbox() or (0, 0, *grey.size))


# Where an archived source belongs, named after the public/ folder its output ships
# to -- so the archive says, by its own shape, which picture produced which shipped
# art. The classes are the SKIP pattern's, because SKIP already knows them: it exists
# to keep this importer's hands off the files another importer owns.
BUCKETS = (
    (re.compile(r'^SCR-', re.I), 'reference'),
    (re.compile(r'^act_', re.I), 'act-marks'),
    (re.compile(r'^(Life_Points|squad_size)', re.I), 'stat-icons'),
    (re.compile(r'^EN_.*_banner', re.I), 'event-poster'),
)
# A source subfolder carries its own class, so its name maps rather than survives.
FOLDERS = {'story icons': 'story-marks'}
# And anything left at the top level is what this importer itself turns into a mark.
DEFAULT_BUCKET = 'mode-marks'


def bucket_for(rel: str) -> str:
    """Which archive folder a source path belongs in.

    The NAME decides before the folder does, because the act emblems arrive inside the
    Story Icons folder and ship to act-marks/ rather than story-marks/ -- a folder is
    where someone put a file, and the name is what the file is.
    """
    stem = os.path.splitext(os.path.basename(rel))[0]
    for pattern, folder in BUCKETS:
        if pattern.match(stem):
            return folder
    head = os.path.dirname(rel)
    if head:
        return FOLDERS.get(head.split(os.sep)[0].lower(), head)
    return DEFAULT_BUCKET


def archivable(src: str, root: str) -> bool:
    """Whether a source holds anything its shipped form does not.

    Measured once over the 48 pictures this folder first collected, and the answer was
    that 35 held nothing: they were byte-identical to the file they produced, or a
    raster of an SVG that is in the repo as SVG, or a pure trim of transparent margin.
    A megabyte of nothing.

    The 13 that did are the storyline emblems, and the reason generalises: their
    importer MASKS. An opaque capture goes in -- emblem plus background -- and an emblem
    on alpha comes out, so the original colours and surround exist nowhere else. Every
    such input arrives in a subfolder of its own, because it belongs to an importer
    other than this one.

    So: subfolders are archived and the top level is not. This importer's own inputs are
    the recoverable kind, by the measurement above; a subfolder belongs to an importer
    whose losses this script cannot see, and the safe answer there is to keep. New
    hand-fed art therefore lands in a subfolder if it is worth keeping.

    Screenshots are dropped by name wherever they sit. They were kept once as a record
    of what the Terminal looked like, and are not wanted.
    """
    rel = os.path.relpath(src, root)
    if re.match(r'^SCR-', os.path.splitext(os.path.basename(rel))[0], re.I):
        return False
    return bool(os.path.dirname(rel))


def archive(src: str, root: str) -> str | None:
    """Copy one picture into assets/source-art/ as webp. Returns its name, or None.

    The archive keeps the source's own NAME, extension aside -- no slugging. These are
    never URLs, and a slug cannot tell "Stationary Security Service.png" from
    "Stationary_Security_Service.png", which are two different pictures: the first
    archive run silently kept one of them.

    The folder, though, is ours rather than the source's: sources arrive in one flat
    desktop directory, and 49 pictures in one heap says nothing about which of five
    importers owns each. See bucket_for.
    """
    rel = os.path.relpath(src, root)
    name = os.path.join(bucket_for(rel), f'{os.path.splitext(os.path.basename(rel))[0]}.webp')
    if ext.lower() == '.svg':
        im = rasterize(src)
        if im is None:
            return None
    else:
        im = Image.open(src).convert('RGBA')
    # Flat art keeps every pixel; a screenshot is a photograph and does not need to.
    raw = im.tobytes()
    colours = len({raw[i:i + 3] for i in range(0, len(raw), 4)})
    os.makedirs(os.path.dirname(os.path.join(ARCHIVE_DIR, name)), exist_ok=True)
    if colours > 2000:
        im.convert('RGB').save(os.path.join(ARCHIVE_DIR, name), 'WEBP', quality=88, method=6)
    else:
        im.save(os.path.join(ARCHIVE_DIR, name), 'WEBP', lossless=True, method=6)
    return name


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    src = os.path.expanduser(sys.argv[1])
    if not os.path.isdir(src):
        print(f'not a directory: {src}', file=sys.stderr)
        return 1
    os.makedirs(OUT_DIR, exist_ok=True)

    # The archive comes AFTER the marks are written, because what to archive depends on
    # what shipping lost. See archivable().

    svgs = masks = art = 0
    written: set[str] = set()
    for name in sorted(os.listdir(src)):
        stem, ext = os.path.splitext(name)
        if SKIP.match(stem) or ext.lower() not in IMAGES:
            continue
        path = os.path.join(src, name)

        if ext.lower() == '.svg':
            out = os.path.join(OUT_DIR, f'{slug(stem)}.svg')
            shutil.copyfile(path, out)
            print(f'  {slug(stem)+".svg":34} svg  {round(os.path.getsize(out)/1024, 1):>5}KB  <- {name}')
            svgs += 1
            continue

        im = Image.open(path).convert('RGBA')
        mono = is_monochrome(im)
        if mono:
            im = whiten(im)
        im = im.crop(im.getbbox() or (0, 0, *im.size))
        # Two of these arrived as a pair -- "Stationary Security Service.png", the
        # traced emblem, and "Stationary_Security_Service.png", the coloured logo --
        # and a slug cannot tell a space from an underscore. Both are wanted, so the
        # second one to land says what it is instead of overwriting the first.
        stem_out = slug(stem)
        if stem_out in written:
            stem_out = f'{stem_out}-{"mask" if mono else "art"}'
        written.add(stem_out)
        out = os.path.join(OUT_DIR, f'{stem_out}.webp')
        im.save(out, 'WEBP', lossless=True, method=6)
        kind = 'mask' if mono else 'art '
        print(f'  {stem_out+".webp":34} {kind} {round(os.path.getsize(out)/1024, 1):>5}KB  '
              f'{im.size[0]}x{im.size[1]}  <- {name}')
        masks += mono
        art += not mono

    print(f'{svgs} svg + {masks} mask + {art} colour -> public/mode-marks/')

    # THE ARCHIVE, and only of what shipping cannot give back.
    #
    # Most of a source is recoverable from the file it produced: 35 of the first 48
    # archived here turned out to be byte-identical to their output, a raster of an SVG
    # that is in the repo as SVG, or a pure trim of transparent margin. Keeping those
    # was a megabyte of nothing.
    #
    # What is NOT recoverable is a capture that was MASKED on the way in: the storyline
    # emblems arrive as opaque rectangles -- emblem plus background -- and ship as the
    # emblem alone, so the original colours and surround exist only here. Those are 72
    # kB and worth every byte.
    kept = skipped = passed = 0
    for dirpath, _, files in os.walk(src):
        for f in sorted(files):
            if not f.lower().endswith(IMAGES):
                continue
            path = os.path.join(dirpath, f)
            if not archivable(path, src):
                passed += 1
                continue
            if archive(path, src):
                kept += 1
            else:
                skipped += 1
    print(f'{kept} pictures archived -> assets/source-art/ ({passed} recoverable from public/, not kept)'
          + (f' ({skipped} svg not rasterized: no qlmanage)' if skipped else ''))
    return 0 if svgs or masks or art else 1


if __name__ == '__main__':
    sys.exit(main())
