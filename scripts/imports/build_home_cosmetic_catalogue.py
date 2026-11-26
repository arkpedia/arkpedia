"""Index exported home scenes and themes by the IDs and names in client display tables.

Pass each available regional display_meta_table.json. Only cosmetics with exported
artwork are indexed. If music.m4a has also been exported, --audio-table resolves
its title and bank from the client audio table.
"""
import argparse
import json
from pathlib import Path
import re


def purchase_packs(entries):
    names = []
    for text in entries or []:
        match = re.search(r'购买[「“【]?(.+?)[」”】]?获得', text)
        if not match:
            match = re.search(
                r'\b(?:purchas(?:e|ing)|buy(?:ing)?)\s+(?:the\s+)?(.+?)'
                r'(?:\s+(?:from|in|at)\s+(?:the\s+)?\[?Store\]?|\.|$)', text, re.I)
        if match:
            names.append(match[1])
    return names


def entries(table):
    for item in table['homeBackgroundData']['homeBgDataList']:
        form = next((form for form in item['multiFormList'] if form['multiFormBgId'] == item['bgId']), {})
        yield 'backgrounds', item['bgId'], item['bgName'], item['unlockDesList'], form.get('bgMusicId')
    for item in table['homeBackgroundData']['themeList']:
        yield 'themes', item['id'], item['tmName'], item['unlockDesList'], None


def build(art, tables, audio, omit):
    catalogue = {'backgrounds': {}, 'themes': {}}
    music = {track['id']: track for track in audio.get('musics', [])}
    for table in tables:
        for kind, id_, name, unlock, music_id in entries(table):
            file = 'background.webp' if kind == 'backgrounds' else 'layout.json'
            if id_ in omit or not (art / id_ / file).is_file() or not name:
                continue
            record = catalogue[kind].setdefault(id_, {'names': [], 'packs': {}})
            record['names'].append(name)
            record['packs'].update((pack, name) for pack in purchase_packs(unlock))
            if kind == 'backgrounds':
                record['animated'] = (art / id_ / 'scene.json').is_file()
                if music_id in music and (art / id_ / 'music.m4a').is_file():
                    record['music'] = music[music_id]
    for group in catalogue.values():
        for record in group.values():
            record['names'] = list(dict.fromkeys(record['names']))
    for key, kind in [('defaultBackgroundId', 'backgrounds'), ('defaultThemeId', 'themes')]:
        catalogue[key] = next((default for table in reversed(tables)
                               if (default := table['homeBackgroundData'].get(key)) in catalogue[kind]), None)
    return catalogue


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('art', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('tables', type=Path, nargs='+')
    parser.add_argument('--audio-table', type=Path)
    parser.add_argument('--omit', nargs='*', default=[])
    args = parser.parse_args()
    read = lambda path: json.loads(path.read_text())
    data = build(args.art, [read(path) for path in args.tables], read(args.audio_table) if args.audio_table else {}, args.omit)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
