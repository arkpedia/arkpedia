import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { contentUrl } from '../../lib/content/urls';
import { pinAssetUrl } from '../../lib/assets/revisions';
import { loadRelease } from '../../lib/content/release';
import { resolveChibiModel } from '../../lib/operators/chibi';
import type { ContentRelease } from '../../lib/content/types';
import { createRequire } from 'node:module';
const { mediaRedirects } = createRequire(import.meta.url)('../build/media-redirects.cjs');

const a = 'a'.repeat(40), b = 'b'.repeat(40), c = 'c'.repeat(40);
const image = 'arkpedia-image-assets', voice = 'arkpedia-voice-japanese', chibi = 'arkpedia-sd-assets';
const maps = {
  [image]: { [b]: { version: 1 as const, baseRevision: a, overrides: { 'new art': b } } },
  [voice]: { [b]: { version: 1 as const, baseRevision: a, overrides: { 'current/new_actor': b } } },
  [chibi]: { [b]: { version: 1 as const, baseRevision: c, overrides: {} } },
};
test('page images, voice templates and complete chibi URLs resolve without changing path encoding or source pins', () => {
  const release: ContentRelease = { release: 'e'.repeat(64), baseUrl: 'https://example.org/release', assets: { [image]: b, [voice]: b }, media: maps };
  assert.equal(contentUrl('/material-icons/Name #1.webp', release), `https://assets.arkpedia.net/arkpedia/${image}/${a}/material-icons/Name%20%231.webp`);
  assert.equal(contentUrl(`https://raw.githubusercontent.com/arkpedia/${voice}/main/current/char_002_amiya/{voiceIdLower}.mp3`, release), `https://assets.arkpedia.net/arkpedia/${voice}/${a}/current/char_002_amiya/{voiceIdLower}.mp3`);
  assert.equal(contentUrl(`https://raw.githubusercontent.com/arkpedia/${voice}/main/current/new_actor/talk.mp3`, release), `https://assets.arkpedia.net/arkpedia/${voice}/${b}/current/new_actor/talk.mp3`);
  for (const name of ['model.atlas', 'model.skel', 'model.png']) assert.equal(contentUrl(`https://raw.githubusercontent.com/arkpedia/${chibi}/${b}/models/operator/name/${a}/${name}`, release), `https://assets.arkpedia.net/arkpedia/${chibi}/${c}/models/operator/name/${a}/${name}`);
  assert.equal(pinAssetUrl(`https://raw.githubusercontent.com/arkpedia/${chibi}/${a}/model.skel`, maps), `https://assets.arkpedia.net/arkpedia/${chibi}/${a}/model.skel`, 'independent unmapped pins are preserved');
  const root = `https://raw.githubusercontent.com/arkpedia/${chibi}/${b}/models/operator/name/${a}`;
  const pet = resolveChibiModel({ skeleton: `${root}/model.skel`, atlas: `${root}/model.atlas`, textures: { 'model.png': `${root}/model.png` }, premultipliedAlpha: true }, url => contentUrl(url, release));
  const later: ContentRelease = { ...release, media: {} };
  assert.deepEqual(resolveChibiModel(pet, url => contentUrl(url, later)), pet, 'roaming pet keeps physical resources when navigation changes release context');
});
test('static redirects override exactly one directory, preserving independent descendant identities', () => {
  const rules = mediaRedirects(maps, { [image]: b }, { [image]: ['new art'], 'arkpedia-skin-assets': [] }, 'https://assets.arkpedia.net/arkpedia/{repository}/{revision}/{path}');
  assert.deepEqual(rules, [{ source: '/new art/:file', destination: `https://assets.arkpedia.net/arkpedia/${image}/${b}/new%20art/:file`, permanent: false }]);
  const skins = 'arkpedia-skin-assets';
  const skinRules = mediaRedirects({ [skins]: { [b]: { version: 1, baseRevision: a, overrides: { 'originals/six-star-skins': b, 'variants/avif/w1280/six-star-skins': b } } } }, { [skins]: b }, { [image]: [], [skins]: ['six-star-skins'] }, 'https://assets.arkpedia.net/arkpedia/{repository}/{revision}/{path}');
  assert.deepEqual(skinRules.map((rule: { source: string }) => rule.source), ['/skin-originals/six-star-skins/:file', '/skin-variants/avif/w1280/six-star-skins/:file']);
});
test('release adoption loads bounded delivery metadata and retains the previous release on invalid maps', async t => {
  const previousFetch = globalThis.fetch;
  const keys = ['ARKPEDIA_CONTENT_TEST', 'ARKPEDIA_CONTENT_DISABLED', 'ARKPEDIA_EXPORT_CONTENT', 'ARKPEDIA_CONTENT_CHANNEL', 'ARKPEDIA_CONTENT_URL', 'ARKPEDIA_CONTENT_PILOT_ORIGIN'] as const;
  const previous = keys.map(key => process.env[key]);
  Object.assign(process.env, { ARKPEDIA_CONTENT_TEST: '1', ARKPEDIA_CONTENT_DISABLED: '0', ARKPEDIA_EXPORT_CONTENT: '0', ARKPEDIA_CONTENT_CHANNEL: 'live' });
  delete process.env.ARKPEDIA_CONTENT_URL; delete process.env.ARKPEDIA_CONTENT_PILOT_ORIGIN;
  t.after(() => {
    globalThis.fetch = previousFetch;
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
  });
  let id = 'e'.repeat(64), invalid = false;
  globalThis.fetch = async input => {
    const url = String(input);
    const manifest = JSON.stringify({ schema: 2, release: id, assets: { [image]: b, 'arkpedia-skin-assets': a }, pages: {}, files: {} });
    if (url.endsWith('/live/current.json')) return new Response(JSON.stringify({ schema: 2, release: id, revision: b, manifestSha256: createHash('sha256').update(manifest).digest('hex') }));
    if (url.endsWith('/release/manifest.json')) return new Response(manifest);
    if (url.endsWith(`/__ready/arkpedia-data/${b}`)) return new Response(JSON.stringify({ version: 1, repository: 'arkpedia-data', revision: b, media: invalid ? { private: {} } : maps }));
    throw Error(`Unexpected fixture request: ${url}`);
  };
  const loaded = await loadRelease();
  assert.deepEqual(loaded?.context.media, maps);
  id = 'f'.repeat(64); invalid = true;
  assert.equal((await loadRelease())?.context.release, 'e'.repeat(64));
});
