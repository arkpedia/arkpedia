import test from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';

const lint = new ESLint();

test('script lint accepts Node modules, CommonJS and JSON import attributes', async () => {
  for (const [filePath, code] of [
    ['scripts/fixture.mjs', "import data from './data.json' with { type: 'json' }; export const load = () => JSON.stringify(data);"],
    ['scripts/fixture.cjs', "const fs = require('node:fs'); module.exports = file => fs.readFileSync(file, 'utf8');"],
    ['scripts/content/test-runtime.mjs', 'export const inspect = page => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);'],
  ]) {
    const [result] = await lint.lintText(code, { filePath });
    assert.deepEqual(result.messages, [], filePath);
  }
});

test('script lint rejects undefined references and unused bindings without a framework lint pass', async () => {
  const [result] = await lint.lintText('const unused = 1; export const run = () => missingReference;', { filePath: 'scripts/fixture.mjs' });
  assert.deepEqual(result.messages.map(message => message.ruleId).sort(), ['no-undef', 'no-unused-vars']);
});
