import test from 'node:test';
import assert from 'node:assert/strict';
import { readContentReaders, releaseDeployments, deployTargets } from '../deploy/deploy-targets.mjs';
import { deploymentUrls } from '../content/deploy-gate.mjs';
import { resumePilotContent } from '../deploy/resume-pilot-content.mjs';

const reader = { name: 'pilot', url: 'https://pilot.example', branch: 'main', live: true, refresh: false };
test('the pilot gates main content but is never a Vercel upload or dev-content target', () => {
  const main = releaseDeployments({ ARKPEDIA_RELEASE_BRANCH: 'main' });
  assert.deepEqual(main.map(d => d.name), ['arkpedia-net', 'arkpedia-cloudflare']);
  assert.deepEqual(deploymentUrls({ ARKPEDIA_RELEASE_BRANCH: 'main' }), ['https://www.arkpedia.net', 'https://arkpedia-cf.mocchibird.com']);
  assert.deepEqual(deployTargets({ branch: 'main' }).map(d => d.name), ['arkpedia-net']);
  assert.deepEqual(releaseDeployments({ ARKPEDIA_RELEASE_BRANCH: 'dev' }).map(d => d.name), ['arkpedia-dev']);
  assert.equal(main.find(d => d.name === 'arkpedia-cloudflare').refresh, false);
});
test('reader inventory refuses ambiguous names, non-origins, unknown fields and implicit flags', () => {
  assert.deepEqual(readContentReaders({}), []);
  assert.deepEqual(readContentReaders({ contentReaders: [reader] }), [reader]);
  for (const patch of [{ url: 'http://pilot.example' }, { url: 'https://pilot.example/path' },
    { url: 'https://user:password@pilot.example' }, { url: 'https://pilot.example/#fragment' },
    { live: 'true' }, { refresh: undefined }, { tokenSecret: 'UNEXPECTED' }]) {
    assert.throws(() => readContentReaders({ contentReaders: [{ ...reader, ...patch }] }));
  }
  assert.throws(() => readContentReaders({ deployments: [{ name: 'pilot' }], contentReaders: [reader] }), /duplicate reader/);
});

const source = 'a'.repeat(40);
const release = { generator: source, codeFingerprint: 'b'.repeat(64), schema: 2 };
function fixture() {
  const calls = [];
  return { calls, source, release, urls: ['https://www.example', 'https://pilot.example'],
    head: async () => source, findHeld: async () => '123', dispatch: async () => { calls.push('dispatch'); },
    read: async url => ({ url, info: { version: 1, commit: source, codeFingerprint: release.codeFingerprint,
      contentSchema: 2, dirty: false, contentChannel: 'live' } }),
  };
}
test('held content resumes only after both serving fingerprints match the released code', async () => {
  const f = fixture();
  assert.equal((await resumePilotContent(f)).action, 'requested');
  assert.deepEqual(f.calls, ['dispatch']);
});
test('old pilot channel, stale Vercel code and unavailable reader each keep content held', async () => {
  for (const patch of [{ contentChannel: 'dev-live' }, { codeFingerprint: 'c'.repeat(64) }, { dirty: true }]) {
    const f = fixture(); const original = f.read;
    f.read = async url => { const value = await original(url); if (url.includes('pilot')) Object.assign(value.info, patch); return value; };
    assert.equal((await resumePilotContent(f)).action, 'waiting-for-readers');
    assert.deepEqual(f.calls, []);
  }
  const f = fixture(); f.read = async url => ({ url, error: 'unavailable' });
  assert.equal((await resumePilotContent(f)).action, 'waiting-for-readers');
  assert.deepEqual(f.calls, []);
});
test('moved main and no held issue never start another content build', async () => {
  const moved = fixture(); moved.head = async () => 'd'.repeat(40);
  assert.equal((await resumePilotContent(moved)).action, 'obsolete');
  const idle = fixture(); idle.findHeld = async () => 'none';
  assert.equal((await resumePilotContent(idle)).action, 'not-held');
  assert.deepEqual([...moved.calls, ...idle.calls], []);
  const late = fixture(); let reads = 0; late.head = async () => ++reads === 1 ? source : 'd'.repeat(40);
  assert.equal((await resumePilotContent(late)).action, 'obsolete');
  assert.deepEqual(late.calls, []);
});
