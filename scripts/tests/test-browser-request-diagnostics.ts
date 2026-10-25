import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticUrl } from '../../tests/browser/request-diagnostics';

test('public request diagnostics retain the asset path without credentials, query values or fragments', () => {
  assert.equal(diagnosticUrl('https://name:password@example.com/repo/abcdef/image.png?token=hidden#private'),
    'https://example.com/repo/abcdef/image.png');
  assert.equal(diagnosticUrl('http://127.0.0.1:3310/events/example?secret=hidden'), 'http://127.0.0.1:3310/events/example');
  for (const value of ['data:text/plain,private', 'blob:https://example.com/private', 'file:///private/path']) {
    assert.equal(diagnosticUrl(value), '[non-http resource]');
  }
  assert.equal(diagnosticUrl('private malformed value'), '[invalid URL]');
});
