import test from 'node:test';
import assert from 'node:assert/strict';
import { accountReturnPath } from '../../lib/cloud-account/navigation';

test('account returns preserve the current page, filters and anchor', () => {
  assert.equal(accountReturnPath('/music?view=library#collection'), '/music?view=library&account=welcome#collection');
});
test('account returns replace stale account actions and surface provider failure', () => {
  assert.equal(accountReturnPath('/account?settings=logins&confirm=delete&signin=failed&panel=pulls', true), '/account?panel=pulls&account=welcome&signin=failed');
});
test('account returns never target another origin', () => {
  for (const input of ['https://elsewhere.invalid/path', '//elsewhere.invalid', '/\\elsewhere.invalid', 'javascript:alert(1)', '/music\n']) {
    assert.equal(accountReturnPath(input), '/account?account=welcome');
  }
});
