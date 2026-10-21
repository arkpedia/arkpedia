import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CLASS_ORDER, sortClasses } from '../../lib/operators/classOrder';

test('classes sort in the game\'s order, not alphabetically', () => {
  assert.deepEqual(sortClasses(['Caster', 'Defender', 'Guard', 'Medic', 'Sniper', 'Specialist', 'Supporter', 'Vanguard']), [...CLASS_ORDER]);
  assert.deepEqual(sortClasses(['Medic', 'Vanguard', 'Medic', 'Newclass']), ['Vanguard', 'Medic', 'Newclass']);
});

test('the operators list and the planner roster sort classes with sortClasses', () => {
  for (const file of ['pages/operators/index.tsx', 'components/planner/RosterGrid.tsx']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /sortClasses\(/, `${file} orders its classes with sortClasses`);
    assert.doesNotMatch(source, /op\.class\)[^;]*\)\)\.sort\(\)/, `${file} sorts classes alphabetically`);
  }
});
