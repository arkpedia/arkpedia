#!/usr/bin/env python3
"""Local-only artwork reviewer. npm run palettes:review (Python 3 + Pillow)."""
import argparse
from datetime import datetime, timezone
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import importlib.util
import json
from pathlib import Path
import sys
from urllib.parse import parse_qs, urlparse
sys.dont_write_bytecode = True
from PIL import Image
from palette_review import ROOT, load_reviews, validate_review, atomic_json


class ReviewStore:
    def __init__(self, root=ROOT):
        self.root = root
        self.manifest_path = root / 'data' / 'color-palettes.json'
        self.reviews_path = root / 'data' / 'color-palette-reviews.json'
        self.undo_entries = {}
        self.manifest_cache = None
        self.source_cache = {}

    def manifest(self):
        stat = self.manifest_path.stat()
        stamp = (stat.st_mtime_ns, stat.st_size, stat.st_ino)
        if not self.manifest_cache or self.manifest_cache[0] != stamp:
            self.manifest_cache = (stamp, json.loads(self.manifest_path.read_text()))
        return self.manifest_cache[1]

    def source_digest(self, key):
        path = self.art_path(key)
        stat = path.stat()
        stamp = (stat.st_mtime_ns, stat.st_size, stat.st_ino)
        if key not in self.source_cache or self.source_cache[key][0] != stamp:
            self.source_cache[key] = (stamp, hashlib.sha256(path.read_bytes()).hexdigest())
        return self.source_cache[key][1]

    def art_path(self, key):
        if key not in self.manifest()['artworks']:
            raise ValueError('Choose artwork from the palette list.')
        public = (self.root / 'public').resolve()
        path = (public / key.lstrip('/')).resolve()
        if not path.is_relative_to(public):
            raise ValueError('Invalid artwork path.')
        return path

    def details(self, key):
        path = self.art_path(key)
        digest = self.source_digest(key)
        with Image.open(path) as image:
            bounds = image.convert('RGBA').getchannel('A').getbbox()
            width, height = image.size
        review = load_reviews(self.reviews_path)['artworks'].get(key)
        colors = self.manifest()['artworks'][key]['colors']
        if review and review['sourceSha256'] == digest:
            if review['status'] == 'accepted':
                colors = review['colors']
            elif review['status'] == 'approved':
                colors = [s['color'] for s in review['samples']]
        return {'key': key, 'sourceSha256': digest, 'bounds': bounds, 'width': width, 'height': height,
                'colors': colors, 'review': review,
                'stale': bool(review and review['sourceSha256'] != digest)}

    def catalog(self):
        reviews = load_reviews(self.reviews_path)['artworks']
        items = []
        for key, entry in self.manifest()['artworks'].items():
            name, mode = Path(key).stem.rsplit(' - ', 1)
            review = reviews.get(key)
            status = review['status'] if review else 'unreviewed'
            if review and review['sourceSha256'] != self.source_digest(key):
                status = 'stale'
            items.append({'key': key, 'name': name, 'mode': mode, 'status': status, 'colors': entry['colors']})
        return sorted(items, key=lambda item: (item['name'].casefold(), item['mode']))

    def save(self, payload):
        if not isinstance(payload, dict):
            raise ValueError('Invalid review request.')
        key = payload.get('key')
        path = self.art_path(key)
        reviews = load_reviews(self.reviews_path)
        current = reviews['artworks'].get(key, {})
        if current.get('updatedAt') != payload.get('previousUpdatedAt'):
            raise ValueError('This review changed in another window. Reload it before saving.')
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        with Image.open(path) as image:
            review = validate_review(payload.get('review', {}), image, digest)
        review['updatedAt'] = datetime.now(timezone.utc).isoformat()
        reviews['artworks'][key] = review
        atomic_json(self.reviews_path, reviews)
        return review

    def decide(self, payload):
        if not isinstance(payload, dict) or payload.get('decision') not in ('accept', 'decline'):
            raise ValueError('Choose Accept or Decline.')
        key = payload.get('key')
        details = self.details(key)
        reviews = load_reviews(self.reviews_path)
        previous = reviews['artworks'].get(key)
        if (previous or {}).get('updatedAt') != payload.get('previousUpdatedAt'):
            raise ValueError('This review changed in another window. Reload before deciding.')
        if details['sourceSha256'] != payload.get('sourceSha256') or details['colors'] != payload.get('colors'):
            raise ValueError('The artwork or suggested palette changed. Reload before deciding.')
        review = {**(previous or {}), 'sourceSha256': details['sourceSha256'],
                  'status': 'accepted' if payload['decision'] == 'accept' else 'declined',
                  'colors': details['colors'], 'updatedAt': datetime.now(timezone.utc).isoformat()}
        if details['stale']:
            review.pop('samples', None)
        reviews['artworks'][key] = review
        atomic_json(self.reviews_path, reviews)
        # One undo per artwork, checked against its saved timestamp. No old
        # decision may overwrite a newer edit from this or another window.
        self.undo_entries[key] = (review['updatedAt'], previous)
        return review

    def undo(self, payload):
        if not isinstance(payload, dict):
            raise ValueError('Invalid undo request.')
        key = payload.get('key')
        reviews = load_reviews(self.reviews_path)
        entry = self.undo_entries.get(key)
        current = reviews['artworks'].get(key, {})
        if not entry or entry[0] != payload.get('updatedAt') or current.get('updatedAt') != entry[0]:
            raise ValueError('This decision can no longer be undone. Open the palette to review it again.')
        if entry[1] is None:
            reviews['artworks'].pop(key)
        else:
            reviews['artworks'][key] = entry[1]
        atomic_json(self.reviews_path, reviews)
        del self.undo_entries[key]
        return {'key': key}


def make_handler(store):
    class Handler(BaseHTTPRequestHandler):
        def send(self, value, status=200, kind='application/json'):
            body = json.dumps(value, ensure_ascii=False).encode() if kind == 'application/json' else value
            self.send_response(status)
            self.send_header('Content-Type', kind)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(body)

        def local_request(self):
            hosts = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
            return self.headers.get('Host') in hosts and self.headers.get('Origin') in (None, *(f'http://{host}' for host in hosts))

        def do_GET(self):
            if not self.local_request():
                return self.send({'error': 'Open the review server on localhost.'}, 403)
            route = urlparse(self.path)
            key = parse_qs(route.query).get('key', [''])[0]
            try:
                if route.path == '/':
                    self.send((Path(__file__).parent / 'palette-review' / 'index.html').read_bytes(), kind='text/html; charset=utf-8')
                elif route.path in ('/review.js', '/review.css'):
                    kind = 'text/javascript; charset=utf-8' if route.path.endswith('.js') else 'text/css; charset=utf-8'
                    self.send((Path(__file__).parent / 'palette-review' / route.path[1:]).read_bytes(), kind=kind)
                elif route.path == '/api/catalog':
                    self.send(store.catalog())
                elif route.path == '/api/details':
                    self.send(store.details(key))
                elif route.path == '/api/art':
                    self.send(store.art_path(key).read_bytes(), kind='image/webp')
                elif route.path == '/api/pixel':
                    query = parse_qs(route.query)
                    x, y = int(query['x'][0]), int(query['y'][0])
                    with Image.open(store.art_path(key)) as image:
                        if not (0 <= x < image.width and 0 <= y < image.height):
                            raise ValueError('Choose a pixel inside the artwork.')
                        r, g, b, alpha = image.convert('RGBA').getpixel((x, y))
                    if alpha < 192:
                        raise ValueError('Choose an opaque feature, away from transparent edges.')
                    self.send({'x': x, 'y': y, 'color': '#%02x%02x%02x' % (r, g, b)})
                else:
                    self.send({'error': 'Not found'}, 404)
            except (ValueError, KeyError, OSError) as error:
                self.send({'error': str(error)}, 400)

        def do_POST(self):
            if not self.local_request() or self.headers.get('Content-Type') != 'application/json':
                return self.send({'error': 'Use the local review screen.'}, 403)
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 65536:
                    raise ValueError('Invalid request size.')
                payload = json.loads(self.rfile.read(length))
                if self.path == '/api/save':
                    self.send(store.save(payload))
                elif self.path == '/api/decision':
                    self.send(store.decide(payload))
                elif self.path == '/api/undo':
                    self.send(store.undo(payload))
                elif self.path == '/api/apply':
                    spec = importlib.util.spec_from_file_location('palette_generator', Path(__file__).with_name('build-color-palettes.py'))
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                    module.ROOT = store.root
                    module.OUTPUT = store.manifest_path
                    module.FEATURES = store.root / 'data' / 'color-palette-features.json'
                    module.load_reviews = lambda: load_reviews(store.reviews_path)
                    module.main()
                    self.send({'message': 'Reviewed palettes applied locally. Rebuild the site to use them.'})
                else:
                    self.send({'error': 'Not found'}, 404)
            except (ValueError, KeyError, OSError, TypeError) as error:
                self.send({'error': str(error)}, 400)

        def log_message(self, format, *args):
            if len(args) > 1 and str(args[1]).startswith(('4', '5')):
                super().log_message(format, *args)
    return Handler


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=3123)
    parser.add_argument('--root', type=Path, default=ROOT, help=argparse.SUPPRESS)
    args = parser.parse_args()
    server = HTTPServer(('127.0.0.1', args.port), make_handler(ReviewStore(args.root)))
    print(f'Palette review: http://127.0.0.1:{args.port}', flush=True)
    print('Reviews are saved locally. Approving does not publish or push changes.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
