import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pullOperatorText } from './pull-operator-text.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-text-'));
  fs.mkdirSync(path.join(root, 'config'));
  const bytes = Buffer.from('{}\n');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const revision = 'a'.repeat(40);
  fs.writeFileSync(path.join(root, 'config/operator-text-source.json'), JSON.stringify({ repository: 'arkpedia/arkpedia-data', revision, files: { 'combat-keywords.json': hash, 'operator-translations.json': hash } }));
  return { root, bytes, revision };
}
test('missing text records load from the pinned canonical commit; newer hydrated records win', async () => {
  const { root, bytes, revision } = fixture();
  try {
    const requests = [];
    assert.equal(await pullOperatorText(root, async url => { requests.push(url); return new Response(bytes); }), 2);
    assert.ok(requests.every(url => url.includes(`/${revision}/source/data/`)));
    fs.writeFileSync(path.join(root, 'data/combat-keywords.json'), '["newer published record"]');
    assert.equal(await pullOperatorText(root, async () => { throw Error('Must not refetch present data'); }), 0);
    assert.equal(fs.readFileSync(path.join(root, 'data/combat-keywords.json'), 'utf8'), '["newer published record"]');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('mismatched bytes or failed fetches cannot seed a partial snapshot', async () => {
  for (const response of [new Response('different'), new Response('unavailable', { status: 503 })]) {
    const { root, bytes } = fixture();
    let count = 0;
    try {
      await assert.rejects(pullOperatorText(root, async () => ++count === 1 ? new Response(bytes) : response));
      assert.equal(fs.existsSync(path.join(root, 'data/operator-translations.json')), false);
      assert.equal(fs.existsSync(path.join(root, 'data/combat-keywords.json')), false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
});

test('only explicitly superseded hydrated snapshots upgrade to the checked supplement', async () => {
  const { root, bytes } = fixture();
  const file = path.join(root, 'data/operator-translations.json');
  const previous = Buffer.from('{"older":true}');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, previous);
    const configFile = path.join(root, 'config/operator-text-source.json');
    const pin = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    pin.supersedes = { 'operator-translations.json': [createHash('sha256').update(previous).digest('hex')] };
    fs.writeFileSync(configFile, JSON.stringify(pin));
    assert.equal(await pullOperatorText(root, async () => new Response(bytes)), 2);
    assert.deepEqual(fs.readFileSync(file), bytes);
    fs.writeFileSync(file, '{"unknownNewer":true}');
    assert.equal(await pullOperatorText(root, async () => { throw Error('Must preserve unknown data'); }), 0);
    assert.equal(fs.readFileSync(file, 'utf8'), '{"unknownNewer":true}');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
