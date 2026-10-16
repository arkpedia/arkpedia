import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

test('every suite has a test runner, including the separate production-runtime checks', () => {
  const root = process.cwd();
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const workflow = fs.readFileSync('.github/workflows/check.yml', 'utf8');
  const commands = [pkg.scripts.test, ...Object.entries(pkg.scripts)
    .filter(([name]) => name.startsWith('test:') && workflow.includes(`npm run ${name}`))
    .map(([, command]) => command)].join(' ');
  const patterns = commands.match(/scripts\/[^\s;&]+/g) ?? [];
  assert.ok(patterns.length >= 3);
  const covered = new Set(ts.sys.readDirectory(root, ['.ts', '.mjs'], undefined, patterns).map(file => path.relative(root, file)));
  const suites = ts.sys.readDirectory(path.join(root, 'scripts'), ['.ts', '.mjs', '.py']).map(file => path.relative(root, file))
    .filter(file => /(?:^|\/)(?:test-[^/]+\.(?:ts|mjs|py)|[^/]+\.test\.mjs)$/.test(file));
  assert.ok(suites.length > 200);
  for (const file of suites) {
    if (file.endsWith('.py')) {
      assert.match(pkg.scripts['test:py'], /scripts\/tests\/run-python-tests\.mjs/);
      assert.ok(workflow.includes('npm run test:py'));
    } else assert.ok(covered.has(file), `${file} is missing from npm test`);
  }
});
