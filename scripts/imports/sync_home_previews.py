"""Stage reusable home previews from the CN and Global versions recorded by arkpedia-data."""
import argparse
from functools import cached_property, lru_cache
from hashlib import md5
import json
from pathlib import Path
import re
import shutil
import subprocess
from tempfile import NamedTemporaryFile, TemporaryDirectory
from urllib.parse import quote

from build_home_cosmetic_catalogue import entries, purchase_packs
from client_bundles import Client, get, load, network
from export_home_particles import Room
from export_home_preview import BUNDLES, Bundle, export_background, export_theme

ROOT = Path(__file__).resolve().parents[2]
MIRRORS = {
    'cn': ('yuanyan3060/ArknightsGameResource', 'version', 'gamedata/excel'),
    'en': ('ArknightsAssets/ArknightsGamedata', 'en/hot_update_list.json', 'en/gamedata/excel'),
}
CATALOGUE = ROOT / 'config/discovered-home-cosmetics.json'
CURATED = ROOT / 'config/event-cosmetic-previews.json'
NEWS = BUNDLES['ui_home_act_banner_shop_h2_0'][0]
HUD = {'Terminal', 'Squads', 'Operators', 'Store', 'Missions', 'Base', 'Amiya', 'Breaking News'}
COUNTERS = {'sanity', 'maxSanity', 'level', 'doctor', 'lmd', 'orundum', 'originite'}
# Cloudflare Workers limit for each first-party static asset.
STATIC_ASSET_LIMIT = 25 * 1024 * 1024


def read_json(path):
    return json.loads(path.read_text())


def write_json(path, value):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temp.replace(path)


def bundle_path(kind, id_):
    if kind == 'themes':
        return f'arts/ui/hometheme/[uc]{id_}.ab'
    return f'arts/ui/homebackground/wrapper/{id_}.ab'


class Region:
    def __init__(self, name, version, cache, snapshot):
        self.name, self.version, self.cache, self.snapshot = name, version, cache, snapshot
        self.client = None
        if snapshot:
            self.revision = None
            self.files = {row['name']: row['md5'] for row in read_json(snapshot / 'manifest.json')['abInfos']}
        else:
            repository, marker, _ = MIRRORS[name]
            remote = f'https://github.com/{repository}.git'
            self.revision = subprocess.check_output(['git', 'ls-remote', remote, 'HEAD'], text=True, timeout=45).split()[0]
            self.origin = f'https://raw.githubusercontent.com/{repository}/{self.revision}'
            raw = get(f'{self.origin}/{marker}', timeout=30)
            mirrored = json.loads(raw)['versionId'] if name == 'en' else raw.decode().split()[0]
            if version != mirrored:
                raise ValueError(f'{name} tables carry {mirrored}; waiting for the recorded {version}')
            self.client = Client(name, host=network(name)['hu'], version=version)
            self.files = self.client.files()

    def table(self, file):
        if self.snapshot:
            return read_json(self.snapshot / file)
        location = MIRRORS[self.name][2]
        return json.loads(get(f'{self.origin}/{location}/{file}', timeout=60))

    @cached_property
    def display(self):
        return self.table('display_meta_table.json')

    @cached_property
    def audio(self):
        return self.table('audio_data.json')

    def stage(self, path, key=None):
        checksum = self.files[path]
        name = key or Path(path).stem.removeprefix('[uc]')
        file = self.cache / checksum / f'{name}.ab'
        if not re.fullmatch(r'[0-9a-f]{32}', checksum):
            raise ValueError(f'Invalid checksum for {path}')
        if file.is_file() and md5(file.read_bytes()).hexdigest() == checksum:
            return file
        raw = (self.snapshot / f'{name}.ab').read_bytes() if self.snapshot else self.client.bundle(path)
        if md5(raw).hexdigest() != checksum:
            raise ValueError(f'Bundle checksum mismatch for {path}')
        file.parent.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile(dir=file.parent, delete=False) as pending:
            pending.write(raw)
        Path(pending.name).replace(file)
        return file

    @lru_cache(maxsize=8)
    def bundle(self, key, path):
        file = self.stage(path, key)
        return Bundle(file.parent, key, self.files[path])

    def music_sources(self, music_id):
        if not music_id:
            return None, []
        track = next((row for row in self.audio['musics'] if row['id'] == music_id), None)
        bank = next((row for row in self.audio['bgmBanks'] if track and row['name'] == track['bank']), None)
        if not bank:
            return None, []
        clips = [(clip, clip.lower()) for clip in (bank.get('intro'), bank.get('loop')) if clip]
        sources = []
        for original, clip in clips:
            candidates = [clip + '.ab', re.sub(r'_(intro|loop)$', '', clip) + '.ab']
            if not (path := next((path for path in candidates if path in self.files), None)):
                return None, []
            sources.append((path, Path(original).name))
        return track, sources


def opening_music(region, output, sources):
    wavs = []
    for index, (path, name) in enumerate(sources):
        # An audio bundle may hold the intro and loop in the same file.
        env = load(region.stage(path).read_bytes())
        clip = next((obj.read() for obj in env.objects
                     if obj.type.name == 'AudioClip' and obj.peek_name().lower() == name.lower()), None)
        if not clip or not clip.samples:
            raise ValueError(f'Missing AudioClip {name}')
        wav = output / f'clip-{index}.wav'
        wav.write_bytes(next(iter(clip.samples.values())))
        wavs.append(wav)
    arguments = [arg for wav in wavs for arg in ('-i', str(wav))]
    if len(wavs) == 2:
        arguments.extend(['-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1'])
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', *arguments, '-t', '30',
                    '-c:a', 'aac', '-b:a', '96k', str(output / 'music.m4a')],
                   check=True, timeout=90)
    for wav in wavs:
        wav.unlink()


def room_dependencies(region):
    return sorted(name for name in region.files if name == '[uc]shaders.ab'
                  or re.fullmatch(r'refs/fx/(?:material|texture/[a-z]+)\.ab', name))


def render_room(region, id_, path, output):
    bundle = region.bundle(id_, path)
    export_background(bundle, id_, output)
    if not any(obj.type.name == 'ParticleSystem' for obj in bundle.objects.values()):
        return
    room = Room(region.stage(path, id_), [region.stage(name) for name in room_dependencies(region)], output)
    scene = room.export(id_, 2732, set())
    if any(count for name, count in room.report.items() if name not in ('emitters', 'particles')):
        raise ValueError(f'Needs a room effect review: {dict(room.report)}')
    if room.report['emitters']:
        (output / 'scene.json').write_text(json.dumps(scene, separators=(',', ':'), allow_nan=False) + '\n')


def render_theme(region, id_, path, output, assistant, sources):
    home, common = (region.bundle(key, BUNDLES[key][0]) for key in ('home_page', 'common'))
    news = region.bundle(Path(NEWS).stem, NEWS).sprites['Shop_mCard_1'], 'Monthly Card'
    export_theme(home, common, region.bundle(id_, path), id_, sources, output,
                 news=news, assistant=('Amiya', assistant), assistant_frame=(146, 65, 780),
                 locale='en' if region.name == 'en' else 'zh')
    layers = read_json(output / 'layout.json')['layers']
    missing = (HUD - {row.get('label') for row in layers}) | (COUNTERS - {row.get('text') for row in layers})
    if missing:
        raise ValueError(f'Missing home screen components: {", ".join(sorted(missing))}')


def sample_artist(cache, fixture, pins):
    if fixture:
        return fixture
    pin = read_json(pins)['arkpedia-skin-assets']
    path = quote('five-star-skins/Amiya - Base.webp')
    file = cache / pin / 'amiya.webp'
    if not file.is_file():
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(get(f'https://raw.githubusercontent.com/arkpedia/arkpedia-skin-assets/{pin}/{path}', timeout=40))
    return file


def stage_catalogue(regions, catalogue, art, protected, requested, assistant, report):
    records = {}
    for region in regions:
        for kind, id_, name, unlock, music_id in entries(region.display):
            if not re.fullmatch(r'(?:bg|tm)_[a-z0-9_]+', id_) or id_ in protected or (requested and id_ not in requested):
                continue
            record = records.setdefault((kind, id_), {'names': [], 'packs': {}, 'regions': []})
            if name:
                if region.name == 'en':
                    record['globalName'] = name
                record['names'].append(name)
                record['packs'].update((pack, name) for pack in purchase_packs(unlock))
            if bundle_path(kind, id_) in region.files:
                record['regions'].append((region, music_id))

    for (kind, id_), record in sorted(records.items()):
        old = catalogue[kind].get(id_, {})
        available = record.pop('regions')
        record['names'] = list(dict.fromkeys(record['names']))
        path = bundle_path(kind, id_)
        for region, music_id in reversed(available):
            if old.get('source', {}).get('region') == 'en' and region.name == 'cn':
                break
            try:
                keys = [path, *(BUNDLES[key][0] for key in ('home_page', 'common')), NEWS] if kind == 'themes' else [path]
                if kind == 'backgrounds' and any(obj.type.name == 'ParticleSystem'
                                                 for obj in region.bundle(id_, path).objects.values()):
                    keys.extend(room_dependencies(region))
                track, clips = region.music_sources(music_id)
                checksums = {name: region.files[name] for name in keys + [name for name, _ in clips]}
                candidate = {**record, 'source': {'region': region.name, 'version': region.version,
                                                   'bundles': checksums}}
                main = 'layout.json' if kind == 'themes' else 'background.webp'
                previous = old.get('source', {})
                if previous.get('region') == region.name and previous.get('bundles') == checksums and (art / id_ / main).is_file():
                    # Late translations can update names independently of unchanged artwork.
                    old['names'] = list(dict.fromkeys(old['names'] + record['names']))
                    old['packs'].update(record['packs'])
                    if name := record.get('globalName'):
                        old['globalName'] = name
                    break
                with TemporaryDirectory(prefix=id_ + '-', dir=art.parent) as directory:
                    output = Path(directory)
                    if kind == 'themes':
                        render_theme(region, id_, path, output, assistant(), checksums)
                    else:
                        render_room(region, id_, path, output)
                        candidate['animated'] = (output / 'scene.json').is_file()
                        if clips:
                            opening_music(region, output, clips)
                            candidate['music'] = track
                    for asset in output.iterdir():
                        size = asset.stat().st_size
                        if size > STATIC_ASSET_LIMIT:
                            raise ValueError(f'{asset.name} is {size / 1024**2:.1f} MiB and exceeds the 25 MiB static asset limit')
                    shutil.copytree(output, art / id_, dirs_exist_ok=True)
                catalogue[kind][id_] = candidate
                report['generated'].append({'id': id_, **candidate['source']})
                break
            except (AttributeError, KeyError, OSError, RuntimeError, StopIteration, ValueError, subprocess.SubprocessError) as error:
                report['review'].append({'id': id_, 'region': region.name, 'reason': str(error)})

    for key, kind in [('defaultBackgroundId', 'backgrounds'), ('defaultThemeId', 'themes')]:
        catalogue[key] = next((default for region in reversed(regions)
                               if (default := region.display['homeBackgroundData'].get(key)) in catalogue[kind]),
                              catalogue.get(key))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--versions', type=Path, default=ROOT / 'data/client-versions.json')
    parser.add_argument('--catalogue', type=Path, default=CATALOGUE)
    parser.add_argument('--art', type=Path, default=ROOT / 'public/event-preview')
    parser.add_argument('--cache', type=Path, default=ROOT / '.cache/home-previews/bundles')
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--snapshots', type=Path, help='Replay <region>/manifest.json, tables, and extracted .ab files')
    parser.add_argument('--assistant-art', type=Path, help='Pinned Amiya art for an offline replay')
    parser.add_argument('--only', nargs='+', help='Limit a review to these game IDs')
    args = parser.parse_args()

    args.art.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    report = {'generated': [], 'review': [], 'inputs': {}}
    regions = []
    versions = read_json(args.versions)['regions']
    for code in MIRRORS:
        try:
            snapshot = args.snapshots / code if args.snapshots else None
            region = Region(code, versions[code]['resVersion'], args.cache, snapshot)
            if not list(entries(region.display)):
                raise ValueError('Empty home display catalogue')
            regions.append(region)
            report['inputs'][code] = {'version': region.version, 'mirrorCommit': region.revision}
        except (KeyError, ValueError, OSError, subprocess.SubprocessError) as error:
            report['review'].append({'region': code, 'reason': str(error)})

    protected = {part['gameData']['id'] for preview in read_json(CURATED)
                 for part in (preview.get('theme'), preview.get('scene')) if part and part.get('gameData')}
    # Hunt is the shared layout's reviewed reference, with an event-specific sample profile.
    protected.update(('tm_hunter_1', 'bg_hunter_1'))
    if regions:
        catalogue = read_json(args.catalogue)
        original = json.dumps(catalogue)
        assistant = lru_cache(maxsize=1)(lambda: sample_artist(args.cache, args.assistant_art,
                                                              ROOT / 'data/assets/revisions.json'))
        stage_catalogue(regions, catalogue, args.art, protected, set(args.only or []), assistant, report)
        if json.dumps(catalogue) != original:
            write_json(args.catalogue, catalogue)
    write_json(args.report, report)
    print(f"{len(report['generated'])} home previews staged, {len(report['review'])} review items")
    if not regions:
        parser.exit(1, 'Neither regional input is ready; existing previews are preserved.\n')


if __name__ == '__main__':
    main()
