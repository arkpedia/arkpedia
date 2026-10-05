import test from 'node:test';
import assert from 'node:assert/strict';

/* A tab's sessionStorage, fresh per test. */
function tab() {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = { sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } } };
}

test('Back goes to the page before, not to the section before, and returning drops the page left', async () => {
  tab();
  const { recordPage, previousPage } = await import('../../lib/navigation/pageTrail');
  recordPage('/operators');
  assert.equal(previousPage(), null, 'the first page in a tab has none');
  recordPage('/operators/Texas');
  recordPage('/operators/Texas#baseSkills'); // a section jump is the same page
  assert.equal(previousPage(), '/operators');
  recordPage('/operators/Exusiai#baseSkills'); // operator to operator, by the search
  assert.equal(previousPage(), '/operators/Texas');
  recordPage('/operators/Texas'); // Back (or the browser's): the page left is dropped
  assert.equal(previousPage(), '/operators', 'not Exusiai again: Back from Texas still reaches the roster');
  recordPage('/operators');
  assert.equal(previousPage(), null);
});

test('a new query on the same path is the same page, and a reload records nothing new', async () => {
  tab();
  const { recordPage, previousPage } = await import('../../lib/navigation/pageTrail');
  recordPage('/schedule');
  recordPage('/stages/browse?s=ta-1');
  recordPage('/stages/browse?s=ta-2');
  recordPage('/stages/browse?s=ta-2');
  assert.equal(previousPage(), '/schedule');
  recordPage('/events/X');
  assert.equal(previousPage(), '/stages/browse?s=ta-2', 'Back reaches the stage that was open');
});
