// The build producer is trusted main code; the app it builds is a checked PR SHA.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPOSITORY = 'arkpedia/arkpedia';
const SHA = /^[a-f0-9]{40}$/;
const positive = value => Number.isSafeInteger(value) && value > 0;
const requireValue = (value, message) => { if (!value) throw new Error(`Preview build refused: ${message}`); };
export const PRODUCER_FILES = ['.github/workflows/cloudflare-staging.yml',
  'scripts/deploy/staging-artifact.py', 'scripts/deploy/preview-request.mjs',
  'scripts/deploy/cloudflare-staging.mjs'];
const root = fileURLToPath(new URL('../../', import.meta.url));
const trustedBlob = path => execFileSync('git', ['rev-parse', `HEAD:${path}`], { cwd: root, encoding: 'utf8' }).trim();

export function validatePreviewRequest(value) {
  requireValue(value && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(['checkRun', 'controllerCommit', 'pr', 'source'])
    && positive(value.pr) && positive(value.checkRun) && SHA.test(value.source ?? '')
    && SHA.test(value.controllerCommit ?? ''), 'invalid immutable preview request');
  return value;
}

export function assertStagingRun(build, request) {
  requireValue(build?.id === request.buildRun && positive(build.id) && build.status === 'completed'
    && build.conclusion === 'success' && build.event === 'workflow_dispatch'
    && build.path === '.github/workflows/cloudflare-staging.yml'
    && build.repository?.full_name === REPOSITORY && build.head_repository?.full_name === REPOSITORY,
  'run is not a successful same-repository staging build');
  requireValue(SHA.test(request.source ?? '') && (request.controllerCommit
    ? SHA.test(request.controllerCommit) && build.head_branch === 'main' && build.head_sha === request.controllerCommit
    : build.head_sha === request.source), 'producer/source identity differs');
  return build;
}

export function assertBuildRequest(build, receipt, request) {
  assertStagingRun(build, request);
  if (!request.controllerCommit) {
    requireValue(receipt.previewRequest === undefined, 'main producer request requires explicit provenance');
    return;
  }
  const actual = validatePreviewRequest(receipt.previewRequest);
  requireValue(actual.pr === request.pr && actual.source === request.source
    && actual.checkRun === request.checkRun && actual.controllerCommit === request.controllerCommit,
  'receipt belongs to a different preview request');
}

export function verifyBuildProducer(build, { query, blobId = trustedBlob }) {
  requireValue(build?.head_branch === 'main' && SHA.test(build.head_sha ?? '')
    && build.event === 'workflow_dispatch' && build.path === '.github/workflows/cloudflare-staging.yml'
    && build.repository?.full_name === REPOSITORY && build.head_repository?.full_name === REPOSITORY,
  'producer must be the trusted main staging workflow');
  for (const path of PRODUCER_FILES) {
    const actual = query(`repos/${REPOSITORY}/contents/${path}?ref=${build.head_sha}`);
    const expected = blobId(path);
    requireValue(SHA.test(expected) && actual?.type === 'file' && actual.sha === expected,
      `producer code differs: ${path}`);
  }
  return build;
}
