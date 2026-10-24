import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ARTIFACT_PREFIX, BROWSER_POLICY, POLICY_ARTIFACT_PREFIX, POLICY_FILES,
  policyFingerprint, validateBrowserEvidence } from '../ci/browser-evidence.mjs';

const sha = 'a'.repeat(40), tree = 'b'.repeat(40), policySha256 = 'c'.repeat(64);
const identity = (project, file, ...titlePath) => ({ project, file, titlePath, line: `[${project}] › ${file} › ${titlePath.join(' › ')}` });
const inventory = [identity('desktop', 'story.spec.ts', 'library'), identity('mobile', 'story.spec.ts', 'library'),
  identity('after-census', 'layout-census-after.spec.ts', 'completion')];
const digest = items => createHash('sha256').update(JSON.stringify([...items].sort((a,b) => a.line.localeCompare(b.line, 'en')))).digest('hex');
function fixture(lane = 'full') {
  const baseline = { coverage: 'full', commit: 'd'.repeat(40), tree: 'e'.repeat(40), runId: 10, jobId: 20,
    artifactId: 30, event: 'pull_request', repository: 'arkpedia/arkpedia', baseRef: 'main', sourceCommit: 'f'.repeat(40) };
  const selected = lane === 'full' ? structuredClone(inventory) : lane === 'targeted' ? [structuredClone(inventory[0])] : [];
  return { schema: 1, policy: BROWSER_POLICY, commit: sha, tree, repository: 'arkpedia/arkpedia', baseRef: 'main', runId: 40,
    policySha256, baseline: lane === 'full' ? null : baseline, comparisonBase: lane === 'full' ? null : baseline.commit,
    coverage: { policy: 'shadow-coverage-v1', lane, inventorySha256: digest(inventory),
      outcome: lane === 'none' ? 'no-browser-impact' : 'executed-contracts-satisfied', reusableCheckProof: false,
      selected, omitted: structuredClone(inventory.filter(item => !selected.some(other => other.line === item.line))),
      counts: { passed: selected.length, skipped: 0, expectedFailed: 0 }, caseMilliseconds: lane === 'none' ? 0 : 100,
      completionAudit: lane === 'full' ? 'included' : 'omitted-requires-full-census' } };
}
const expected = { tree, policySha256, repository: 'arkpedia/arkpedia', baseRef: 'main', runId: 40 };
function rejects(mutate, lane = 'full') {
  const record = fixture(lane); mutate(record);
  assert.throws(() => validateBrowserEvidence(record, expected), /Invalid browser evidence/);
}

test('policy fingerprint requires the complete exact Git blob map and is order independent', () => {
  const blobs = Object.fromEntries(POLICY_FILES.map((file,index) => [file, index.toString(16).padStart(40, '0')]));
  const reversed = Object.fromEntries(Object.entries(blobs).reverse());
  assert.equal(policyFingerprint(blobs), policyFingerprint(reversed));
  const changed = { ...blobs, 'playwright.config.ts': 'f'.repeat(40) };
  assert.notEqual(policyFingerprint(blobs), policyFingerprint(changed));
  const missing = { ...blobs }; delete missing[POLICY_FILES[0]];
  for (const bad of [null, [], missing, { ...blobs, unexpected: sha }, { ...blobs, [POLICY_FILES[0]]: 'main' }]) {
    assert.throws(() => policyFingerprint(bad), /Invalid browser evidence/);
  }
  assert.equal(ARTIFACT_PREFIX, 'checked-tree-');
  assert.equal(POLICY_ARTIFACT_PREFIX, 'checked-policy-tree-');
});

test('full, targeted and no-impact records preserve their distinct contracts', () => {
  for (const lane of ['full','targeted','none']) {
    const record = fixture(lane);
    assert.equal(validateBrowserEvidence(record, expected), record);
  }
  const record = fixture();
  record.coverage.counts = { passed: 1, skipped: 1, expectedFailed: 1 };
  assert.equal(validateBrowserEvidence(record, expected), record);
});

test('metadata and policy mismatches cannot rebind evidence to another source or run', () => {
  for (const key of ['tree','policySha256','repository','baseRef','runId']) {
    const wrong = { ...expected, [key]: key === 'runId' ? 99 : 'wrong' };
    assert.throws(() => validateBrowserEvidence(fixture(), wrong), /Invalid browser evidence/);
    const missing = { ...expected }; delete missing[key];
    assert.throws(() => validateBrowserEvidence(fixture(), missing), /Invalid browser evidence/);
  }
  for (const key of ['schema','policy','commit','tree','repository','baseRef','runId','policySha256','baseline','comparisonBase','coverage']) {
    rejects(record => { delete record[key]; });
  }
  rejects(record => { record.schema = 2; });
  rejects(record => { record.policy = 'planned'; });
  rejects(record => { record.commit = 'main'; });
  assert.throws(() => validateBrowserEvidence(null, expected), /Invalid browser evidence/);
});

test('collection-only and self-claimed reusable proof are not executed coverage', () => {
  for (const outcome of ['planned-only', 'collected', 'success', undefined]) rejects(record => { record.coverage.outcome = outcome; });
  rejects(record => { record.coverage.reusableCheckProof = true; });
  rejects(record => { delete record.coverage.reusableCheckProof; });
  rejects(record => { record.coverage.policy = 'unknown'; });
  rejects(record => { record.coverage.lane = 'quick'; });
});

test('inventory digests bind selected and omitted identities, including property order', () => {
  rejects(record => { record.coverage.selected.pop(); });
  rejects(record => { record.coverage.inventorySha256 = '0'.repeat(64); });
  rejects(record => { record.coverage.selected.push(structuredClone(record.coverage.selected[0])); });
  rejects(record => { record.coverage.selected[0].line += ' changed'; });
  rejects(record => { record.coverage.selected[0].extra = 'hidden'; });
  rejects(record => { record.coverage.omitted = undefined; });
  const record = fixture();
  record.coverage.selected = record.coverage.selected.map(item => ({ line:item.line, titlePath:item.titlePath, file:item.file, project:item.project })).reverse();
  assert.equal(validateBrowserEvidence(record, expected), record);
});

test('unsafe paths, titles and project identities fail even after recomputing the digest', () => {
  for (const file of ['../story.spec.ts','/story.spec.ts','C:/story.spec.ts','folder\\story.spec.ts','a/./story.spec.ts','a//story.spec.ts','other.ts']) {
    rejects(record => {
      record.coverage.selected[0] = identity('desktop', file, 'library');
      record.coverage.inventorySha256 = digest(record.coverage.selected);
    });
  }
  for (const titles of [[], [''], ['line\nbreak'], ['ambiguous › title'], ['nul\0title']]) {
    rejects(record => { record.coverage.selected[0] = identity('desktop','story.spec.ts',...titles); record.coverage.inventorySha256=digest(record.coverage.selected); });
  }
  rejects(record => { record.coverage.selected[0] = identity('unknown','story.spec.ts','library'); record.coverage.inventorySha256=digest(record.coverage.selected); });
});

test('counts, execution duration and full completion audit are mandatory', () => {
  for (const bad of [-1, 0.5, '3', NaN, Infinity]) rejects(record => { record.coverage.counts.passed=bad; });
  rejects(record => { record.coverage.counts.passed=0; });
  rejects(record => { record.coverage.counts.failed=1; });
  rejects(record => { delete record.coverage.counts.skipped; });
  for (const bad of [-1, NaN, Infinity, undefined, '100']) rejects(record => { record.coverage.caseMilliseconds=bad; });
  rejects(record => { record.coverage.completionAudit='omitted-requires-full-census'; });
  rejects(record => { const item=record.coverage.selected.pop(); record.coverage.omitted.push(item); record.coverage.counts.passed--; });
  rejects(record => { record.coverage.selected=[];record.coverage.omitted=[];record.coverage.counts.passed=0;record.coverage.inventorySha256=digest([]); });
});

test('targeted and none need full baseline provenance on the same branch and cumulative comparison', () => {
  for (const lane of ['targeted','none']) {
    for (const key of ['coverage','commit','tree','sourceCommit','runId','jobId','artifactId','event','repository','baseRef']) {
      rejects(record => { delete record.baseline[key]; }, lane);
    }
    rejects(record => { record.baseline=null; }, lane);
    rejects(record => { record.baseline.coverage='targeted'; }, lane);
    rejects(record => { record.baseline.repository='someone/fork'; }, lane);
    rejects(record => { record.baseline.baseRef='dev'; }, lane);
    rejects(record => { record.comparisonBase=sha; }, lane);
    rejects(record => { record.baseline.artifactId=null; }, lane);
    rejects(record => { record.baseline.runId='10'; }, lane);
    rejects(record => { record.coverage.completionAudit='included'; }, lane);
    for (const event of ['push','workflow_dispatch']) {
      const record=fixture(lane);record.baseline.event=event;record.baseline.artifactId=null;
      assert.equal(validateBrowserEvidence(record,expected),record);
      record.baseline.artifactId=30;
      assert.throws(()=>validateBrowserEvidence(record,expected),/Invalid browser evidence/);
    }
  }
});

test('partial lanes cannot mislabel empty/full execution or fake no-impact outcomes', () => {
  rejects(record => { record.coverage.lane='targeted'; }, 'none');
  rejects(record => { record.coverage.outcome='executed-contracts-satisfied'; }, 'none');
  rejects(record => { record.coverage.caseMilliseconds=1; }, 'none');
  rejects(record => { record.coverage.outcome='no-browser-impact'; }, 'targeted');
  rejects(record => { record.coverage.selected.push(...record.coverage.omitted);record.coverage.omitted=[];record.coverage.counts.passed=3; }, 'targeted');
  rejects(record => { record.coverage.omitted.push(structuredClone(record.coverage.selected[0])); }, 'targeted');
});

test('project and census inventories cannot disappear behind a new digest', () => {
  for (const project of ['desktop','mobile','after-census']) rejects(record => {
    record.coverage.selected=record.coverage.selected.filter(item=>item.project!==project);
    record.coverage.counts.passed=record.coverage.selected.length;
    record.coverage.inventorySha256=digest(record.coverage.selected);
  });
  rejects(record=>{record.coverage.selected[2]=identity('after-census','other.spec.ts','completion');record.coverage.inventorySha256=digest(record.coverage.selected);});
});
