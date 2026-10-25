// Only the existing isolated staging Worker is addressable by this adapter.
// Metadata records publication intent; callers must verify live identity/health
// before treating that intent as a successfully published preview.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePreviewOwner } from './preview-lifecycle.mjs';

export const STAGING = Object.freeze({
  account: '1ff51c10571eaa9934bc451e1bfdb361', worker: 'arkpedia-staging',
  origin: 'https://arkpedia-staging.cloudflare-1ff.workers.dev',
  baselineVersion: '591c4728-48b9-4058-b035-9b95cea0e9c4',
  baselineCommit: '19b51e8991775d028d9d11455d9288b80a2d9d63',
  baselineFingerprint: '4fbea44955d9dfd83976402b1cd1f55ec46cbd68e4ed8e06a274ef3e54a1c198',
  queueNamespace: 'a62f631f91804a7b8331338d63fc5b23',
});
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const PREFIX = 'arkpedia-preview-v1:';
const requireValue = (value, message) => { if (!value) throw new Error(`Staging provider refused: ${message}`); };
const config = fileURLToPath(new URL('../../wrangler.staging.jsonc', import.meta.url));
const wrangler = fileURLToPath(new URL('../../node_modules/wrangler/bin/wrangler.js', import.meta.url));

export function providerEnvironment(source = process.env) {
  const environment = {};
  for (const name of ['PATH', 'Path', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TMP', 'TEMP',
    'TMPDIR', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'XDG_CONFIG_HOME', 'CLOUDFLARE_API_TOKEN']) {
    if (source[name] !== undefined) environment[name] = source[name];
  }
  return { ...environment, CLOUDFLARE_ACCOUNT_ID: STAGING.account, CI: 'true',
    OPEN_NEXT_DEPLOY: 'true', WRANGLER_SEND_METRICS: 'false' };
}

export function latestStagingVersion(deployments) {
  requireValue(Array.isArray(deployments) && deployments.length > 0, 'missing deployment inventory');
  requireValue(deployments.every(item => UUID.test(item?.id ?? '') && Number.isFinite(Date.parse(item.created_on))),
    'invalid deployment history');
  const sorted = [...deployments].sort((a,b) => Date.parse(b.created_on) - Date.parse(a.created_on));
  requireValue(sorted.length < 2 || Date.parse(sorted[0].created_on) > Date.parse(sorted[1].created_on),
    'ambiguous current deployment');
  const versions = sorted[0].versions;
  requireValue(Array.isArray(versions) && versions.length === 1 && versions[0].percentage === 100
    && UUID.test(versions[0].version_id ?? ''), 'staging must serve exactly one known version');
  return versions[0].version_id;
}

export function assertStagingBindings(version) {
  const bindings = version?.resources?.bindings;
  requireValue(UUID.test(version?.id ?? '') && Array.isArray(bindings) && bindings.length === 6,
    'unexpected staging version/resources');
  requireValue(new Set(bindings.map(x => x.name)).size === 6, 'duplicate staging bindings');
  const binding = (name, type) => {
    const found = bindings.find(item => item.name === name);
    requireValue(found?.type === type, `missing isolated ${name} binding`);
    return found;
  };
  requireValue(binding('ARKPEDIA_CONTENT_CHANNEL', 'plain_text').text === 'live'
    && binding('ARKPEDIA_DEPLOYMENT_ROLE', 'plain_text').text === 'staging', 'unexpected content/indexing role');
  binding('ASSETS', 'assets');
  const queue = binding('NEXT_CACHE_DO_QUEUE', 'durable_object_namespace');
  requireValue(queue.namespace_id === STAGING.queueNamespace && queue.class_name === 'DOQueueHandler', 'queue escaped staging');
  requireValue(binding('NEXT_INC_CACHE_R2_BUCKET', 'r2_bucket').bucket_name === 'arkpedia-staging-cache', 'cache escaped staging');
  const self = binding('WORKER_SELF_REFERENCE', 'service');
  requireValue(self.service === STAGING.worker && self.environment === 'production', 'self-reference escaped staging');
  requireValue(version.resources.script_runtime?.migration_tag === 'v1', 'unexpected Durable Object migration');
  return version;
}

export function previewAnnotations(plan, checkRun) {
  requireValue(Number.isSafeInteger(checkRun) && checkRun > 0, 'missing Check provenance');
  // Validation also prevents an arbitrary baseline/resource name entering metadata.
  validatePreviewOwner({ ...plan, version: 'ffffffff-ffff-4fff-8fff-ffffffffffff' });
  requireValue(UUID.test(plan.expectedVersion ?? '') && plan.baselineVersion === STAGING.baselineVersion,
    'unreviewed baseline version');
  const message = PREFIX + JSON.stringify({ ...plan, checkRun });
  requireValue(Buffer.byteLength(message, 'utf8') <= 1000, 'ownership metadata exceeds provider limit');
  return { tag: `arkpedia-preview-pr-${plan.pr}`, message };
}

export function previewIntent(version) {
  assertStagingBindings(version);
  if (version.id === STAGING.baselineVersion) return null;
  const message = version.annotations?.['workers/message'];
  requireValue(typeof message === 'string' && message.startsWith(PREFIX)
    && Buffer.byteLength(message, 'utf8') <= 1000, 'unrecorded manual staging version');
  const plan = JSON.parse(message.slice(PREFIX.length));
  requireValue(version.annotations?.['workers/tag'] === `arkpedia-preview-pr-${plan.pr}`,
    'version tag differs from ownership metadata');
  const expected = previewAnnotations(plan, plan.checkRun);
  requireValue(expected.message === message, 'noncanonical ownership metadata');
  requireValue(version.id !== plan.expectedVersion, 'publication did not change version');
  const owner = { ...plan };
  delete owner.expectedVersion;
  delete owner.checkRun;
  validatePreviewOwner({ ...owner, version: version.id });
  return { ...plan, version: version.id };
}

export function matchesStagingBuild(info, owner = null) {
  return info?.version === 1 && info.dirty === false && info.contentSchema === (owner?.contentSchema ?? 2)
    && info.contentChannel === 'live' && info.deploymentRole === 'staging'
    && info.commit === (owner?.source ?? STAGING.baselineCommit)
    && info.codeFingerprint === (owner?.codeFingerprint ?? STAGING.baselineFingerprint);
}

export function createStagingProvider({ run = execFileSync, request = fetch } = {}) {
  const invoke = (args, { json = false, artifactDirectory, timeout = 120_000 } = {}) => {
    const output = run(process.execPath, [wrangler, ...args, '--name', STAGING.worker,
      '--config', artifactDirectory ? `${artifactDirectory}/wrangler.staging.jsonc` : config, ...(json ? ['--json'] : [])],
    { encoding: 'utf8', env: providerEnvironment(), timeout, maxBuffer: 16_000_000,
      ...(artifactDirectory ? { cwd: artifactDirectory } : {}) });
    return json ? JSON.parse(output) : output;
  };
  const observe = () => {
    const id = latestStagingVersion(invoke(['deployments', 'list'], { json: true }));
    const version = invoke(['versions', 'view', id], { json: true });
    requireValue(version.id === id, 'provider returned another version');
    return { version: assertStagingBindings(version), intent: previewIntent(version) };
  };
  const health = async (owner = null) => {
    const buildResponse = await request(`${STAGING.origin}/build-info.json`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30_000) });
    requireValue(buildResponse.status === 200, 'public build identity unavailable');
    requireValue(buildResponse.body, 'missing public build identity body');
    const reader = buildResponse.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        requireValue(bytes <= 65_536, 'oversized public build identity');
        chunks.push(chunk.value);
      }
    } finally { await reader.cancel(); }
    const publicBuild = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requireValue(matchesStagingBuild(publicBuild, owner), 'public build differs from provider ownership');
    for (const path of ['/', '/story', '/schedule', '/base']) {
      const response = await request(`${STAGING.origin}${path}`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30_000) });
      await response.body?.cancel();
      requireValue(response.status === 200 && /\bnoindex\b/i.test(response.headers.get('x-robots-tag') ?? ''),
        `unhealthy or indexable staging route ${path}`);
    }
    return { healthy: true, publicBuild };
  };
  const rollback = expectedVersion => {
    requireValue(UUID.test(expectedVersion ?? ''), 'missing rollback owner');
    requireValue(observe().version.id === expectedVersion, 'staging changed before rollback');
    invoke(['rollback', STAGING.baselineVersion, '--yes', '--message', 'Retire owned Arkpedia feature preview']);
    requireValue(observe().version.id === STAGING.baselineVersion, 'baseline rollback did not take effect');
  };
  const deploy = (plan, checkRun, artifactDirectory) => {
    requireValue(typeof artifactDirectory === 'string' && artifactDirectory.length > 0, 'missing verified extraction');
    requireValue(observe().version.id === plan.expectedVersion, 'staging changed before upload');
    const annotation = previewAnnotations(plan, checkRun);
    // The caller has already verified/extracted the archive and fixed configuration.
    // OPEN_NEXT_DEPLOY bypasses OpenNext CLI/cache population; use trusted Wrangler.
    const output = invoke(['deploy', '--tag', annotation.tag, '--message', annotation.message], { artifactDirectory, timeout: 300_000 });
    const ids = [...output.matchAll(/^Current Version ID: ([a-f0-9-]+)\s*$/gm)].map(match => match[1]);
    requireValue(ids.length === 1 && UUID.test(ids[0]), 'deploy returned no unique provider version');
    const actual = observe();
    requireValue(actual.version.id === ids[0] && actual.version.annotations?.['workers/message'] === annotation.message,
      'deployed version/ownership differs');
    return actual;
  };
  return { observe, health, rollback, deploy };
}
