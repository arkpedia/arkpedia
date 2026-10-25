// Fixed-target adapter for the existing migration pilot. No DNS, D1 SQL,
// secret writes, resource creation, edge/relay or content-pointer operations.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { latestStagingVersion, providerEnvironment } from './preview-provider.mjs';

export const PILOT = Object.freeze({
  worker: 'arkpedia', origin: 'https://arkpedia-cf.mocchibird.com',
  database: 'f7daff77-8e8f-4ec2-998b-97fb6e4b948f', queue: 'e4eebd64c01f4b36be846adc609deeed',
  legacyVersion: '066ea33d-f48e-4fd3-b4dd-278957420bb4',
  legacySource: 'de829d1eac0e1dc0efc17866e680b447650434df',
  legacyFingerprint: '9706f8b5408400b7a956445c70129773f73aeabe9fd9f8ba3049452100df5f2a',
});
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const PREFIX = 'arkpedia-main-release-v1:';
const requireValue = (value, message) => { if (!value) throw new Error(`Pilot provider refused: ${message}`); };
const config = fileURLToPath(new URL('../../wrangler.jsonc', import.meta.url));
const wrangler = fileURLToPath(new URL('../../node_modules/wrangler/bin/wrangler.js', import.meta.url));

export function pilotReleaseMessage(owner) {
  requireValue(SHA.test(owner?.source ?? '') && HASH.test(owner?.fingerprint ?? '')
    && Number.isSafeInteger(owner?.checkRun) && owner.checkRun > 0 && UUID.test(owner?.previousVersion ?? ''),
  'invalid release ownership');
  return PREFIX + JSON.stringify({ source: owner.source, fingerprint: owner.fingerprint,
    checkRun: owner.checkRun, previousVersion: owner.previousVersion });
}

export function assertPilotBindings(version) {
  requireValue(UUID.test(version?.id ?? '') && Array.isArray(version?.resources?.bindings), 'invalid version metadata');
  const bindings = version.resources.bindings;
  const legacy = version.id === PILOT.legacyVersion;
  const names = ['ARKPEDIA_ACCOUNTS_DB', 'ARKPEDIA_AUTH_URL', 'ASSETS', 'BETTER_AUTH_SECRET',
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET',
    'NEXT_CACHE_DO_QUEUE', 'NEXT_INC_CACHE_R2_BUCKET', 'WORKER_SELF_REFERENCE',
    ...(legacy ? [] : ['ARKPEDIA_CONTENT_CHANNEL', 'ARKPEDIA_DEPLOYMENT_ROLE'])];
  requireValue(bindings.length === names.length && new Set(bindings.map(b => b.name)).size === names.length
    && bindings.every(b => names.includes(b.name)), 'unexpected pilot bindings');
  const binding = (name, type) => {
    const found = bindings.find(b => b.name === name);
    requireValue(found?.type === type, `missing preserved ${name} binding`);
    return found;
  };
  requireValue(binding('ARKPEDIA_ACCOUNTS_DB', 'd1').database_id === PILOT.database, 'account database changed');
  requireValue(binding('ARKPEDIA_AUTH_URL', 'plain_text').text === PILOT.origin, 'auth origin changed');
  for (const name of ['BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET']) {
    binding(name, 'secret_text');
  }
  binding('ASSETS', 'assets');
  const queue = binding('NEXT_CACHE_DO_QUEUE', 'durable_object_namespace');
  requireValue(queue.namespace_id === PILOT.queue && queue.class_name === 'DOQueueHandler', 'queue changed');
  requireValue(binding('NEXT_INC_CACHE_R2_BUCKET', 'r2_bucket').bucket_name === 'arkpedia-opennext-cache', 'ISR cache changed');
  const self = binding('WORKER_SELF_REFERENCE', 'service');
  requireValue(self.service === PILOT.worker && self.environment === 'production', 'self-reference changed');
  requireValue(version.resources.script_runtime?.migration_tag === 'v1', 'queue migration history changed');
  if (!legacy) {
    requireValue(binding('ARKPEDIA_CONTENT_CHANNEL', 'plain_text').text === 'live'
      && binding('ARKPEDIA_DEPLOYMENT_ROLE', 'plain_text').text === 'production', 'main content/role changed');
    const message = version.annotations?.['workers/message'];
    requireValue(typeof message === 'string' && message.startsWith(PREFIX), 'unrecognized pilot release owner');
    const owner = JSON.parse(message.slice(PREFIX.length));
    requireValue(pilotReleaseMessage(owner) === message, 'noncanonical pilot release owner');
  }
  return version;
}

export async function readPilotIdentity(request = fetch) {
  const response = await request(`${PILOT.origin}/build-info.json`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30_000) });
  requireValue(response.status === 200 && response.body, 'pilot identity unavailable');
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      requireValue(bytes <= 65_536, 'oversized pilot identity');
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel(); }
  const build = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  requireValue(build.version === 1 && SHA.test(build.commit ?? '') && HASH.test(build.codeFingerprint ?? '')
    && build.dirty === false && build.contentSchema === 2 && build.deploymentRole === 'production'
    && ['live', 'dev-live'].includes(build.contentChannel), 'untrusted pilot identity');
  return build;
}

export function assertPilotIdentity(build, version) {
  const legacy = version.id === PILOT.legacyVersion;
  const owner = legacy ? { source: PILOT.legacySource, fingerprint: PILOT.legacyFingerprint }
    : JSON.parse(version.annotations['workers/message'].slice(PREFIX.length));
  requireValue(build.commit === owner.source && build.codeFingerprint === owner.fingerprint
    && build.contentChannel === (legacy ? 'dev-live' : 'live'), 'public identity differs from provider owner');
  return build;
}

export function createPilotProvider({ run = execFileSync, request = fetch, environment = process.env } = {}) {
  const invoke = (args, { json = false, timeout = 120_000 } = {}) => {
    const output = run(process.execPath, [wrangler, ...args, '--name', PILOT.worker, '--config', config,
      ...(json ? ['--json'] : [])], { encoding: 'utf8', env: providerEnvironment(environment), timeout, maxBuffer: 16_000_000 });
    return json ? JSON.parse(output) : output;
  };
  const rawObserve = () => {
    const id = latestStagingVersion(invoke(['deployments', 'list'], { json: true }));
    const version = invoke(['versions', 'view', id], { json: true });
    requireValue(version.id === id, 'provider returned another pilot version');
    return version;
  };
  const observe = () => assertPilotBindings(rawObserve());
  const identity = version => readPilotIdentity(request).then(build => assertPilotIdentity(build, version));
  const health = async version => {
    assertPilotBindings(version);
    const build = await identity(version);
    for (const path of ['/', '/story', '/schedule', '/operators/Amiya', '/base']) {
      const response = await request(`${PILOT.origin}${path}`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30_000) });
      await response.body?.cancel();
      requireValue(response.status === 200 && /\bnoindex\b/i.test(response.headers.get('x-robots-tag') ?? ''), `unhealthy or indexable pilot route ${path}`);
    }
    for (const [path, status] of [['/api/auth/get-session', 200], ['/api/cloud-account', 401], ['/api/account-profile', 401]]) {
      const response = await request(`${PILOT.origin}${path}`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30_000) });
      await response.body?.cancel();
      const cache = response.headers.get('cache-control') ?? '';
      // Better Auth owns its response and uses no-store. Arkpedia's saved-data
      // endpoints additionally declare private; keep their stronger contract.
      requireValue(response.status === status && /\bno-store\b/i.test(cache)
        && (path === '/api/auth/get-session' || /\bprivate\b/i.test(cache)), `unhealthy or cacheable configured account route ${path}`);
    }
    return { healthy: true, build };
  };
  const deploy = owner => {
    const message = pilotReleaseMessage(owner);
    requireValue(environment.CLOUDFLARE_API_TOKEN, 'explicit Worker-scoped deployment credential required');
    requireValue(observe().id === owner.previousVersion, 'pilot changed before upload');
    const output = invoke(['deploy', '--tag', `main-${owner.source.slice(0, 12)}`, '--message', message], { timeout: 300_000 });
    const ids = [...output.matchAll(/^Current Version ID: ([a-f0-9-]+)\s*$/gm)].map(match => match[1]);
    requireValue(ids.length === 1 && UUID.test(ids[0]), 'deploy returned no unique provider version');
    const actual = observe();
    requireValue(actual.id === ids[0] && actual.annotations?.['workers/message'] === message, 'deployed pilot version/owner differs');
    return actual;
  };
  // Recover even when upload succeeded but the deploy response was lost. Read raw
  // identity first: never roll back somebody else's change or guess its version.
  const recover = async owner => {
    const message = pilotReleaseMessage(owner);
    const current = rawObserve();
    if (current.id === owner.previousVersion) return { action: 'unchanged' };
    requireValue(environment.CLOUDFLARE_API_TOKEN, 'explicit recovery credential required');
    requireValue(current.annotations?.['workers/message'] === message, 'pilot changed; automatic recovery would overwrite another owner');
    invoke(['rollback', owner.previousVersion, '--yes', '--message', 'Restore previous Arkpedia pilot after failed owned release']);
    const restored = observe();
    requireValue(restored.id === owner.previousVersion, 'previous pilot version was not restored');
    await health(restored);
    return { action: 'rolled-back', version: restored.id };
  };
  return { observe, identity, health, deploy, recover };
}
