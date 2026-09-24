#!/usr/bin/env python3
"""Names the Contingency Contract Battleplan stages and imports their renders.

Three things were wrong or missing for the 16 CCB stages:

  series   The pipeline labels the seasons CC#1..CC#4 from the game's own
           crisisV2SeasonCode ("#1"), but "CC#1" is the community's name for the
           FIRST series (CC#1-12, gamedata's crisis v1). This is crisis v2 --
           Battleplan -- which the community writes CCB. Relabelled CCB#1..CCB#4.

  code     A CCB stage has no stage record at all: its id is a level path
           ("obt/crisis/v2/level_crisis_v2_01-02"), so it came through with no
           code and no name and rendered as a blank row. The code is built from
           the season and map numbers the level path carries.

  name     The gamedata does not name CCB maps. The only name anywhere in the
           dumps is in medal text -- "During Battleplan Arclight, reach a score of
           300 in Main Test Site" -- which names each season's -01 map and no
           other. That name is taken from there; the rest keep none rather than
           being given an invented one. (The client does show names for the other
           maps, but they are UI strings in main_text.json under hashed keys with
           nothing tying them to a level.)

Renders come from the local ArknightsGameResource checkout, whose map/ directory
keys them the same way the level path does (map/crisis_v2_01-02.png). That is why
they were missed: every other preview is named after a stage id, and these stages
have none.

NOTHING HERE PUBLISHES. Art reaches readers only through arkpedia-image-assets
(stages-images/<key>.webp), and a file in this repository's public/ is refused by
check:assets, which the daily release runs, so a new season's render written there
would have blocked the release. It is staged in .cache/cc-stages/ instead, the stage
gets no render until the image repository publishes it, and it is reported under
'cc-stages' with the path it must be published at, as is a stage with no render at all.

Run:  python3 scripts/imports/import_cc_stages.py
"""
from published_assets import published_assets
from quarantine import report
import json
import os
import re
import sys

from PIL import Image

RES = os.environ.get('ARKPEDIA_CN', '.cache/upstream/cn-resource')
EN = os.environ.get('ARKPEDIA_EN', '.cache/upstream/en-gamedata/en') + '/gamedata/excel'

root = os.getcwd()
stages_dir = os.path.join(root, 'data', 'stages')
# Never public/: see the header.
out_dir = os.path.join(root, '.cache', 'cc-stages')


def map_names():
    """level id -> the map's name, for the maps the medal text names."""
    medals = json.load(open(os.path.join(EN, 'medal_table.json'))).get('medalList') or {}
    rows = medals.values() if isinstance(medals, dict) else medals
    out = {}
    for medal in rows:
        unlock = medal.get('unlockParam') or []
        if len(unlock) < 2 or not str(unlock[1]).startswith('level_crisis_v2'):
            continue
        found = re.search(r' in ([^.]+)\.', medal.get('getMethod') or '')
        if found:
            out.setdefault(str(unlock[1]), found.group(1).strip())
    return out


def main():
    names = map_names()
    plan = {}
    missing = []
    alerts = []
    for file in sorted(os.listdir(stages_dir)):
        if not file.endswith('.json'):
            continue
        rec = json.load(open(os.path.join(stages_dir, file)))
        if rec.get('stage_type') != 'contingency_contract':
            continue
        level = (rec.get('id') or '').split('/')[-1]          # level_crisis_v2_01-02
        key = re.sub(r'^level_', '', level)                    # crisis_v2_01-02
        season_map = re.search(r'_(\d+)-(\d+)$', key)
        if not season_map:
            missing.append(f'{rec["slug"]}: cannot read a season and map from {key}')
            continue
        entry = {'code': f'CCB#{int(season_map.group(1))}-{int(season_map.group(2))}'}
        if names.get(level):
            entry['name'] = names[level]
        src = os.path.join(RES, 'map', f'{key}.png')
        if f'stages-images/{key}.webp' in published_assets():
            entry['render'] = f'{key}.webp'
        elif os.path.exists(src):
            # Webp, matching the rest of stages-images/.
            try:
                os.makedirs(out_dir, exist_ok=True)
                Image.open(src).convert('RGB').save(os.path.join(out_dir, f'{key}.webp'), 'WEBP', quality=80, method=6)
                why = (f'its render is staged as .cache/cc-stages/{key}.webp from map/{key}.png, but nothing publishes it; '
                       f'it is published without one until stages-images/{key}.webp is added to arkpedia-image-assets')
            except Exception as exc:  # noqa: BLE001 -- one bad file holds back one stage
                # The error names the checkout's path and the day's wording: the log gets it,
                # the reason (a release input) only the kind.
                print(f'  UNREADABLE map/{key}.png: {exc}', file=sys.stderr)
                why = f'map/{key}.png does not decode, so it is published without a render'
            alerts.append({'key': f'cc-render:{rec["slug"]}', 'action': 'published-partial', 'sourceRef': f'map/{key}.png',
                           'reason': f'{entry["code"]} ({rec["slug"]}): {why}.'})
        else:
            missing.append(f'{rec["slug"]}: no render at map/{key}.png')
            alerts.append({'key': f'cc-render:{rec["slug"]}', 'action': 'published-partial',
                           'reason': f'{entry["code"]} ({rec["slug"]}): the resource checkout has no map/{key}.png, so it is published without a render.'})
        plan[rec['slug']] = entry

    with open(os.path.join(root, 'data', 'cc-stages.json'), 'w') as fh:
        json.dump(plan, fh, separators=(',', ':'), sort_keys=True)

    # The series label, on the content records the index copies it from.
    contents_path = os.path.join(root, 'data', 'stages-content.json')
    contents = json.load(open(contents_path))
    relabelled = 0
    for content in contents.values():
        if content.get('kind') != 'contingency_contract':
            continue
        label = content.get('label') or ''
        if label.startswith('CC#'):
            content['label'] = 'CCB#' + label[len('CC#'):]
            relabelled += 1
    with open(contents_path, 'w') as fh:
        json.dump(contents, fh, separators=(',', ':'), ensure_ascii=False)

    print(f'{len(plan)} CCB stages: {sum(1 for e in plan.values() if e.get("render"))} with a render, '
          f'{sum(1 for e in plan.values() if e.get("name"))} with a name from medal text')
    print(f'{relabelled} seasons relabelled CCB#N')
    if missing:
        print(f'{len(missing)} gaps: ' + '; '.join(missing[:4]))
    report('cc-stages', alerts)


if __name__ == '__main__':
    sys.exit(main())
