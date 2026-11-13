import test from 'node:test';
import assert from 'node:assert/strict';
import { PILOT, MEDIA_SECRET_UPDATE, PATREON_SECRET_UPDATE, PRE_CUTOVER_VERSION, assertPilotBindings, assertPilotIdentity, pilotReleaseMessage, readPilotIdentity,
  createPilotProvider } from '../deploy/pilot-release-provider.mjs';

const nextVersion = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const foreignVersion = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const owner = { source: '1'.repeat(40), fingerprint: '2'.repeat(64), checkRun: 123, previousVersion: PILOT.legacyVersion };
function version(id = PILOT.legacyVersion) {
  return { id, annotations: id === PILOT.legacyVersion ? {} : { 'workers/message': pilotReleaseMessage(owner) },
    resources: { script_runtime: { migration_tag: 'v1' }, bindings: [
      { name: 'ARKPEDIA_ACCOUNTS_DB', type: 'd1', database_id: PILOT.database },
      { name: 'ARKPEDIA_AUTH_URL', type: 'plain_text', text: id === PILOT.legacyVersion ? PILOT.legacyAuthOrigin : PILOT.origin },
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
function enableAccounts(v) {
  v.resources.bindings.push(
    { name: 'ARKPEDIA_ACCOUNTS_ENABLED', type: 'plain_text', text: '1' },
    { name: 'ACCOUNT_TRAFFIC_LIMIT', type: 'ratelimit', namespace_id: '2026110201', simple: { limit: 6000, period: 60 } },
    { name: 'ACCOUNT_IP_LIMIT', type: 'ratelimit', namespace_id: '2026110202', simple: { limit: 300, period: 60 } },
  );
  return v;
}
function identity(id = PILOT.legacyVersion) {
  return { version: 1, commit: id === PILOT.legacyVersion ? PILOT.legacySource : owner.source,
    codeFingerprint: id === PILOT.legacyVersion ? PILOT.legacyFingerprint : owner.fingerprint,
    dirty: false, contentSchema: 2, contentChannel: id === PILOT.legacyVersion ? 'dev-live' : 'live', deploymentRole: 'production' };
}
const binding = (v, name) => v.resources.bindings.find(b => b.name === name);

test('Patreon setup accepts only the complete secret set and exact authorized dashboard version', () => {
  const v = enableAccounts(version(nextVersion));
  const names = ['PATREON_CAMPAIGN_ID', 'PATREON_CLIENT_ID', 'PATREON_CLIENT_SECRET', 'PATREON_CREATOR_ACCESS_TOKEN', 'PATREON_CREATOR_REFRESH_TOKEN'];
  v.resources.bindings.push(...names.map(name => ({ name, type: 'secret_text' })));
  assert.equal(assertPilotBindings(v), v);
  const partial = structuredClone(v); partial.resources.bindings.pop();
  assert.throws(() => assertPilotBindings(partial), /unexpected pilot bindings/);
  const exposed = structuredClone(v); binding(exposed, 'PATREON_CLIENT_SECRET').type = 'plain_text';
  assert.throws(() => assertPilotBindings(exposed), /PATREON_CLIENT_SECRET/);
  v.id = PATREON_SECRET_UPDATE.version;
  v.resources.script = { etag: PATREON_SECRET_UPDATE.etag };
  v.annotations = { 'workers/triggered_by': 'version_upload', 'workers/message': 'Updated secret: PATREON_CREATOR_REFRESH_TOKEN' };
  assert.equal(assertPilotBindings(v), v);
  assertPilotIdentity({ ...identity(nextVersion), commit: PATREON_SECRET_UPDATE.source, codeFingerprint: PATREON_SECRET_UPDATE.fingerprint }, v);
  for (const mutate of [x => { x.resources.script.etag = 'changed'; }, x => { x.annotations['workers/message'] = 'manual change'; }, x => { x.id = foreignVersion; }]) {
    const invalid = structuredClone(v); mutate(invalid);
    assert.throws(() => assertPilotBindings(invalid), /code\/provenance changed|unrecognized pilot release owner/);
  }
});

test('only the exact observed pre-cutover version retains the pilot auth origin', () => {
  const previous = version(PRE_CUTOVER_VERSION);
  binding(previous, 'ARKPEDIA_AUTH_URL').text = PILOT.legacyAuthOrigin;
  assert.equal(assertPilotBindings(previous), previous);
  previous.id = foreignVersion;
  assert.throws(() => assertPilotBindings(previous), /auth origin changed/);
});

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
  binding(v, 'ARKPEDIA_AUTH_URL').text = PILOT.legacyAuthOrigin;
  assert.equal(assertPilotBindings(v), v);
  assertPilotIdentity({ ...identity(nextVersion), commit: MEDIA_SECRET_UPDATE.source, codeFingerprint: MEDIA_SECRET_UPDATE.fingerprint }, v);
  const changedCode = structuredClone(v); changedCode.resources.script.etag = 'unreviewed';
  assert.throws(() => assertPilotBindings(changedCode), /code\/provenance changed/);
  const unknown = structuredClone(v); unknown.id = foreignVersion;
  binding(unknown, 'ARKPEDIA_AUTH_URL').text = 'https://www.arkpedia.net';
  assert.throws(() => assertPilotBindings(unknown), /unrecognized pilot release owner/);
  const exposedSecret = structuredClone(v); binding(exposedSecret, 'YOUTUBE_API_KEY').type = 'plain_text';
  assert.throws(() => assertPilotBindings(exposedSecret), /YOUTUBE_API_KEY/);
  const missingMedia = structuredClone(v); missingMedia.resources.bindings = missingMedia.resources.bindings.filter(b => b.name !== 'TWITCH_CLIENT_ID');
  assert.throws(() => assertPilotBindings(missingMedia), /unexpected pilot bindings/);
});
for (const [name, mutate] of [
  ['database', v => { binding(v, 'ARKPEDIA_ACCOUNTS_DB').database_id = foreignVersion; }],
  ['auth origin', v => { binding(v, 'ARKPEDIA_AUTH_URL').text = 'https://untrusted.example'; }],
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

function harness({ token = true, staleAfterDeploy = 0, foreignAfterDeploy = false, badRoute = null, lostDeployResponse = false, sessionCache = 'private, no-store', savedDataCache = 'private, no-store', allowLocalRecovery = false, initialVersion = PILOT.legacyVersion, accounts = false, providers = ['google', 'discord'] } = {}) {
  let current = initialVersion;
  let staleReads = 0;
  const waits = [];
  const versions = new Map([[PILOT.legacyVersion, version()], [nextVersion, version(nextVersion)]]);
  if (accounts) enableAccounts(versions.get(nextVersion));
  const commands = [];
  const run = (_executable, args, options) => {
    assert.equal(args[args.indexOf('--name') + 1], 'arkpedia');
    assert.match(args[args.indexOf('--config') + 1], /[/\\]wrangler\.jsonc$/);
    assert.equal(options.env.BETTER_AUTH_SECRET, undefined);
    assert.equal(options.env.GH_TOKEN, undefined);
    assert.equal(options.env.CLOUDFLARE_ACCOUNT_ID, '1ff51c10571eaa9934bc451e1bfdb361');
    const command = args[1]; commands.push(command);
    if (command === 'deployments') {
      let observed = current;
      if (staleReads > 0) { observed = initialVersion; staleReads--; }
      return JSON.stringify([{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        created_on: '2026-10-25T00:00:00Z', versions: [{ version_id: observed, percentage: 100 }] }]);
    }
    if (command === 'versions') return JSON.stringify(versions.get(args[3]));
    if (command === 'deploy') {
      current = nextVersion;
      versions.get(current).annotations['workers/message'] = args[args.indexOf('--message') + 1];
      if (lostDeployResponse) throw new Error('response lost after activation');
      staleReads = staleAfterDeploy;
      if (foreignAfterDeploy) {
        const foreign = version(foreignVersion);
        foreign.annotations['workers/message'] = pilotReleaseMessage({ ...owner, source: '3'.repeat(40) });
        versions.set(foreignVersion, foreign); current = foreignVersion;
      }
      return `Current Version ID: ${nextVersion}\n`;
    }
    if (command === 'rollback') { current = args[2]; return 'rolled back'; }
    assert.fail(`Unexpected provider mutation: ${command}`);
  };
  const request = async url => {
    assert.ok(url.startsWith(PILOT.origin + '/'));
    const path = new URL(url).pathname;
    if (path === '/build-info.json') return new Response(JSON.stringify(identity(current)));
    if (path === badRoute) return new Response('unavailable', { status: 503 });
    if (accounts && current === nextVersion && path.startsWith('/api/')) {
      const session = path === '/api/auth/get-session';
      const publicCommunity = ['/api/community/supports', '/api/community/stats'].includes(path);
      return Response.json(session ? null : { error: 'Sign in', providers }, { status: session || publicCommunity ? 200 : 401,
        headers: { 'cache-control': session ? sessionCache : savedDataCache } });
    }
    if (path.startsWith('/api/')) return Response.json({ error: 'Arkpedia accounts are available on Preview only.' }, { status: 503,
      headers: { 'cache-control': path === '/api/auth/get-session' ? sessionCache : savedDataCache } });
    return new Response('page');
  };
  const provider = createPilotProvider({ run, request, allowLocalRecovery, sleep: async ms => { waits.push(ms); },
    environment: { ...(token ? { CLOUDFLARE_API_TOKEN: 'fixture-not-a-real-token' } : {}),
      BETTER_AUTH_SECRET: 'must-not-reach-provider', GH_TOKEN: 'must-not-reach-provider' } });
  return { provider, commands, waits, current: () => current, replace: () => {
    current = foreignVersion; const v = version(nextVersion); v.id = foreignVersion;
    v.annotations['workers/message'] = pilotReleaseMessage({ ...owner, source: '3'.repeat(40) });
    versions.set(current, v);
  } };
}
test('fixed pilot publication checks current resources, records owner, verifies health and can recover its version', async () => {
  const h = harness();
  await h.provider.health(h.provider.observe());
  const published = await h.provider.deploy(owner);
  assert.equal(published.id, nextVersion);
  assert.equal((await h.provider.health(published)).build.commit, owner.source);
  assert.deepEqual(await h.provider.recover(owner), { action: 'rolled-back', version: PILOT.legacyVersion });
  assert.equal(h.current(), PILOT.legacyVersion);
  assert.equal(h.commands.filter(c => c === 'deploy').length, 1);
  assert.equal(h.commands.filter(c => c === 'rollback').length, 1);
});
test('no explicit token means no deployment; local OAuth is read-only here', async () => {
  const h = harness({ token: false });
  h.provider.observe();
  await assert.rejects(() => h.provider.deploy(owner), /explicit Worker-scoped/);
  assert.ok(!h.commands.includes('deploy'));
});
test('explicit local recovery permits only rollback and still refuses ordinary deployment', async () => {
  const h = harness({ token: false, allowLocalRecovery: true, initialVersion: nextVersion });
  assert.deepEqual(h.provider.owner(h.provider.observe()), owner);
  await assert.rejects(() => h.provider.deploy(owner), /explicit Worker-scoped/);
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
test('health refuses an unexpected account response on the live hostname', async () => {
  const h = harness({ badRoute: '/api/cloud-account' });
  await assert.rejects(() => h.provider.health(h.provider.observe()), /live account route/);
});
test('health requires no-store on every account API and private on saved-data endpoints', async () => {
  const session = harness({ sessionCache: 'public, max-age=60' });
  await assert.rejects(() => session.provider.health(session.provider.observe()), /live account route/);
  const savedData = harness({ savedDataCache: 'no-store' });
  await assert.rejects(() => savedData.provider.health(savedData.provider.observe()), /live account route/);
});
test('a changed pilot blocks deployment and recovery does not overwrite a foreign owner', async () => {
  const h = harness(); h.replace();
  await assert.rejects(() => h.provider.deploy(owner), /pilot changed before upload/);
  await assert.rejects(() => h.provider.recover(owner), /another owner/);
  assert.ok(!h.commands.includes('deploy') && !h.commands.includes('rollback'));
});
test('lost upload response can recover only the exact canonical owner; unchanged upload needs no rollback', async () => {
  const h = harness({ lostDeployResponse: true });
  await assert.rejects(() => h.provider.deploy(owner), /response lost/);
  assert.equal((await h.provider.recover(owner)).action, 'rolled-back');
  const idle = harness();
  assert.deepEqual(await idle.provider.recover(owner), { action: 'unchanged' });
  assert.ok(!idle.commands.includes('rollback'));
});

test('enabled production accounts require their exact limits and reject partial enablement', () => {
  const v = enableAccounts(version(nextVersion));
  assert.equal(assertPilotBindings(v), v);
  for (const mutate of [
    x => { binding(x, 'ACCOUNT_IP_LIMIT').namespace_id = '2026110102'; },
    x => { binding(x, 'ACCOUNT_TRAFFIC_LIMIT').simple.limit = 999999; },
    x => { binding(x, 'ARKPEDIA_ACCOUNTS_ENABLED').text = '0'; },
    x => { x.resources.bindings = x.resources.bindings.filter(b => b.name !== 'ACCOUNT_IP_LIMIT'); },
  ]) { const bad = structuredClone(v); mutate(bad); assert.throws(() => assertPilotBindings(bad)); }
});
test('account release verifies anonymous auth, private saves, public community and rollback to disabled accounts', async () => {
  const h = harness({ accounts: true });
  await h.provider.health(h.provider.observe());
  const published = await h.provider.deploy(owner);
  await h.provider.health(published);
  assert.equal((await h.provider.recover(owner)).action, 'rolled-back');
  for (const options of [{ providers: ['google'] }, { badRoute: '/api/community/supports' }, { savedDataCache: 'public, max-age=60' }]) {
    const bad = harness({ accounts: true, initialVersion: nextVersion, ...options });
    await assert.rejects(() => bad.provider.health(bad.provider.observe()));
  }
});


test('activation accepts delayed control-plane propagation only from the exact previous version', async () => {
  const h = harness({ staleAfterDeploy: 2 });
  const published = await h.provider.deploy(owner);
  assert.equal(published.id, nextVersion);
  assert.deepEqual(h.waits, [5000, 5000]);
  assert.equal(h.commands.filter(c => c === 'deploy').length, 1);
  assert.equal(h.commands.filter(c => c === 'rollback').length, 0);
});

test('a control plane that never shows activation fails after a bounded wait without another upload', async () => {
  const h = harness({ staleAfterDeploy: 100 });
  await assert.rejects(() => h.provider.deploy(owner), /deployed pilot version\/owner differs/);
  assert.equal(h.waits.length, 6);
  assert.equal(h.commands.filter(c => c === 'deploy').length, 1);
});

test('a foreign activation is refused immediately instead of being retried as propagation', async () => {
  const h = harness({ foreignAfterDeploy: true });
  await assert.rejects(() => h.provider.deploy(owner), /deployed pilot version\/owner differs/);
  assert.equal(h.waits.length, 0);
  assert.equal(h.commands.filter(c => c === 'deploy').length, 1);
  await assert.rejects(() => h.provider.recover(owner), /another owner/);
  assert.equal(h.commands.filter(c => c === 'rollback').length, 0);
});
