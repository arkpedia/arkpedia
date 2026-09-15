#!/usr/bin/env python3
"""Fetch the roster icon and the illustration for any operator missing either.

WHY THIS EXISTS. `getOperatorIconPath` builds `/<rarity>-star-icons/<Name> -
Base.webp` out of a name and returns it whether or not the file is there, and
about forty call sites across the site trust it -- the roster, the planner's
roster grid and plan rows, the guesser, recruitment, the base, the timeline.
A missing portrait is therefore a silent 404 that renders as a blank square,
which is how two of them (Gallus-squared and Rhodes Island Recon, both CN-only
1-star robots) were found by eye in the planner's grid rather than by any check.

Nothing here is hardcoded. The operator records are the same JSON files the site
itself reads, and each one carries the game's own `internalName` -- so the id
this fetches by comes from the record it is fetching for, and a rename cannot
put the two out of step. Idempotent: an operator whose portrait is already
committed is not fetched again.

BOTH HALVES, because they are one gap. An operator with an icon and no
illustration still renders a blank on their own detail page, and the pair is
what `getOperatorAppearances` reads -- fixing only the icon would have moved the
blank square rather than removed it.

The mirrors, in the order the `arknights-game-data` skill gives them:

  icon  180x180, the folder's own size, nothing to resample
    1. yuanyan3060/ArknightsGameResource  avatar/<id>.png
    2. fexli/ArknightsResource            avatar/ASSISTANT/<id>.png
  art   whatever size the source is; the committed files run 715x908 to 2018x1746
    1. yuanyan3060/ArknightsGameResource  skin/<id>_1b.png   (cropped to the art)
    2. fexli/ArknightsResource            charpack/<id>_1.png (same art, square,
       padded -- the fallback, because it needs no trimming to be correct)

NOTE: the 1-star art already committed does NOT reproduce bit-for-bit from these
mirrors -- regenerating `Lancet-2 - Base.webp` from yuanyan3060 lands at mean
13/255 with the differences concentrated on edges, so whatever produced them
started from a different render or size. They are indistinguishable by eye and
identical in format; that is the claim, and no stronger one is made.

Run:  python3 scripts/import-operator-avatars.py [--dry-run]
"""
import argparse
import io
import json
import pathlib
import subprocess
import sys

RARITY_WORD = {6: 'six', 5: 'five', 4: 'four', 3: 'three', 2: 'two', 1: 'one'}
ICON_MIRRORS = [
    'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/avatar/{id}.png',
    'https://raw.githubusercontent.com/fexli/ArknightsResource/main/avatar/ASSISTANT/{id}.png',
]
ART_MIRRORS = [
    'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/skin/{id}_1b.png',
    'https://raw.githubusercontent.com/fexli/ArknightsResource/main/charpack/{id}_1.png',
]
ROOT = pathlib.Path(__file__).resolve().parent.parent
EXPECTED_SIZE = (180, 180)


def safe_name(name: str) -> str:
    """The same scrub getOperatorIconPath applies before building a path."""
    return name.translate({ord(c): None for c in '\\/*?:"<>|'}).strip()


def icon_path(name: str, rarity: int) -> pathlib.Path:
    """Exactly the path getOperatorIconPath builds -- the roster tile reads this
    one filename, so `- Base.webp` is what has to be there."""
    return ROOT / 'public' / f'{RARITY_WORD[rarity]}-star-icons' / f'{safe_name(name)} - Base.webp'


def art_dir(rarity: int) -> pathlib.Path:
    return ROOT / 'public' / f'{RARITY_WORD[rarity]}-star-skins'


def has_art(name: str, rarity: int) -> bool:
    """Any labelled illustration counts, not `- Base.webp` specifically.

    getOperatorAppearances collects labels by the `<Name> - ` prefix, so an
    operator whose only art is a skin still has an illustration to show and is
    not a gap. (Three files were once labelled `- Default.webp` instead of
    `Base`; they were renamed, and the planner's getStaticProps now fails the
    build on that label, so this no longer has to tolerate it.)"""
    d = art_dir(rarity)
    prefix = f'{safe_name(name)} - '
    try:
        return any(f.name.startswith(prefix) and f.suffix.lower() == '.webp' for f in d.iterdir())
    except OSError:
        return False


def records():
    for rarity, word in RARITY_WORD.items():
        folder = ROOT / 'data' / f'operators-{rarity}star'
        for f in sorted(folder.glob('*.json')):
            try:
                d = json.loads(f.read_text(encoding='utf-8'))
            except (OSError, json.JSONDecodeError) as exc:
                print(f'  !! unreadable: {f.name} ({exc})')
                continue
            if d.get('rarity') != rarity:
                # The folder is the authority on rarity; a record that disagrees
                # would be filed under the wrong icon directory.
                print(f'  !! {d.get("name")}: rarity {d.get("rarity")} in {folder.name}')
                continue
            yield d.get('name'), rarity, d.get('internalName')


def fetch(url: str) -> bytes | None:
    """curl, not urllib: urllib fails SSL verification on this machine."""
    out = subprocess.run(
        ['curl', '-sSL', '-A', 'ArkpediaBot/1.0', '-w', '%{http_code}', '-o', '-', url],
        capture_output=True,
    )
    if out.returncode != 0:
        return None
    body, code = out.stdout[:-3], out.stdout[-3:].decode('ascii', 'ignore')
    return body if code == '200' and len(body) > 1000 else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true', help='report the gaps, fetch nothing')
    args = ap.parse_args()
    from PIL import Image

    jobs = []
    for name, rarity, internal in records():
        if not icon_path(name, rarity).exists():
            jobs.append(('icon', name, rarity, internal))
        if not has_art(name, rarity):
            jobs.append(('art', name, rarity, internal))
    print(f'{len(jobs)} missing file(s) across {len({j[1] for j in jobs})} operator(s)')
    if not jobs:
        print('Nothing to do.')
        return 0

    failed = []
    for kind, name, rarity, internal in jobs:
        dest = icon_path(name, rarity) if kind == 'icon' else art_dir(rarity) / f'{safe_name(name)} - Base.webp'
        label = f'{name} [{kind}]'
        if not internal:
            print(f'  FAIL {label}: the record carries no internalName to fetch by')
            failed.append(label)
            continue
        if args.dry_run:
            print(f'  would fetch {label} <- {internal}')
            continue
        for mirror in (ICON_MIRRORS if kind == 'icon' else ART_MIRRORS):
            blob = fetch(mirror.format(id=internal))
            if not blob:
                continue
            im = Image.open(io.BytesIO(blob)).convert('RGBA')
            # The icon folders are uniformly 180x180, so a different size upstream
            # means the mirror changed shape and somebody should look. The art
            # folders have no such convention -- the committed files run from
            # 715x908 to 2018x1746 -- so only a floor is enforced there.
            if kind == 'icon' and im.size != EXPECTED_SIZE:
                print(f'  FAIL {label}: {internal} is {im.size}, expected {EXPECTED_SIZE}')
                failed.append(label)
                break
            if kind == 'art' and min(im.size) < 400:
                print(f'  FAIL {label}: {internal} is only {im.size}, too small to be the illustration')
                failed.append(label)
                break
            if (im.getchannel('A').getextrema())[1] == 0:
                print(f'  FAIL {label}: {internal} is fully transparent')
                failed.append(label)
                break
            dest.parent.mkdir(parents=True, exist_ok=True)
            im.save(dest, 'WEBP', quality=90, method=6)
            print(f'  wrote {dest.relative_to(ROOT)}  ({dest.stat().st_size:,} bytes, {im.size}, from {internal})')
            break
        else:
            print(f'  FAIL {label}: neither mirror has {internal}')
            failed.append(label)

    if failed:
        print(f'\n{len(failed)} file(s) could not be fetched: {", ".join(failed)}')
        print('If the game genuinely has no art for one, that is worth saying in the')
        print('planner guard rather than leaving a blank square on six pages.')
        return 1
    if args.dry_run:
        print(f'\nDry run: {len(jobs)} to fetch, nothing written.')
        return 0
    print('\nAll operator art present.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
