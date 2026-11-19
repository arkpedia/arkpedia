import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

/*
 * next-env.d.ts is tracked, and Next rewrites it: `next dev` points it at .next/dev/types,
 * a production build at .next/types. The release step refuses a build whose checkout changed
 * (uncommittedChanges, scripts/content/code-fingerprint.mjs), so committing the dev form
 * stops every production release: #92 did, on 2026-11-19. It must stay in the build's form.
 */
test('next-env.d.ts is committed in the form a production build writes', () => {
  const text = fs.readFileSync('next-env.d.ts', 'utf8');
  assert.doesNotMatch(text, /\.next\/dev\//, 'next dev rewrote next-env.d.ts; restore it (git checkout -- next-env.d.ts) before committing');
});
