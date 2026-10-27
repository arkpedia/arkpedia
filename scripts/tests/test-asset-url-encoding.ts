import assert from 'node:assert/strict';
import test from 'node:test';
import fixture from './fixtures/asset-path-shapes.json';
import bundledRevisions from '../../data/assets/revisions.json';
import { encodeAssetPath } from '../../lib/assets/assetUrl';
import { getSkinArtworkSources, skinArtworkSrcSet } from '../../lib/assets/skinArtwork';
import { contentUrl } from '../../lib/content/urls';
import type { ContentRelease } from '../../lib/content/types';

/*
 * Asset paths went into URLs as the records spell them (sweep 2026-09-24, §3.2). The
 * Kernel Locating #10 banner was requested as '.../Kernel%20Locating%20' -- the rest
 * read as a fragment -- every responsive skin srcset on / and /skins held raw spaces,
 * so browsers dropped it for the 422 KB fallback, and Franka's 'Rainforest, Me,
 * Rainbow' split its srcset at the commas and requested /Me. The fixture is one asset
 * path per folder and combination of URL-significant characters, taken from every page
 * of one published release; the release itself is never read here.
 */
const release: ContentRelease = {
  release: 'a'.repeat(64),
  baseUrl: 'https://example.org/commit/release',
  assets: { 'arkpedia-image-assets': 'b'.repeat(40), 'arkpedia-skin-assets': 'c'.repeat(40) },
};
const paths = (fixture.paths as { path: string; page: string }[]).map(entry => entry.path);
const PINNED = /^https:\/\/raw\.githubusercontent\.com\/arkpedia\/arkpedia-(?:image|skin)-assets\/[a-f0-9]{40}\//;
const decode = (segment: string) => { try { return decodeURIComponent(segment); } catch { return segment; } };

/** The repository file a record's path names, without its cache-buster. */
function fileOf(path: string): string {
  const relative = path.replace(PINNED, '/').replace(/[?&]v=[A-Za-z0-9]+$/, '');
  return relative.split('/').map(decode).join('/')
    .replace(/^\/skin-originals\//, '/originals/').replace(/^\/skin-variants\//, '/variants/');
}

/** What the browser would do with the string: the parts it reads as syntax. */
function assertOneFile(label: string, out: string, file: string) {
  assert.doesNotMatch(out, /[\s#,]/, `${label}: ${out} carries a raw space, '#' or ','`);
  const url = new URL(out);
  assert.equal(url.origin, 'https://assets.arkpedia.net', label);
  assert.equal(url.hash, '', `${label}: part of the filename became a fragment`);
  assert.match(url.search, /^(?:\?v=[A-Za-z0-9]+)?$/, `${label}: part of the filename became a query`);
  const [, , repository, revision, ...rest] = url.pathname.split('/');
  assert.equal(revision, release.assets[repository], `${label}: not pinned to the page's release`);
  assert.equal(`/${rest.map(decodeURIComponent).join('/')}`, file, `${label}: names a different file`);
}

test('the fixture covers the path shapes that broke', () => {
  const shapes = [
    ['#', (p: string) => p.includes('#')],
    ['comma', (p: string) => p.includes(',')],
    ['space', (p: string) => p.includes(' ')],
    ['cache-buster', (p: string) => /\?v=/.test(p)],
    ['pre-encoded', (p: string) => /%[0-9A-F]{2}/i.test(p) && p.startsWith('/')],
    ['full pinned URL', (p: string) => PINNED.test(p)],
    ['skin artwork', (p: string) => /^\/(?:one|two|three|four|five|six)-star-skins\//.test(p)],
    ['album cover', (p: string) => p.startsWith('/album-covers/')],
    ['non-ASCII', (p: string) => /[^\x00-\x7f]/.test(p)],
  ] as const;
  for (const [label, has] of shapes) assert.ok(paths.some(has), `no ${label} path in the fixture`);
  assert.ok(paths.includes('/headhunting-banner-images/Kernel Locating #10 (Global).webp?v=2a59468c'));
  assert.ok(paths.includes('/five-star-skins/Franka - Rainforest, Me, Rainbow.webp'));
});

test('every asset path in the release becomes one pinned URL naming the same file', () => {
  for (const path of paths) {
    const out = contentUrl(path, release);
    assertOneFile(path, out, fileOf(path));
    // Encoded once: a URL already built is left as it is.
    assert.equal(contentUrl(out, release), out, `${path}: encoded twice`);
  }
});

test('a raw filename and its encoded spelling reach the same URL', () => {
  for (const path of paths.filter(p => p.startsWith('/'))) {
    const encoded = path.replace(/^(.*?)((?:[?&]v=[A-Za-z0-9]+)?)$/, (_, file: string, version: string) =>
      file.split('/').map(segment => encodeURIComponent(decode(segment))).join('/') + version);
    assert.equal(contentUrl(encoded, release), contentUrl(path, release), path);
  }
  assert.equal(contentUrl('/six-star-icons/Amiya%20-%20Base.webp', release), contentUrl('/six-star-icons/Amiya - Base.webp', release));
  assert.equal(encodeAssetPath('/album-covers/促融共竞#1_OST_cover.webp'), '/album-covers/%E4%BF%83%E8%9E%8D%E5%85%B1%E7%AB%9E%231_OST_cover.webp');
  assert.equal(encodeAssetPath('/headhunting-banner-images/A?B.webp&v=abc123'), '/headhunting-banner-images/A%3FB.webp?v=abc123');
  assert.equal(encodeAssetPath('/material-icons/100% Orirock.webp'), '/material-icons/100%25%20Orirock.webp');
  // Generated game records keep their own spelling: planner-data names are double-encoded on disk.
  assert.equal(contentUrl('/planner-data/Test%2520Name.json', release), 'https://example.org/commit/release/public/planner-data/Test%2520Name.json');
});

test('art addressed in full is re-pinned to the page release, like a root-relative path', () => {
  const stale = 'https://raw.githubusercontent.com/arkpedia/arkpedia-image-assets/1b2907e18ab44837eaac4cbf4e9c865a741d50b6/six-star-icons/Makoto%20Yuki%20-%20Base.webp';
  assert.equal(contentUrl(stale, release), contentUrl('/six-star-icons/Makoto Yuki - Base.webp', release));
  const main = 'https://raw.githubusercontent.com/arkpedia/arkpedia-skin-assets/main/six-star-skins/Makoto Yuki - In Witness of Glory.webp';
  assert.equal(contentUrl(main, release), `https://assets.arkpedia.net/arkpedia/arkpedia-skin-assets/${'c'.repeat(40)}/six-star-skins/Makoto%20Yuki%20-%20In%20Witness%20of%20Glory.webp`);
  // A page with no release (a bundled fallback) uses the deploy's own pin.
  assert.ok(contentUrl(stale).includes(`/${bundledRevisions['arkpedia-image-assets']}/`));
  // Other hosts and repositories are not Arkpedia art.
  for (const other of ['https://raw.githubusercontent.com/someone/arkpedia-image-assets/main/x.webp',
    'https://raw.githubusercontent.com/arkpedia/unrelated-repo/main/x.webp', 'https://arknights.wiki.gg/images/x.png']) {
    assert.equal(contentUrl(other, release), other);
  }
});

test('responsive skin artwork builds srcsets of exactly three candidates, pinned art included', () => {
  const skins = paths.filter(p => /^(?:\/|https:\/\/raw\.githubusercontent\.com\/arkpedia\/arkpedia-skin-assets\/[a-f0-9]{40}\/)(?:one|two|three|four|five|six)-star-skins\/.+\.webp$/.test(p));
  assert.ok(skins.some(p => p.includes(',')) && skins.some(p => p.startsWith('https://')));
  for (const path of skins) {
    const sources = getSkinArtworkSources(path);
    assert.ok(sources, `${path}: no responsive renditions`);
    for (const format of ['avif', 'webp'] as const) {
      const srcset = skinArtworkSrcSet(sources[format], src => contentUrl(src, release));
      const candidates = srcset.split(', ');
      assert.equal(candidates.length, 3, `${path}: ${srcset}`);
      for (const [index, candidate] of candidates.entries()) {
        const [url, descriptor, ...extra] = candidate.split(' ');
        assert.deepEqual(extra, [], `${path}: a candidate URL holds a space`);
        assert.equal(descriptor, `${[320, 768, 1280][index]}w`);
        assertOneFile(path, url, `/variants/${format}/w${[320, 768, 1280][index]}${fileOf(path).replace(/\.webp$/, `.${format}`)}`);
      }
    }
    assertOneFile(`${path} original`, contentUrl(sources.original, release), `/originals${fileOf(path).replace(/\.webp$/, '.png')}`);
  }
});
