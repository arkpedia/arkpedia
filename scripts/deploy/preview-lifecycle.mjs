// Trusted-controller policy for the single existing staging slot. No provider I/O,
// artifact execution, credential access or deployment is performed by this module.
// Callers must fetch fresh API observations inside one non-cancelling workflow lock.
const REPOSITORY = 'arkpedia/arkpedia';
const WORKER = 'arkpedia-staging';
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const id = value => Number.isSafeInteger(value) && value > 0;
const matches = (pattern, value) => typeof value === 'string' && pattern.test(value);
const requireValue = (value, message) => { if (!value) throw new Error(`Preview refused: ${message}`); };

function validatePullRequest(pr, number) {
  requireValue(id(number) && pr?.number === number, 'pull request differs');
  requireValue(pr.base?.repo?.full_name === REPOSITORY && pr.head?.repo?.full_name === REPOSITORY,
    'only same-repository previews are supported');
  requireValue(pr.base.ref === 'main', 'pull request must target main');
  requireValue(matches(SHA, pr.head.sha), 'missing full source identity');
}

/** These inputs are observations, not an authorization token. The controller must
 * additionally use the existing exact-tree Check proof verifier before deploying;
 * a receipt and green build alone never constitute Check approval.
 */
export function planPreviewUpdate({ request, pr, build, artifact, receipt, sourceTree, liveVersion, owner }) {
  requireValue(request?.repository === REPOSITORY && id(request.pr) && matches(SHA, request.source),
    'invalid explicit preview request');
  validatePullRequest(pr, request.pr);
  requireValue(pr.state === 'open' && pr.draft === false && pr.head.sha === request.source,
    'pull request is closed, draft or has moved');
  requireValue(matches(SHA, sourceTree), 'missing source tree');
  requireValue(build?.id === request.buildRun && id(build.id) && build.status === 'completed'
    && build.conclusion === 'success' && build.event === 'workflow_dispatch'
    && build.path === '.github/workflows/cloudflare-staging.yml'
    && build.repository?.full_name === REPOSITORY && build.head_repository?.full_name === REPOSITORY
    && build.head_sha === request.source, 'build run provenance differs');
  requireValue(artifact?.id === request.artifact && id(artifact.id) && artifact.expired === false
    && artifact.workflow_run?.id === build.id && artifact.name === `arkpedia-staging-${request.source}`,
    'artifact is missing, expired or from another run');
  requireValue(receipt?.format === 1 && receipt.repository === REPOSITORY
    && receipt.workflow === 'cloudflare-staging.yml' && receipt.runId === String(build.id)
    && matches(HASH, receipt.sha256) && matches(HASH, receipt.configSha256), 'receipt provenance differs');
  const info = receipt.build;
  requireValue(info?.version === 1 && info.commit === request.source && info.dirty === false
    && info.deploymentRole === 'staging' && info.contentChannel === 'live'
    && Number.isSafeInteger(info.contentSchema) && info.contentSchema > 0
    && matches(HASH, info.codeFingerprint), 'artifact build identity differs');
  requireValue(matches(UUID, liveVersion), 'missing current provider version');
  if (owner !== null) {
    validatePreviewOwner(owner);
    requireValue(owner.version === liveVersion, 'provider changed outside the recorded preview owner');
  }
  // Preserve the original non-preview baseline across A -> B and repeated updates.
  // Rolling B back to A would resurrect a closed PR and leave an obsolete owner.
  const baselineVersion = owner === null ? liveVersion : owner.baselineVersion;
  return {
    format: 1, repository: REPOSITORY, worker: WORKER, pr: request.pr,
    source: request.source, sourceTree, buildRun: build.id, artifact: artifact.id,
    archiveSha256: receipt.sha256, configSha256: receipt.configSha256,
    codeFingerprint: info.codeFingerprint, contentSchema: info.contentSchema,
    expectedVersion: liveVersion, baselineVersion,
  };
}

export function validatePreviewOwner(owner) {
  requireValue(owner?.format === 1 && owner.repository === REPOSITORY && owner.worker === WORKER
    && id(owner.pr) && matches(SHA, owner.source) && matches(SHA, owner.sourceTree)
    && id(owner.buildRun) && id(owner.artifact) && matches(HASH, owner.archiveSha256)
    && matches(HASH, owner.configSha256) && matches(HASH, owner.codeFingerprint)
    && Number.isSafeInteger(owner.contentSchema) && owner.contentSchema > 0
    && matches(UUID, owner.version) && matches(UUID, owner.baselineVersion)
    && owner.version !== owner.baselineVersion, 'invalid staging ownership record');
  return owner;
}

/** Commit ownership only after actual provider identity/health validation. The
 * adapter must persist this record before reporting publication successful.
 */
export function recordPreviewOwner(plan, { version, publicBuild, healthy }) {
  requireValue(plan?.format === 1 && plan.repository === REPOSITORY && plan.worker === WORKER,
    'invalid publication plan');
  requireValue(version !== plan.expectedVersion, 'provider did not produce a new preview version');
  requireValue(healthy === true && publicBuild?.version === 1 && publicBuild.commit === plan.source
    && publicBuild.dirty === false && publicBuild.contentChannel === 'live'
    && publicBuild.deploymentRole === 'staging' && publicBuild.contentSchema === plan.contentSchema
    && publicBuild.codeFingerprint === plan.codeFingerprint, 'deployed health or public identity differs');
  const record = { ...plan, version };
  delete record.expectedVersion;
  return validatePreviewOwner(record);
}

/** Re-evaluate under the same shared lock immediately before provider mutation.
 * This also detects a PR push or an uncoordinated manual staging deployment.
 */
export function recheckPreviewUpdate(plan, { pr, liveVersion }) {
  validatePullRequest(pr, plan.pr);
  requireValue(pr.state === 'open' && pr.draft === false && pr.head.sha === plan.source,
    'pull request moved while publication was queued');
  requireValue(liveVersion === plan.expectedVersion, 'staging changed while publication was queued');
  return plan;
}

/** A stale close event is harmless. Never delete the Worker, cache, DO namespace
 * or data objects. Retirement is exact-version rollback to the recorded baseline.
 * Read pr from the API, not just the webhook payload.
 */
export function planPreviewRetirement({ number, pr, owner, liveVersion, explicitlyRequested = false }) {
  requireValue(id(number), 'invalid pull request number');
  if (owner === null) return { action: 'none', reason: 'no recorded preview' };
  validatePreviewOwner(owner);
  if (owner.pr !== number) return { action: 'none', reason: 'another pull request owns staging' };
  validatePullRequest(pr, number);
  requireValue(pr.state === 'closed' || explicitlyRequested === true && pr.state === 'open', 'pull request is still open');
  requireValue(liveVersion === owner.version, 'provider version no longer belongs to this preview');
  return {
    action: 'rollback', worker: WORKER, pr: number, source: owner.source,
    expectedVersion: owner.version, targetVersion: owner.baselineVersion,
  };
}
