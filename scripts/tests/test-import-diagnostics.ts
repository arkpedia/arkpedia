import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importDiagnosticsAvailable } from '../../lib/account-import/importDiagnostics';

test('import debugging requires Preview/local and explicit URL opt-in', () => {
  for (const host of ['preview.arkpedia.net', 'localhost', '127.0.0.1']) {
    assert.equal(importDiagnosticsAvailable(host, '?importDiagnostics=1'), true);
    assert.equal(importDiagnosticsAvailable(host, ''), false);
  }
  for (const host of ['arkpedia.net', 'www.arkpedia.net', 'preview.arkpedia.net.attacker.example']) {
    assert.equal(importDiagnosticsAvailable(host, '?importDiagnostics=1&stageDiagnostics=1'), false);
  }
});
