#!/usr/bin/env python3
"""Materialize a validated catalogue's media plan in the existing public asset repositories.

Pass two clean repository checkouts. This script stages files but never pushes.
All source bytes are decoded and hashed before a catalogue may adopt the revisions.
"""
import argparse, hashlib, importlib.util, io, json, re, subprocess, urllib.parse
from pathlib import Path
from PIL import Image


def fetch(url):
    return subprocess.check_output(['curl', '--fail', '--silent', '--show-error', '--location', '--retry', '3', '--max-time', '90', url])


def sha(data):
    return hashlib.sha256(data).hexdigest()


def build(plan, image_root, skin_root):
    assert re.fullmatch(r'[a-f0-9]{40}', plan['revision'])
    roots = {'image': image_root, 'skin': skin_root}
    manifests = {k: json.loads((v/'asset-manifest.json').read_text()) for k,v in roots.items()}
    maps = {k: json.loads((v/'asset-source-map.json').read_text()) for k,v in roots.items()}
    sources = {}
    spec = importlib.util.spec_from_file_location('variants',skin_root/'scripts/build_artwork_variants.py')
    variants = importlib.util.module_from_spec(spec);spec.loader.exec_module(variants)
    for entry in plan['files']:
        target = entry['path']
        if not re.match(r'^(?:[a-z]+-star-(?:icons|skins)|skill-icons|base-skill-icons|material-icons|event-poster|headhunting-banner-images)/[^/]+\.webp$',target) or '..' in Path(target).parts:
            raise ValueError(f'Unexpected asset destination: {target}')
        kind = 'skin' if '-star-skins/' in target else 'image'
        root = roots[kind]
        if target in manifests[kind]['files']:
            continue
        source = entry.get('sourcePath')
        if source:
            if source.startswith('/') or '..' in Path(source).parts: raise ValueError('Unsafe source path')
            url = f'https://raw.githubusercontent.com/{plan["sourceRepository"]}/{plan["revision"]}/{urllib.parse.quote(source)}'
        else:
            titles = ['File:'+t for t in entry['wikiFiles']]
            query = urllib.parse.urlencode({'action':'query','prop':'imageinfo','iiprop':'url|sha1','format':'json','titles':'|'.join(titles)})
            response = json.loads(fetch('https://arknights.wiki.gg/api.php?'+query))
            available = {p['title']:p['imageinfo'][0] for p in response['query']['pages'].values() if p.get('imageinfo')}
            normalized = {p['from']:p['to'] for p in response['query'].get('normalized',[])}
            info = next((available[normalized.get(t,t)] for t in titles if normalized.get(t,t) in available),None)
            if not info: raise ValueError(f'Artwork not published for {target}: {titles}')
            url = info['url']
            if urllib.parse.urlparse(url).hostname not in ('arknights.wiki.gg','static.wikitide.net'): raise ValueError('Unexpected image host')
        data = fetch(url)
        image = Image.open(io.BytesIO(data));image.load()
        if not (0 < image.width <= 16384 and 0 < image.height <= 16384): raise ValueError('Invalid dimensions')
        image = image.convert('RGBA')
        dest = root/target;dest.parent.mkdir(parents=True,exist_ok=True)
        if kind == 'skin':
            original = root/'originals'/Path(target).with_suffix('.png');original.parent.mkdir(parents=True,exist_ok=True)
            image.save(original,format='PNG');image.save(dest,format='WEBP',quality=90,method=6)
            _,row = variants.build_one((target,str(original),(320,768,1280)))
            # The artwork repository's map rows are bare source paths; it has no blob rule.
            if source: maps[kind]['files'][target] = source
        else:
            image.thumbnail((1600,1600) if target.startswith(('event-poster/','headhunting-banner-images/')) else (180,180))
            image.save(dest,format='WEBP',lossless=True)
            row = {}
            # The git blob of the exact bytes fetched at plan.revision. Without it the image
            # sync adopts whatever blob upstream holds when it next runs, which may be newer.
            if source: maps[kind]['files'][target] = {'sourcePath':source,'sourceBlob':hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest(),'maxWidth':180}
        row.update({'bytes':dest.stat().st_size,'sha256':sha(dest.read_bytes()),'width':image.width,'height':image.height})
        manifests[kind]['files'][target] = row
        sources[target] = {'url':url,'sha256':sha(data)}
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

if __name__ == '__main__':
    parser = argparse.ArgumentParser();parser.add_argument('plan',type=Path);parser.add_argument('image_repo',type=Path);parser.add_argument('skin_repo',type=Path)
    args = parser.parse_args();build(json.loads(args.plan.read_text()),args.image_repo.resolve(),args.skin_repo.resolve())
