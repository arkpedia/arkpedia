#!/usr/bin/env python3
"""Materialize a media plan in the existing public asset repositories.

    publish-catalogue-assets.py PLAN IMAGE_REPO [SKIN_REPO] [--stage NAME] [--published FILE]
    publish-catalogue-assets.py plan-staged OUT

Pass clean repository checkouts. This script stages files but never pushes
(publish-catalogue-assets.sh commits and pushes them). All source bytes are decoded and hashed
before a catalogue may adopt the revisions.

Two plans come here. The catalogue stage's (.cache/catalogue/asset-plan.json) names files in
a game-resource mirror at the plan's revision (`sourcePath`), or key art from an official CN
announcement (`urls`, the images on the post; scripts/sync/sync-cn-news.mjs) and wiki uploads
(`wikiFiles`), tried in that order: the post's image is the file the wiki uploads later, from the
source. Only an https address on OFFICIAL_IMAGE_HOSTS is ever downloaded.
The staged-art plan (`plan-staged` writes it) names files the refresh's importers staged
under .cache/<kind>/ (`localPath`, with the `source` they came from; config/staged-art.json):
only the kinds whose stage ran to the end in this run (data/stage-report.json), and only
what that stage listed in .cache/<kind>/staged.json.

Every destination folder has one way it is sized and encoded (FOLDERS below), whichever plan
names it: the game's circled material and item icons keep their native 183px, never squeezed
to a portrait's 180; stage renders keep their size up to 512px wide. A file from a mirror at a
pinned commit gets a row in the image repository's asset-source-map.json with the git blob of
the exact bytes and the width its daily sync keeps; every file gets a provenance row in
sources/catalogue-imports.json (its URL, and the sha256 of the bytes fetched).

Key art comes from the official posts and the wiki's uploads, which is enrichment and never a
gate: art neither can serve yet (no upload, the site down, an unexpected image host) is left out,
its record is published without it, and it goes on the quarantine list under
'catalogue-art' (or the stage --stage names). The record keeps its planned path, so the next
run's plan asks again. So does any one file that cannot be fetched from the mirror, or does
not decode to a sane image: it holds back that file, not every other file of the plan.

A reason names the file and which step failed, never the day's error text (the log gets
that) nor the plan's revision (the sourceRef carries it): data/quarantine.json is a release
input, so an outage that answers 502 one day and refuses the connection the next, or a
mirror that commits overnight, must not make each day a new release.

A staged file left out is only logged, never held here: the importer that staged it already
holds it under its own stage until a run publishes it (stage-render:pa-4 under
'stage-renders', item-icon:<id> under 'item-icons', ...; config/staged-art.json), and runs
again after this stage when anything else of its kind was published, staging and holding it
anew. A second entry here named the same file twice in the day's issue (A1 of the 2026-09
rehearsal: art:stages-images/pa-4.webp beside stage-render:pa-4).
"""
import argparse, hashlib, importlib.util, io, json, re, subprocess, sys, urllib.parse
from pathlib import Path
from PIL import Image

_spec = importlib.util.spec_from_file_location('quarantine', Path(__file__).resolve().parents[1]/'imports/quarantine.py')
quarantine = importlib.util.module_from_spec(_spec);_spec.loader.exec_module(quarantine)

APP = Path(__file__).resolve().parents[2]
REGISTRY = APP/'config/staged-art.json'
# Where the official CN website (ak.hypergryph.com/news) keeps the images of its posts. Any other
# address a post names is never fetched; a new host is added here once someone has looked at it.
OFFICIAL_IMAGE_HOSTS = ('web.hycdn.cn',)


def official_image(urls):
    """(bytes, url) of the first official image that downloads, decodes and has a section's key art
    shape, or (None, why) for none, so that the wiki is asked instead.

    A post's key art is its 1560x500 banner. A site answering with a page instead of the picture (a
    challenge or an error page, with a 200), or a small picture above a heading (a divider, should
    the layout ever add one), is not it. `why` names the addresses and what went wrong, never the
    error text (see the header)."""
    failed = []
    for url in urls:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != 'https' or parsed.hostname not in OFFICIAL_IMAGE_HOSTS:
            failed.append(f'{url} is not on an official image host ({", ".join(OFFICIAL_IMAGE_HOSTS)}) and is never fetched')
            continue
        try:
            data = fetch(url)
        except Exception as exc:
            print(f'Downloading the official image {url} failed: {exc}', file=sys.stderr)
            failed.append(f'downloading the official image {url} failed')
            continue
        try:
            with Image.open(io.BytesIO(data)) as image:
                image.load()
                width, height = image.size
        except Exception as exc:
            print(f'The official image {url} does not decode: {exc}', file=sys.stderr)
            failed.append(f'the official image {url} is not an image that decodes')
            continue
        if width < 1000 or not 2.5 <= width / height <= 4:
            failed.append(f'the official image {url} is {width}x{height}, not the shape of a section\'s key art')
            continue
        return data, url
    return None, '; '.join(failed)


class Folder:
    """How art in one destination folder is sized and encoded.

    `box` is the largest it is kept at (never enlarged), `max_width` what the image
    repository's daily sync keeps a mapped file at (sync_images.py re-encodes to it when the
    mirror's file changes), `extension` what the destination must end in."""

    def __init__(self, box, image_format='WEBP', mode='RGBA', extension='.webp', **options):
        self.box, self.format, self.mode, self.extension = box, image_format, mode, extension
        self.options = options or ({'lossless': True} if image_format == 'WEBP' else {})

    @property
    def max_width(self):
        return self.box[0]

    def encode(self, image):
        image = image.convert(self.mode)
        image.thumbnail(self.box, Image.Resampling.LANCZOS)
        output = io.BytesIO()
        image.save(output, format=self.format, **self.options)
        return output.getvalue(), image.size


FOLDERS = {
    **{f'{rarity}-star-icons': Folder((180, 180)) for rarity in ('one', 'two', 'three', 'four', 'five', 'six')},
    'skill-icons': Folder((128, 128)),
    'base-skill-icons': Folder((128, 128)),
    # The game's own circled art at its native 183px: shrunk any further it reads soft at
    # retina, and it is never cut down to the object alone.
    'material-icons': Folder((183, 183)),
    'item-icons': Folder((183, 183), image_format='PNG', extension='.png', optimize=True),
    'event-poster': Folder((1600, 1600)),
    # Official furniture shop thumbnails, retained at native size and aspect ratio.
    'content-art': Folder((1600, 1600), quality=90, method=6),
    'headhunting-banner-images': Folder((1600, 1600)),
    # As the rest of stages-images/: RGB webp, 320-512px wide.
    'stages-images': Folder((512, 512), mode='RGB', quality=80, method=6),
    # One flat colour on alpha, painted by the site from the theme.
    'nation-marks': Folder((512, 512), method=6, lossless=True),
    # As the other 293 covers: 500px RGB webp.
    'album-covers': Folder((500, 500), mode='RGB', quality=85, method=6),
    # The Arknights Story Map's pictures (scripts/imports/import_story_map.py): the board's own
    # 384px resize of each cover, drawn at about 45-180px, and the official comics' covers
    # (336x217 at the source, a few 1664x1080), which the Manga page shows at about 210-400px.
    'story-map': Folder((640, 640), quality=85, method=6),
}
SKIN_FOLDER = re.compile(r'[a-z]+-star-skins')


def fetch(url):
    return subprocess.check_output(['curl', '--fail', '--silent', '--show-error', '--location', '--retry', '3', '--max-time', '90', url])


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git_blob(data):
    return hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest()


def repository_name(value):
    """owner/name, whether written so or as its GitHub URL (asset-source-map.json has the URL)."""
    return re.sub(r'^https://github\.com/', '', str(value or '')).removesuffix('.git').strip('/')


def destination(target):
    """(kind, folder policy) for a plan's destination; refuses anything else."""
    parts = Path(target).parts
    if len(parts) != 2 or '..' in parts or target.startswith('/'):
        raise ValueError(f'Unexpected asset destination: {target}')
    folder = parts[0]
    if SKIN_FOLDER.fullmatch(folder) and target.endswith('.webp'):
        return 'skin', None
    policy = FOLDERS.get(folder)
    if not policy or not target.endswith(policy.extension):
        raise ValueError(f'Unexpected asset destination: {target}')
    return 'image', policy


def staged_plan(app_root=APP):
    """The staged-art plan: every file a kind's importer staged in this run, for each kind
    whose stage ran to the end (data/stage-report.json; with no report, a refresh run by hand,
    every kind that staged anything)."""
    kinds = json.loads(REGISTRY.read_text())['kinds']
    report_file = app_root/'data/stage-report.json'
    status = {}
    if report_file.exists():
        for entry in json.loads(report_file.read_text()).get('stages', []):
            status[entry['stage']] = entry['status']
    files, seen = [], {}
    for kind, spec in kinds.items():
        sidecar = app_root/'.cache'/kind/'staged.json'
        if not sidecar.exists():
            continue
        if status and status.get(spec['stage']) != 'ok':
            print(f'  {kind}: its stage {spec["stage"]} {status.get(spec["stage"], "did not run")} this run, so what it staged is not published')
            continue
        listed = json.loads(sidecar.read_text())
        for target, row in listed['files'].items():
            if target.split('/')[0] not in spec['folders']:
                raise ValueError(f'{kind} staged {target}, outside the folders config/staged-art.json gives it')
            if target in seen:
                print(f'  {target}: staged by both {seen[target]} and {kind}; publishing the first')
                continue
            seen[target] = kind
            entry = {'path': target, 'localPath': f'.cache/{kind}/{row["file"]}', 'stage': kind, 'source': row['source'], 'sha256': row['sha256']}
            if row.get('mirror'):
                entry['mirror'] = row['mirror']
            files.append(entry)
    return {'files': sorted(files, key=lambda entry: entry['path'])}


def build(plan, image_root, skin_root=None, alerts=None, app_root=APP):
    """`alerts` collects the quarantine entries for art that was left out. Returns the
    plan's destinations the repositories now hold: built here, or there already (a push that
    went through on an attempt that still failed, or a file published some other way)."""
    alerts = [] if alerts is None else alerts
    if any(entry.get('sourcePath') for entry in plan['files']):
        assert re.fullmatch(r'[a-f0-9]{40}', plan['revision'])
    roots = {'image': image_root, **({'skin': skin_root} if skin_root else {})}
    manifests = {k: json.loads((v/'asset-manifest.json').read_text()) for k,v in roots.items()}
    maps = {k: json.loads((v/'asset-source-map.json').read_text()) for k,v in roots.items()}
    sources = {}
    built = []
    variants = None
    for entry in plan['files']:
        target = entry['path']
        kind, policy = destination(target)
        if kind not in roots:
            raise ValueError(f'{target} belongs in the artwork repository, which this plan was not given')
        root = roots[kind]
        if target in manifests[kind]['files']:
            built.append(target)
            continue
        source, local = entry.get('sourcePath'), entry.get('localPath')
        titles = ['File:'+t for t in entry.get('wikiFiles') or []]
        urls = entry.get('urls') or []
        def left_out(why, ref=(source or entry.get('source') or (urls[0] if urls else None) or (titles[0] if titles else None)), error=None):
            print(f'Left out {target}: {why}' + (f': {error}' if error is not None else ''), file=sys.stderr)
            # A staged file's importer holds it already (see the header): one entry per file.
            if local: return
            alerts.append({'key':f'art:{target}','action':'published-partial',
                **({'sourceRef':ref} if ref else {}),'reason':f'{why}; the record is published without {target} until a later run imports it.'})
        if local:
            # A file an importer staged in this run: never outside the app's .cache/.
            path = (app_root/local).resolve()
            if not local.startswith('.cache/') or '..' in Path(local).parts or not path.is_relative_to((app_root/'.cache').resolve()):
                raise ValueError(f'Unsafe staged path: {local}')
            url = entry['source']
            try:
                data = path.read_bytes()
            except OSError as exc:
                left_out(f'The staged file {local} could not be read', url, exc);continue
            if entry.get('sha256') and sha(data) != entry['sha256']:
                left_out(f'The staged file {local} is not the file its importer staged', url);continue
        elif source:
            if source.startswith('/') or '..' in Path(source).parts: raise ValueError('Unsafe source path')
            url = f'https://raw.githubusercontent.com/{plan["sourceRepository"]}/{plan["revision"]}/{urllib.parse.quote(source)}'
            try:
                data = fetch(url)
            except Exception as exc:
                left_out(f'Downloading {source} from {plan["sourceRepository"]} failed', url, exc);continue
        else:
            data, official = official_image(urls) if urls else (None, '')
            if data is not None:
                url = official
            elif not titles:
                left_out(f'No official image could be had ({official})');continue
            else:
                # The wiki's upload of the same art, when the post's image could not be had; a file
                # left out then says both.
                said = lambda why: f'No official image could be had ({official}), and {why[0].lower()}{why[1:]}' if urls else why
                if urls: print(f'{target}: no official image ({official}); asking the wiki', file=sys.stderr)
                query = urllib.parse.urlencode({'action':'query','prop':'imageinfo','iiprop':'url|sha1','format':'json','titles':'|'.join(titles)})
                try:
                    response = json.loads(fetch(quarantine.WIKI_API+'?'+query))
                    available = {p['title']:p['imageinfo'][0] for p in response['query']['pages'].values() if p.get('imageinfo')}
                    normalized = {p['from']:p['to'] for p in response['query'].get('normalized',[])}
                except Exception as exc:
                    left_out(said(f'The wiki could not be reached to ask for {", ".join(titles)}'), error=exc);continue
                info = next((available[normalized.get(t,t)] for t in titles if normalized.get(t,t) in available),None)
                if not info:
                    left_out(said(f'The wiki has no upload for {", ".join(titles)} yet'));continue
                url = info['url']
                host = urllib.parse.urlparse(url).hostname
                if host not in ('arknights.wiki.gg','static.wikitide.net'):
                    left_out(said(f'The wiki answered {titles[0]} with an image on an unexpected host ({host}), which is never fetched'));continue
                try:
                    data = fetch(url)
                except Exception as exc:
                    left_out(said(f'Downloading {url} failed'), error=exc);continue
        # The mirror's URL names the plan's revision; the file is named by its path instead.
        name = local or source or url
        try:
            image = Image.open(io.BytesIO(data));image.load()
        except Exception as exc:
            left_out(f'{name} is not an image that decodes', url, exc);continue
        if not (0 < image.width <= 16384 and 0 < image.height <= 16384):
            left_out(f'{name} is {image.width}x{image.height}, which no art is', url);continue
        dest = root/target;dest.parent.mkdir(parents=True,exist_ok=True)
        if kind == 'skin':
            if variants is None:
                spec = importlib.util.spec_from_file_location('variants',skin_root/'scripts/build_artwork_variants.py')
                variants = importlib.util.module_from_spec(spec);spec.loader.exec_module(variants)
            image = image.convert('RGBA')
            original = root/'originals'/Path(target).with_suffix('.png');original.parent.mkdir(parents=True,exist_ok=True)
            image.save(original,format='PNG');image.save(dest,format='WEBP',quality=90,method=6)
            _,row = variants.build_one((target,str(original),(320,768,1280)))
            # The artwork repository's map rows are bare source paths; it has no blob rule.
            if source: maps[kind]['files'][target] = source
            size = image.size
        else:
            encoded, size = policy.encode(image)
            dest.write_bytes(encoded)
            row = {}
            # The git blob of the exact bytes fetched at the pinned commit. Without it the image
            # sync adopts whatever blob upstream holds when it next runs, which may be newer.
            mirror = entry.get('mirror') or {}
            if source:
                maps[kind]['files'][target] = {'sourcePath':source,'sourceBlob':git_blob(data),'maxWidth':policy.max_width}
            elif mirror and repository_name(mirror.get('repository')) == repository_name(maps[kind].get('sourceRepository')) and mirror.get('blob') == git_blob(data):
                maps[kind]['files'][target] = {'sourcePath':mirror['path'],'sourceBlob':mirror['blob'],'maxWidth':policy.max_width}
        row.update({'bytes':dest.stat().st_size,'sha256':sha(dest.read_bytes()),'width':size[0],'height':size[1]})
        manifests[kind]['files'][target] = row
        sources[target] = {'url':url,'sha256':sha(data),**({'importer':entry['stage']} if entry.get('stage') else {})}
        built.append(target)
        print(f'Built {target}')
    for kind,root in roots.items():
        (root/'asset-manifest.json').write_text(json.dumps(manifests[kind],ensure_ascii=False,separators=(',',':'))+'\n')
        mapping_path = root/'asset-source-map.json'
        if json.loads(mapping_path.read_text()) != maps[kind]:
            mapping_path.write_text(json.dumps(maps[kind],ensure_ascii=False,indent=2)+'\n')
        provenance = root/'sources/catalogue-imports.json'
        previous = json.loads(provenance.read_text()) if provenance.exists() else {}
        previous.update({k:v for k,v in sources.items() if ('-star-skins/' in k)==(kind=='skin')})
        if previous: provenance.parent.mkdir(exist_ok=True);provenance.write_text(json.dumps(previous,ensure_ascii=False,indent=2)+'\n')
        subprocess.run(['git','add','--sparse','--all'],cwd=root,check=True)
        subprocess.run(['python3','scripts/validate_images.py','--staged'],cwd=root,check=True)
    return built


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv[:1] == ['plan-staged']:
        if len(argv) != 2: raise SystemExit('usage: publish-catalogue-assets.py plan-staged OUT')
        plan = staged_plan(Path.cwd())
        out = Path(argv[1]);out.parent.mkdir(parents=True,exist_ok=True)
        out.write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n')
        by_kind = {}
        for entry in plan['files']: by_kind[entry['stage']] = by_kind.get(entry['stage'],0)+1
        print(f'{len(plan["files"])} staged file(s) to publish' + (': '+', '.join(f'{n} from {k}' for k,n in sorted(by_kind.items())) if by_kind else ''))
        return
    parser = argparse.ArgumentParser();parser.add_argument('plan',type=Path);parser.add_argument('image_repo',type=Path);parser.add_argument('skin_repo',type=Path,nargs='?')
    parser.add_argument('--stage',default='catalogue-art',help='the quarantine stage art left out is reported under')
    parser.add_argument('--published',type=Path,help='where to write the destinations the repositories hold, by the importer that staged them')
    args = parser.parse_args(argv);alerts = []
    plan = json.loads(args.plan.read_text())
    built = build(plan,args.image_repo.resolve(),args.skin_repo.resolve() if args.skin_repo else None,alerts,Path.cwd())
    if args.published:
        stage_of = {entry['path']:entry.get('stage') for entry in plan['files']}
        args.published.write_text(json.dumps({'files':{target:stage_of[target] for target in built}},ensure_ascii=False,indent=2)+'\n')
    # Only after the build: a build that failed did not run the stage to completion.
    quarantine.report(args.stage,alerts)

if __name__ == '__main__':
    main()
