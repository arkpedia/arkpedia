import test from 'node:test';
import assert from 'node:assert/strict';
import { PILOT, MEDIA_SECRET_UPDATE, assertPilotBindings, assertPilotIdentity, pilotReleaseMessage, readPilotIdentity,
  createPilotProvider } from '../deploy/pilot-release-provider.mjs';

const nextVersion = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const foreignVersion = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const owner = { source: '1'.repeat(40), fingerprint: '2'.repeat(64), checkRun: 123, previousVersion: PILOT.legacyVersion };
function version(id = PILOT.legacyVersion) {
  return { id, annotations: id === PILOT.legacyVersion ? {} : { 'workers/message': pilotReleaseMessage(owner) },
    resources: { script_runtime: { migration_tag: 'v1' }, bindings: [
      { name: 'ARKPEDIA_ACCOUNTS_DB', type: 'd1', database_id: PILOT.database },
      { name: 'ARKPEDIA_AUTH_URL', type: 'plain_text', text: PILOT.origin },
      { name: 'ASSETS', type: 'assets' },
      ...['BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'].map(name => ({ name, type: 'secret_text' })),
      { name: 'NEXT_CACHE_DO_QUEUE', type: 'durable_object_namespace', class_name: 'DOQueueHandler', namespace_id: PILOT.queue },
      { name: 'NEXT_INC_CACHE_R2_BUCKET', type: 'r2_bucket', bucket_name: 'arkpedia-opennext-cache' },
      { name: 'WORKER_SELF_REFERENCE', type: 'service', service: PILOT.worker, environment: 'production' },
      ...(id === PILOT.legacyVersion ? [] : [
        ...['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'YOUTUBE_API_KEY'].map(name => ({ name, type: 'secret_text' })),
        { name: 'ARKPEDIA_CONTENT_CHANNEL', type: 'plain_text', text: 'live' },
        { name: 'ARKPEDIA_DEPLOYMENT_ROLE', type: 'plain_text', text: 'production' },
      ]),
    ] } };
}
function identity(id = PILOT.legacyVersion) {
  return { version: 1, commit: id === PILOT.legacyVersion ? PILOT.legacySource : owner.source,
    codeFingerprint: id === PILOT.legacyVersion ? PILOT.legacyFingerprint : owner.fingerprint,
    dirty: false, contentSchema: 2, contentChannel: id === PILOT.legacyVersion ? 'dev-live' : 'live', deploymentRole: 'production' };
}
const binding = (v, name) => v.resources.bindings.find(b => b.name === name);

test('only the exact observed legacy version may omit explicit main channel and release ownership', () => {
  assert.equal(assertPilotBindings(version()).id, PILOT.legacyVersion);
  assert.equal(assertPilotBindings(version(nextVersion)).id, nextVersion);
  const unknown = version(); unknown.id = foreignVersion;
  assert.throws(() => assertPilotBindings(unknown), /unexpected pilot bindings/);
});

test('only the recorded authorized media-secret update retains its proven checked-code identity', () => {
  const v = version(nextVersion);
  v.id = MEDIA_SECRET_UPDATE.version;
  v.annotations = { 'workers/triggered_by': 'secret' };
  v.resources.script = { etag: MEDIA_SECRET_UPDATE.etag };
  assert.equal(assertPilotBindings(v), v);
  assertPilotIdentity({ ...identity(nextVersion), commit: MEDIA_SECRET_UPDATE.source, codeFingerprint: MEDIA_SECRET_UPDATE.fingerprint }, v);
  const changedCode = structuredClone(v); changedCode.resources.script.etag = 'unreviewed';
  assert.throws(() => assertPilotBindings(changedCode), /code\/provenance changed/);
  const unknown = structuredClone(v); unknown.id = foreignVersion;
  assert.throws(() => assertPilotBindings(unknown), /unrecognized pilot release owner/);
  const exposedSecret = structuredClone(v); binding(exposedSecret, 'YOUTUBE_API_KEY').type = 'plain_text';
  assert.throws(() => assertPilotBindings(exposedSecret), /YOUTUBE_API_KEY/);
  const missingMedia = structuredClone(v); missingMedia.resources.bindings = missingMedia.resources.bindings.filter(b => b.name !== 'TWITCH_CLIENT_ID');
  assert.throws(() => assertPilotBindings(missingMedia), /unexpected pilot bindings/);
});
for (const [name, mutate] of [
  ['database', v => { binding(v, 'ARKPEDIA_ACCOUNTS_DB').database_id = foreignVersion; }],
  ['auth origin', v => { binding(v, 'ARKPEDIA_AUTH_URL').text = 'https://www.arkpedia.net'; }],
  ['auth secret type', v => { binding(v, 'BETTER_AUTH_SECRET').type = 'plain_text'; }],
  ['provider secret type', v => { binding(v, 'GOOGLE_CLIENT_SECRET').type = 'plain_text'; }],
  ['queue namespace', v => { binding(v, 'NEXT_CACHE_DO_QUEUE').namespace_id = 'bad'; }],
  ['queue class', v => { binding(v, 'NEXT_CACHE_DO_QUEUE').class_name = 'Other'; }],
  ['ISR bucket', v => { binding(v, 'NEXT_INC_CACHE_R2_BUCKET').bucket_name = 'other'; }],
  ['self service', v => { binding(v, 'WORKER_SELF_REFERENCE').service = 'arkpedia-staging'; }],
  ['self environment', v => { binding(v, 'WORKER_SELF_REFERENCE').environment = 'preview'; }],
  ['migration tag', v => { v.resources.script_runtime.migration_tag = 'v2'; }],
  ['content channel', v => { binding(v, 'ARKPEDIA_CONTENT_CHANNEL').text = 'dev-live'; }],
  ['deployment role', v => { binding(v, 'ARKPEDIA_DEPLOYMENT_ROLE').text = 'staging'; }],
  ['foreign binding', v => { v.resources.bindings.push({ name: 'EXTRA', type: 'kv_namespace' }); }],
  ['missing provider ID', v => { v.resources.bindings = v.resources.bindings.filter(b => b.name !== 'DISCORD_CLIENT_ID'); }],
  ['duplicate binding', v => { v.resources.bindings[0] = v.resources.bindings[1]; }],
  ['unknown ownership', v => { v.annotations['workers/message'] = 'manual change'; }],
]) test(`pilot refuses changed ${name}`, () => {
  const v = version(nextVersion); mutate(v);
  assert.throws(() => assertPilotBindings(v), /Pilot provider refused:/);
});
test('public identity must match provider source, fingerprint and the exact channel transition', () => {
  assertPilotIdentity(identity(), version());
  assertPilotIdentity(identity(nextVersion), version(nextVersion));
  assert.throws(() => assertPilotIdentity(identity(), version(nextVersion)), /public identity differs/);
  assert.throws(() => assertPilotIdentity({ ...identity(), contentChannel: 'live' }, version()), /public identity differs/);
});
test('identity reader refuses dirty, invalid-role, redirect and oversized responses', async () => {
  for (const patch of [{ dirty: true }, { contentSchema: 1 }, { deploymentRole: 'staging' }, { contentChannel: 'other' }]) {
    await assert.rejects(() => readPilotIdentity(async () => new Response(JSON.stringify({ ...identity(), ...patch }))), /untrusted pilot identity/);
  }
  await assert.rejects(() => readPilotIdentity(async () => new Response('', { status: 302 })), /identity unavailable/);
  await assert.rejects(() => readPilotIdentity(async () => new Response(' '.repeat(70_000))), /oversized pilot identity/);
});

function harness({ token = true, badRoute = null, lostDeployResponse = false, sessionCache = 'no-store', savedDataCache = 'private, no-store', allowLocalRecovery = false, initialVersion = PILOT.legacyVersion } = {}) {
  let current = initialVersion;
  const versions = new Map([[PILOT.legacyVersion, version()], [nextVersion, version(nextVersion)]]);
  const commands = [];
  const run = (_executable, args, options) => {
    assert.equal(args[args.indexOf('--name') + 1], 'arkpedia');
    assert.match(args[args.indexOf('--config') + 1], /[/\\]wrangler\.jsonc$/);
    assert.equal(options.env.BETTER_AUTH_SECRET, undefined);
    assert.equal(options.env.GH_TOKEN, undefined);
    assert.equal(options.env.CLOUDFLARE_ACCOUNT_ID, '1ff51c10571eaa9934bc451e1bfdb361');
    const command = args[1]; commands.push(command);
    if (command === 'deployments') return JSON.stringify([{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      created_on: '2026-10-25T00:00:00Z', versions: [{ version_id: current, percentage: 100 }] }]);
    if (command === 'versions') return JSON.stringify(versions.get(args[3]));
    if (command === 'deploy') {
      current = nextVersion;
      versions.get(current).annotations['workers/message'] = args[args.indexOf('--message') + 1];
      if (lostDeployResponse) throw new Error('response lost after activation');
      return `Current Version ID: ${current}\n`;
    }
    if (command === 'rollback') { current = args[2]; return 'rolled back'; }
    assert.fail(`Unexpected provider mutation: ${command}`);
  };
  const request = async url => {
    assert.ok(url.startsWith(PILOT.origin + '/'));
    const path = new URL(url).pathname;
    if (path === '/build-info.json') return new Response(JSON.stringify(identity(current)));
    if (path === badRoute) return new Response('unavailable', { status: 503 });
    if (path.startsWith('/api/')) return new Response('', { status: path === '/api/auth/get-session' ? 200 : 401,
      headers: { 'cache-control': path === '/api/auth/get-session' ? sessionCache : savedDataCache } });
    return new Response('page', { headers: { 'x-robots-tag': 'noindex' } });
  };
  const provider = createPilotProvider({ run, request, allowLocalRecovery,
    environment: { ...(token ? { CLOUDFLARE_API_TOKEN: 'fixture-not-a-real-token' } : {}),
      BETTER_AUTH_SECRET: 'must-not-reach-provider', GH_TOKEN: 'must-not-reach-provider' } });
  return { provider, commands, current: () => current, replace: () => {
    current = foreignVersion; const v = version(nextVersion); v.id = foreignVersion;
    v.annotations['workers/message'] = pilotReleaseMessage({ ...owner, source: '3'.repeat(40) });
    versions.set(current, v);
  } };
}
test('fixed pilot publication checks current resources, records owner, verifies health and can recover its version', async () => {
  const h = harness();
  await h.provider.health(h.provider.observe());
  const published = h.provider.deploy(owner);
  assert.equal(published.id, nextVersion);
  assert.equal((await h.provider.health(published)).build.commit, owner.source);
  assert.deepEqual(await h.provider.recover(owner), { action: 'rolled-back', version: PILOT.legacyVersion });
  assert.equal(h.current(), PILOT.legacyVersion);
  assert.equal(h.commands.filter(c => c === 'deploy').length, 1);
  assert.equal(h.commands.filter(c => c === 'rollback').length, 1);
});
test('no explicit token means no deployment; local OAuth is read-only here', () => {
  const h = harness({ token: false });
  h.provider.observe();
  assert.throws(() => h.provider.deploy(owner), /explicit Worker-scoped/);
  assert.ok(!h.commands.includes('deploy'));
});
test('explicit local recovery permits only rollback and still refuses ordinary deployment', async () => {
  const h = harness({ token: false, allowLocalRecovery: true, initialVersion: nextVersion });
  assert.deepEqual(h.provider.owner(h.provider.observe()), owner);
  assert.throws(() => h.provider.deploy(owner), /explicit Worker-scoped/);
  assert.equal((await h.provider.recover(owner, nextVersion)).action, 'rolled-back');
  assert.ok(!h.commands.includes('deploy'));
});
test('manual recovery refuses changed version and default local OAuth cannot write', async () => {
  const h = harness({ token: false, allowLocalRecovery: true, initialVersion: nextVersion });
  await assert.rejects(() => h.provider.recover(owner, foreignVersion), /changed before manual recovery/);
  const readOnly = harness({ token: false, initialVersion: nextVersion });
  await assert.rejects(() => readOnly.provider.recover(owner, nextVersion), /explicit recovery credential/);
  assert.ok(!h.commands.includes('rollback') && !readOnly.commands.includes('rollback'));
});
test('health refuses an unconfigured or failing account backend', async () => {
  const h = harness({ badRoute: '/api/cloud-account' });
  await assert.rejects(() => h.provider.health(h.provider.observe()), /configured account route/);
});
test('health requires no-store on every account API and private on saved-data endpoints', async () => {
  const session = harness({ sessionCache: 'public, max-age=60' });
  await assert.rejects(() => session.provider.health(session.provider.observe()), /configured account route/);
  const savedData = harness({ savedDataCache: 'no-store' });
  await assert.rejects(() => savedData.provider.health(savedData.provider.observe()), /configured account route/);
});
test('a changed pilot blocks deployment and recovery does not overwrite a foreign owner', async () => {
  const h = harness(); h.replace();
  assert.throws(() => h.provider.deploy(owner), /pilot changed before upload/);
  await assert.rejects(() => h.provider.recover(owner), /another owner/);
  assert.ok(!h.commands.includes('deploy') && !h.commands.includes('rollback'));
});
test('lost upload response can recover only the exact canonical owner; unchanged upload needs no rollback', async () => {
  const h = harness({ lostDeployResponse: true });
  assert.throws(() => h.provider.deploy(owner), /response lost/);
  assert.equal((await h.provider.recover(owner)).action, 'rolled-back');
  const idle = harness();
  assert.deepEqual(await idle.provider.recover(owner), { action: 'unchanged' });
  assert.ok(!idle.commands.includes('rollback'));
});
