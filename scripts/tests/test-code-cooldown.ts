import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CODE_COOLDOWN_KEY, CODE_COOLDOWN_MS, readCodeCooldown, startCodeCooldown } from '../../lib/account-import/codeCooldown';

test('resend cooldown persists per region without credentials and expires on the exact boundary', () => {
  const values = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  try {
    const now = 1_790_000_000_000;
    const deadline = startCodeCooldown('en', now);
    assert.equal(deadline, now + CODE_COOLDOWN_MS);
    assert.equal(readCodeCooldown('en', now + 59_999), deadline);
    assert.equal(readCodeCooldown('en', deadline), 0);
    assert.equal(readCodeCooldown('jp', now), 0);
    assert.deepEqual([...values], [[`${CODE_COOLDOWN_KEY}:en`, String(deadline)]]);
    values.set(`${CODE_COOLDOWN_KEY}:en`, 'Infinity');
    assert.equal(readCodeCooldown('en', now), 0);
    values.set(`${CODE_COOLDOWN_KEY}:en`, String(now + 86_400_000));
    assert.equal(readCodeCooldown('en', now), 0);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('blocked storage still paces code requests in memory', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  try {
    const now = 1_800_000_000_000;
    const deadline = startCodeCooldown('kr', now);
    assert.equal(readCodeCooldown('kr', now), deadline);
    assert.equal(readCodeCooldown('kr', deadline), 0);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
