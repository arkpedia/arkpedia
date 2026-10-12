import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editorialPlan, devPlan } from './editorial-watch.mjs';
test('only unpublished source edits request a main compilation', () => {
  assert.equal(editorialPlan({ status: 'ahead', ahead_by: 1, files: [{ filename: 'source/data/operators-6star/Ines.json' }] }).request, true);
  assert.equal(editorialPlan({ status: 'ahead', ahead_by: 1, files: [{ filename: 'README.md' }] }).request, false);
  for (const status of ['behind', 'identical']) assert.equal(editorialPlan({ status }).request, false);
});
test('pending runs suppress duplicate preparations while later source pushes remain discoverable', () => {
  const changes = { status: 'ahead', ahead_by: 2, files: [{ filename: 'source/data/events.json' }] };
  assert.equal(editorialPlan(changes, true).request, false);
  assert.equal(editorialPlan(changes, false).request, true);
  assert.equal(devPlan(undefined, true).request, false);
});
test('diverged and long editorial branches cannot replace newer canonical data', () => {
  assert.throws(() => editorialPlan({ status: 'diverged' }), /contain current data main/);
  assert.throws(() => editorialPlan({ status: 'ahead', ahead_by: 101 }), /100 commits/);
});
test('a truncated compare is conservative rather than missing source edits', () => {
  assert.equal(editorialPlan({ status: 'ahead', ahead_by: 1, files: Array.from({ length: 300 }, (_, i) => ({ filename: `notes/${i}.md` })) }).request, true);
});
test('dev refreshes shared main once, including its first release and divergent output', () => {
  for (const status of ['ahead', 'identical']) assert.equal(devPlan({ status }).request, false);
  for (const status of ['behind', 'diverged']) assert.equal(devPlan({ status }).request, true);
  assert.equal(devPlan(undefined).request, true);
});
