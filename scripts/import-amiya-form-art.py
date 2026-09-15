#!/usr/bin/env python3
"""
Fetches the roster icon and the full illustration for Amiya's Guard and Medic forms.

WHY THESE FILES ARE NOT ALREADY HERE. Every other operator's art arrived with the bulk
import, which knew one Amiya. The forms' SKIN art is present -- data/skins.json has always
filed it under the models "Amiya (Guard)" and "Amiya (Medic)" -- but the default look of
each form was missing, and getOperatorIconPath() asks for "<name> - Base.webp" with no
fallback, so the two new records would have shown as gaps in the roster.

WHY THE ELITE 2 ART IS FILED AS "Base". Both forms only exist at Elite 2, and the game has
no earlier art for them: the asset index carries avatar/char_1037_amiya3_2.png with no
plain char_1037_amiya3.png, and skin/ has only the _2b illustrations. The Guard does have
a pre-promotion avatar, but no matching illustration, so pairing it with the Elite 2 art
would put two different looks in one card. One "Base" appearance per form, icon and
illustration from the same source, is what the reader gets.

Idempotent: files already present are left alone unless --force is passed.

Run: python3 scripts/import-amiya-form-art.py [--force]
"""
import io
import json
import ssl
import sys
import urllib.request
from pathlib import Path

import certifi
from PIL import Image

# Python's default trust store is empty on this machine, so every https fetch fails
# verification. scripts/import_content_art.py hit the same wall and solved it this way.
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())

MIRROR = 'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main'
ICON_PX = 180  # every file in public/*-star-icons is 180x180

# form name -> (avatar path upstream, illustration path upstream)
FORMS = {
    'Amiya (Guard)': ('avatar/char_1001_amiya2_2.png', 'skin/char_1001_amiya2_2b.png'),
    'Amiya (Medic)': ('avatar/char_1037_amiya3_2.png', 'skin/char_1037_amiya3_2b.png'),
}

# The forms' SKIN icons, which were missing for the same reason: the illustrations were
# imported with everyone else's but the small icons were not, and nothing asked for them
# until the forms became operators with appearance cards of their own. getOperatorAppearances
# warns about exactly this on every build -- three skins in five-star-skins/ with no
# five-star-icons/ twin -- which is how these were found.
#
# The avatar ids are the skin table's own (charSkins[...].avatarId), not guesses. All of
# Amiya's skins are filed under char_002_amiya there, forms included, so the id is the only
# thing that says which form a skin belongs to. "Touch the Stars" is in the CN table only,
# under its Chinese name, and is already on the site with an EN name and a price.
SKIN_ICONS = {
    'Amiya (Guard) - In A Myriad of Universes': 'avatar/char_1001_amiya2_sale%2316.png',
    'Amiya (Guard) - Touch the Stars': 'avatar/char_1001_amiya2_casc%231.png',
    'Amiya (Medic) - Solo Around The World': 'avatar/char_1037_amiya3_sale%2313.png',
}

ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / 'public/five-star-icons'
SKIN_DIR = ROOT / 'public/five-star-skins'
SKILL_DIR = ROOT / 'public/skill-icons'
SKILL_PX = 64  # every file in public/skill-icons is 64x64, flattened onto white

# The charId behind each form, for pairing its skills with their icons.
FORM_CHAR = {
    'Amiya (Guard)': 'char_1001_amiya2',
    'Amiya (Medic)': 'char_1037_amiya3',
}


def fetch(rel_path):
    url = f'{MIRROR}/{rel_path}'
    req = urllib.request.Request(url, headers={'User-Agent': 'ArkpediaBot/1.0'})
    with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=90) as r:
        if r.status != 200:
            raise RuntimeError(f'{url} returned {r.status}')
        return r.read()


def save_webp(raw, dest, box=None, flatten=False):
    im = Image.open(io.BytesIO(raw)).convert('RGBA')
    if flatten:
        # public/skill-icons holds RGB, flattened onto WHITE -- checked by regenerating
        # an icon already in the folder and diffing: mean 0.83/255, max 11, which is
        # webp and resampling noise. Compositing onto black would invert every glyph.
        white = Image.new('RGB', im.size, (255, 255, 255))
        white.paste(im, mask=im.split()[3])
        im = white
    if box:
        # The avatars ship at 180x180 already. Resized only if a future one does not,
        # so the folder stays uniform rather than one icon rendering a different size.
        if im.size != (box, box):
            im = im.resize((box, box), Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, 'WEBP', quality=92, method=6)
    return im.size


def skill_icons():
    """
    (destination stem, upstream path) for each form's skill icons.

    The filename the site asks for is "<operator> - <skill name>.webp", with the skill
    name as OUR record spells it -- getSkillIconPath builds it that way. The upstream
    file is named by the game's skillId. Neither is derivable from the other, so the two
    are paired by position: skills[i] of the patch table against skillList[i] of the
    record the generator wrote FROM that same table, which is what makes the pairing
    safe. Nothing is hardcoded, so a renamed skill follows on the next run.
    """
    patch = json.loads((ROOT / '.cache/char_patch_table.json').read_text())['patchChars']
    out = []
    for name, char_id in FORM_CHAR.items():
        record = ROOT / f'data/operators-5star/{name}.json'
        if not record.exists():
            print(f'  skipped {name}: no operator record yet, run build-amiya-forms.mjs first')
            continue
        site = json.loads(record.read_text())['skills']['skillList']
        game = patch[char_id]['skills']
        if len(site) != len(game):
            print(f'  FAILED  {name}: {len(game)} skills in the gamedata, {len(site)} in our '
                  'record, so the icons cannot be paired', file=sys.stderr)
            return None
        for skill, entry in zip(site, game):
            safe = skill['name']
            for ch in '\\/*?:"<>|':
                safe = safe.replace(ch, '')
            out.append((f'{name} - {safe.strip()}', f'skill/skill_icon_{entry["skillId"]}.png'))
    return out


def main():
    force = '--force' in sys.argv
    if not ICON_DIR.is_dir() or not SKIN_DIR.is_dir():
        print(f'error: expected {ICON_DIR} and {SKIN_DIR} to exist', file=sys.stderr)
        return 1

    wrote = 0
    for name, (avatar, illustration) in FORMS.items():
        for upstream, folder, box in (
            (avatar, ICON_DIR, ICON_PX),
            (illustration, SKIN_DIR, None),
        ):
            dest = folder / f'{name} - Base.webp'
            if dest.exists() and not force:
                print(f'  kept    {dest.relative_to(ROOT)}')
                continue
            try:
                raw = fetch(upstream)
            except Exception as e:  # noqa: BLE001 -- the message is the useful part
                print(f'  FAILED  {upstream}: {e}', file=sys.stderr)
                return 1
            size = save_webp(raw, dest, box)
            print(f'  wrote   {dest.relative_to(ROOT)}  {size[0]}x{size[1]}  from {upstream}')
            wrote += 1

    for stem, upstream in SKIN_ICONS.items():
        dest = ICON_DIR / f'{stem}.webp'
        if dest.exists() and not force:
            print(f'  kept    {dest.relative_to(ROOT)}')
            continue
        try:
            raw = fetch(upstream)
        except Exception as e:  # noqa: BLE001
            print(f'  FAILED  {upstream}: {e}', file=sys.stderr)
            return 1
        size = save_webp(raw, dest, ICON_PX)
        print(f'  wrote   {dest.relative_to(ROOT)}  {size[0]}x{size[1]}  from {upstream}')
        wrote += 1

    pairs = skill_icons()
    if pairs is None:
        return 1
    for stem, upstream in pairs:
        dest = SKILL_DIR / f'{stem}.webp'
        if dest.exists() and not force:
            print(f'  kept    {dest.relative_to(ROOT)}')
            continue
        try:
            raw = fetch(upstream)
        except Exception as e:  # noqa: BLE001
            print(f'  FAILED  {upstream}: {e}', file=sys.stderr)
            return 1
        size = save_webp(raw, dest, SKILL_PX, flatten=True)
        print(f'  wrote   {dest.relative_to(ROOT)}  {size[0]}x{size[1]}  from {upstream}')
        wrote += 1

    print(f'  {wrote} file(s) written')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
