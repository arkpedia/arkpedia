"""Index exported home scenes and themes by the IDs and names in client display tables.

Pass each available regional display_meta_table.json. Only cosmetics with exported
artwork are indexed. --names fills localization gaps when an official sale already
names the cosmetic but the corresponding regional display table is unavailable.
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
            match = re.search(r'\bpurchas(?:e|ing)\s+(?:the\s+)?(.+?)(?:\s+from\s+the\s+Store|\.|$)', text, re.I)
        if match:
            names.append(match[1])
    return names


def entries(table):
    for item in table['homeBackgroundData']['homeBgDataList']:
        yield 'backgrounds', item['bgId'], item['bgName'], item['unlockDesList']
    for item in table['homeBackgroundData']['themeList']:
        yield 'themes', item['id'], item['tmName'], item['unlockDesList']


def build(art, tables, names, omit):
    catalogue = {'backgrounds': {}, 'themes': {}}
    for table in tables:
        for kind, id_, name, unlock in entries(table):
            file = 'background.webp' if kind == 'backgrounds' else 'layout.json'
            if id_ in omit or not (art / id_ / file).is_file() or not name:
                continue
            record = catalogue[kind].setdefault(id_, {'names': [], 'packs': []})
            record['names'] += [name, *names.get(id_, [])]
            record['packs'] += purchase_packs(unlock)
            if kind == 'backgrounds':
                record['animated'] = (art / id_ / 'scene.json').is_file()
    for group in catalogue.values():
        for record in group.values():
            for field in ('names', 'packs'):
                record[field] = list(dict.fromkeys(record[field]))
    return catalogue


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('art', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('tables', type=Path, nargs='+')
    parser.add_argument('--names', type=Path)
    parser.add_argument('--omit', nargs='*', default=[])
    args = parser.parse_args()
    read = lambda path: json.loads(path.read_text())
    data = build(args.art, [read(path) for path in args.tables], read(args.names) if args.names else {}, args.omit)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
