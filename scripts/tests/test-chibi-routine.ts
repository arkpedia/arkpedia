import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseChibiBreak, chibiActivities, chibiIdleAnimation } from '../../lib/operators/chibiRoutine';

const base = [
  { name: 'Default', duration: 0 }, { name: 'Move', duration: 2 },
  { name: 'Relax', duration: 3 }, { name: 'Interact', duration: 2.23 },
  { name: 'Sit', duration: 4 }, { name: 'Sleep', duration: 2 },
];
const sequence = (...values: number[]) => () => { assert.ok(values.length); return values.shift()!; };

test('stationary chibis use a real idle loop instead of a zero-duration setup pose', () => {
  assert.equal(chibiIdleAnimation(base), 'Relax');
  assert.equal(chibiIdleAnimation([{ name: 'Idle', duration: 0 }, ...base]), 'Relax');
  assert.equal(chibiIdleAnimation([...base, { name: 'Idle', duration: 1 }]), 'Idle');
  assert.equal(chibiIdleAnimation([{ name: 'Idle_2', duration: 2 }]), 'Idle_2');
  assert.equal(chibiIdleAnimation([{ name: 'Default', duration: 0 }, { name: 'Move', duration: 2 }]), undefined);
});

test('chairs last 3–10 seconds and beds last 10–20 seconds independently of native loop length', () => {
  for (const [pick, activity, bounds] of [[0, 'sit', [3000, 10000]], [.3, 'sleep', [10000, 20000]]] as const) {
    for (const duration of [0, 1]) {
      const result = chooseChibiBreak(base, sequence(0, pick, 0, duration))!;
      assert.equal(result.activity, activity);
      assert.equal(result.duration, bounds[duration]);
    }
  }
});
test('base idle and special poses are selected, with special playing a complete native animation', () => {
  assert.deepEqual(chooseChibiBreak(base, sequence(0, .55, 0, .5)), { activity: 'idle', clip: 'Relax', duration: 4000 });
  assert.deepEqual(chooseChibiBreak(base, sequence(0, .9, 0)), { activity: 'special', clip: 'Interact', duration: 2230 });
});
test('ordinary walking remains probable and unavailable or static poses are never selected', () => {
  assert.equal(chooseChibiBreak(base, sequence(.4)), null);
  assert.equal(chooseChibiBreak([{ name: 'Default', duration: 0 }, { name: 'Move', duration: 2 }], sequence(0)), null);
  assert.deepEqual(chibiActivities([{ name: 'Idle_2', duration: 2 }, { name: 'Special_1', duration: 1 }, { name: 'Attack_1', duration: 3 }]).idle.map(value => value.name), ['Idle_2']);
  assert.equal(chooseChibiBreak([{ name: 'Idle_2', duration: 2 }], sequence(0, .9, .9, 0))?.clip, 'Idle_2');
});
