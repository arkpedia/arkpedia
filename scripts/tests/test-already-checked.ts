import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error a plain .mjs script, no types
import { ARTIFACT_PREFIX, vouching } from '../ci/already-checked.mjs';

/*
 * A push or same-repository PR skips Check only for code a green pull request Check of this
 * repository already ran (scripts/ci/already-checked.mjs). Everything else runs it.
 */
const REPO = 'arkpedia/arkpedia';
const TREE = 'a'.repeat(40);
const artifact = (id: number, extra: Record<string, unknown> = {}) => ({ name: `${ARTIFACT_PREFIX}${TREE}`, expired: false, workflow_run: { id }, ...extra });
const run = (extra: Record<string, unknown> = {}) => ({
  status: 'completed', conclusion: 'success', event: 'pull_request', path: '.github/workflows/check.yml',
  repository: { full_name: REPO }, head_repository: { full_name: REPO }, html_url: 'https://example/run', ...extra,
});

test('PR reuse requires proof for the same target branch and known base metadata', () => {
  const proof = run({ pull_requests: [{ base: { ref: 'dev' } }] });
  assert.ok(vouching(TREE, [artifact(1)], { 1: proof }, REPO, 'dev'));
  assert.equal(vouching(TREE, [artifact(1)], { 1: proof }, REPO, 'main'), null);
  assert.equal(vouching(TREE, [artifact(1)], { 1: proof }, REPO, ''), null);
  assert.equal(vouching(TREE, [artifact(1)], { 1: run() }, REPO, 'dev'), null);
  assert.equal(vouching(TREE, [artifact(1)], { 1: run({ pull_requests: [{ base: { ref: 'dev' } }, { base: { ref: 'main' } }] }) }, REPO, 'dev'), null, 'ambiguous target metadata cannot vouch');
});

test('a green pull request Check of this repository vouches for its tree', () => {
  assert.ok(vouching(TREE, [artifact(1)], { 1: run() }, REPO));
});

test('nothing else vouches', () => {
  const cases: [string, unknown[], Record<number, unknown>][] = [
    ['no artifact', [], {}],
    ['another tree', [artifact(1, { name: `${ARTIFACT_PREFIX}${'b'.repeat(40)}` })], { 1: run() }],
    ['an expired artifact', [artifact(1, { expired: true })], { 1: run() }],
    ['unknown artifact expiry', [artifact(1, { expired: undefined })], { 1: run() }],
    ['a run still going', [artifact(1)], { 1: run({ status: 'in_progress', conclusion: null }) }],
    ['a failed run', [artifact(1)], { 1: run({ conclusion: 'failure' }) }],
    ['a cancelled run', [artifact(1)], { 1: run({ conclusion: 'cancelled' }) }],
    ['a push run', [artifact(1)], { 1: run({ event: 'push' }) }],
    ['another workflow', [artifact(1)], { 1: run({ path: '.github/workflows/prepare-content.yml' }) }],
    ["a fork's run", [artifact(1)], { 1: run({ head_repository: { full_name: 'someone/arkpedia' } }) }],
    ['another repository', [artifact(1)], { 1: run({ repository: { full_name: 'someone/arkpedia' } }) }],
    ['a run it cannot read', [artifact(1)], {}],
  ];
  for (const [why, artifacts, runs] of cases) assert.equal(vouching(TREE, artifacts, runs, REPO), null, why);
});
