import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const guard = path.resolve('scripts/audits/check-deployment-traces.mjs');

test('deployment trace audit rejects local records, caches and secrets in development APIs', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deployment-traces-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts/content'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts/content/pages.json'), '[]');
  const trace = path.join(root, '.next/server/pages/api/dev/optimizer-results.js.nft.json');
  fs.mkdirSync(path.dirname(trace), { recursive: true });
  const run = file => {
    fs.writeFileSync(trace, JSON.stringify({ files: [path.relative(path.dirname(trace), path.join(root, file))] }));
    return spawnSync(process.execPath, [guard], { cwd: root, encoding: 'utf8' });
  };
  assert.equal(run('node_modules/next/server.js').status, 0);
  for (const file of ['data/operators.json', 'public/records.json', '.env.local', '.cache/optimizers/operator.json']) {
    const result = run(file);
    assert.equal(result.status, 1, file);
    assert.ok(result.stderr.includes(file), result.stderr);
  }
});
