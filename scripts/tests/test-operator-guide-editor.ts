import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
// @ts-expect-error Available in the supported Node runtime.
import { DatabaseSync } from 'node:sqlite';
import type { D1Database } from '@cloudflare/workers-types';
import { applyGuideEdits, guideFields, validGuideValue, type GuideValue } from '../../lib/dashboard/operatorGuide';
import { readGuideEdits, saveGuideEdit } from '../../lib/dashboard/operatorGuideStore';
import { getSkillList, type Operator } from '../../lib/operators/operatorTypes';

test('mastery overrides preserve independent skills, new source data and concurrent edits', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(readFileSync('migrations/accounts/0026_operator_guides.sql', 'utf8'));
    const db = { prepare: (sql: string) => ({ bind: (...args: unknown[]) => ({
      run: async () => ({ meta: sqlite.prepare(sql).run(...args) }),
      all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    }) }) } as unknown as D1Database;
    const skill = { name: 'Test skill', recommendation: [{ mastery: 'm1', priority: 'main', order: '1st', explanation: 'First level.' }] };
    const op = { skills: { skillList: [skill, skill], skillCost: {} }, guides: [{ videoId: 'abcdefghijk' }] } as unknown as Operator;
    const value: GuideValue = { kind: 'mastery', entries: [
      { mastery: 'm3', priority: 'sub', order: '2nd', explanation: 'Save for later.' },
      { mastery: 'm1', priority: null, order: null, explanation: 'An earlier breakpoint.' },
    ] };
    assert.ok(validGuideValue(value, 'mastery'));
    assert.equal(validGuideValue(value, 'video'), false);
    assert.equal(validGuideValue({ ...value, entries: [{ ...value.entries[0], priority: 'other' }] }, 'mastery'), false);
    assert.ok(await saveGuideEdit(db, 'operator-1', 's2', 0, value, 'editor'));
    assert.equal(await saveGuideEdit(db, 'operator-1', 's2', 0, value, 'other'), false);
    const caption: GuideValue = { kind: 'video', label: 'Skill guide', creator: 'Artist' };
    assert.ok(await saveGuideEdit(db, 'operator-1', 'video:abcdefghijk', 0, caption, 'other'));
    const edits = await readGuideEdits(db, 'operator-1');
    const updated = applyGuideEdits(op, edits);
    assert.equal(getSkillList(updated)[0], getSkillList(op)[0]);
    assert.deepEqual(getSkillList(updated)[1].recommendation, value.entries);
    assert.equal(updated.guides?.[0].editorialCaption?.creator, 'Artist');
    assert.equal(guideFields(op, edits)[1].revision, 1);
    assert.deepEqual(await readGuideEdits(db, 'operator-2'), []);
    assert.ok(await saveGuideEdit(db, 'operator-1', 's2', 1, null, 'editor'));
    const newSource = { ...op, skills: [skill, { ...skill, recommendation: [] }] } as unknown as Operator;
    assert.deepEqual(getSkillList(applyGuideEdits(newSource, await readGuideEdits(db, 'operator-1')))[1].recommendation, []);
    assert.equal(await saveGuideEdit(db, 'operator-1', 's2', 1, value, 'other'), false);
  } finally { sqlite.close(); }
});
