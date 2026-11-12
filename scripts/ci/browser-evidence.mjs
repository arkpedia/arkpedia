// Coverage contracts are checked independently of GitHub provenance/ancestry.
// A valid record alone does not authorize artifact reuse.
import { createHash } from 'node:crypto';

export const BROWSER_POLICY = 'arkpedia-browser-v1';
export const ARTIFACT_PREFIX = 'checked-tree-';
export const POLICY_ARTIFACT_PREFIX = 'checked-policy-tree-';
export const POLICY_FILES = [
  '.github/workflows/check.yml', '.github/workflows/browser-audit.yml', 'playwright.config.ts',
  ...['already-checked', 'browser-relevant', 'full-browser-baseline', 'browser-baseline',
    'browser-plan', 'release-browser-plan', 'browser-coverage', 'browser-lane', 'browser-evidence'].map(name => `scripts/ci/${name}.mjs`),
];
const SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const hex = (value, pattern) => typeof value === 'string' && pattern.test(value);
const positiveId = value => Number.isSafeInteger(value) && value > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(`Invalid browser evidence: ${message}`); };
const requireValue = (condition, message) => { if (!condition) fail(message); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Hash exactly the policy's checked-in Git blobs, independent of object key order. */
export function policyFingerprint(blobIds) {
  requireValue(object(blobIds), 'policy blob map is missing');
  const paths = [...POLICY_FILES].sort();
  requireValue(JSON.stringify(Object.keys(blobIds).sort()) === JSON.stringify(paths), 'policy blob paths differ');
  requireValue(paths.every(path => hex(blobIds[path], SHA)), 'policy blob ID is malformed');
  return digest(paths.map(path => [path, blobIds[path]]));
}

function caseIdentity(item) {
  requireValue(object(item) && JSON.stringify(Object.keys(item).sort()) === JSON.stringify(['file', 'line', 'project', 'titlePath']), 'case fields differ');
  const { project, file, titlePath, line } = item;
  requireValue(['desktop', 'mobile', 'after-census'].includes(project), 'unknown browser project');
  requireValue(typeof file === 'string' && file.endsWith('.spec.ts') && !file.startsWith('/')
    && !/[\\:\r\n\0]/.test(file) && !file.includes('..') && !file.split('/').some(part => !part || part === '.'), 'unsafe case path');
  requireValue(Array.isArray(titlePath) && titlePath.length > 0
    && titlePath.every(title => typeof title === 'string' && title.length > 0 && !/[\r\n\0›]/.test(title)), 'invalid case titles');
  requireValue(line === `[${project}] › ${file} › ${titlePath.join(' › ')}`, 'case identity line differs');
  return { project, file, titlePath, line };
}

function baselineShape(baseline, record) {
  requireValue(object(baseline) && baseline.coverage === 'full', 'full baseline is missing');
  requireValue(hex(baseline.commit, SHA) && hex(baseline.tree, SHA) && hex(baseline.sourceCommit, SHA), 'baseline commits differ');
  requireValue(positiveId(baseline.runId) && positiveId(baseline.jobId), 'baseline IDs are missing');
  requireValue(baseline.repository === record.repository && baseline.baseRef === record.baseRef, 'baseline repository/branch differs');
  requireValue(['push', 'workflow_dispatch', 'pull_request', 'schedule'].includes(baseline.event), 'unsupported baseline event');
  requireValue(baseline.event === 'pull_request' ? positiveId(baseline.artifactId) : baseline.artifactId === null, 'baseline artifact provenance differs');
}

/** Validate recorded execution and binding; consumers must also verify real API proof and ancestry. */
export function validateBrowserEvidence(record, expected) {
  requireValue(object(record) && object(expected), 'record or expected metadata is missing');
  requireValue(record.schema === 1 && record.policy === BROWSER_POLICY, 'schema/policy differs');
  requireValue(hex(record.commit, SHA) && hex(record.tree, SHA) && hex(record.policySha256, SHA256), 'commit/tree/policy hash is malformed');
  requireValue(typeof record.repository === 'string' && /^[^/\s]+\/[^/\s]+$/.test(record.repository)
    && typeof record.baseRef === 'string' && record.baseRef.trim().length > 0 && positiveId(record.runId), 'run provenance is missing');
  for (const key of ['tree', 'policySha256', 'repository', 'baseRef', 'runId']) {
    requireValue(expected[key] !== undefined && record[key] === expected[key], `expected ${key} differs`);
  }
  requireValue(record.comparisonBase === null || hex(record.comparisonBase, SHA), 'comparison base is missing');
  requireValue(record.baseline === null || object(record.baseline), 'baseline field is missing');
  if (record.baseline !== null) baselineShape(record.baseline, record);
  const coverage = record.coverage;
  requireValue(object(coverage) && coverage.policy === 'shadow-coverage-v1' && coverage.reusableCheckProof === false, 'coverage contract differs');
  requireValue(['full', 'targeted', 'none'].includes(coverage.lane), 'coverage lane differs');
  requireValue(hex(coverage.inventorySha256, SHA256) && Array.isArray(coverage.selected) && Array.isArray(coverage.omitted), 'case inventory is missing');
  const selected = coverage.selected.map(caseIdentity), omitted = coverage.omitted.map(caseIdentity);
  const inventory = [...selected, ...omitted].sort((a, b) => a.line.localeCompare(b.line, 'en'));
  requireValue(inventory.length > 0 && new Set(inventory.map(item => item.line)).size === inventory.length, 'inventory is empty or duplicated');
  requireValue(['desktop', 'mobile', 'after-census'].every(project => inventory.some(item => item.project === project)), 'project inventory is incomplete');
  requireValue(inventory.some(item => item.project === 'after-census' && item.file === 'layout-census-after.spec.ts'), 'completion inventory is missing');
  requireValue(digest(inventory) === coverage.inventorySha256, 'inventory digest differs');
  const counts = coverage.counts;
  requireValue(object(counts) && JSON.stringify(Object.keys(counts).sort()) === JSON.stringify(['expectedFailed', 'passed', 'skipped'])
    && Object.values(counts).every(value => Number.isSafeInteger(value) && value >= 0), 'execution counts differ');
  requireValue(counts.passed + counts.skipped + counts.expectedFailed === selected.length, 'execution counts do not cover selected cases');
  requireValue(Number.isFinite(coverage.caseMilliseconds) && coverage.caseMilliseconds >= 0, 'execution time is missing');
  if (coverage.lane === 'full') {
    requireValue(coverage.outcome === 'executed-contracts-satisfied' && omitted.length === 0 && coverage.completionAudit === 'included', 'full execution is incomplete');
  } else {
    baselineShape(record.baseline, record);
    requireValue(record.comparisonBase === record.baseline.commit, 'comparison does not start at the full baseline');
    requireValue(coverage.completionAudit === 'omitted-requires-full-census', 'partial coverage claims the full completion audit');
    if (coverage.lane === 'targeted') {
      requireValue(coverage.outcome === 'executed-contracts-satisfied' && selected.length > 0 && omitted.length > 0, 'targeted execution is empty or full');
    } else {
      requireValue(coverage.outcome === 'no-browser-impact' && selected.length === 0 && coverage.caseMilliseconds === 0, 'no-impact execution differs');
    }
  }
  return record;
}
