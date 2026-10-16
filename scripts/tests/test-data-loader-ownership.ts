import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const owners: Record<string, string> = {
  'material-catalogue.json': 'lib/farming/materialCatalogueServer.ts',
  'dynamic-art.json': 'lib/skins/dynamicArtFallback.ts',
};

/** These checked, bundled records have one server loader. The browser-safe
 * validators/types stay separate; other legitimate builder imports are unchanged. */
function bypasses(file: string, text: string): string[] {
  if (!text.includes('material-catalogue.json') && !text.includes('dynamic-art.json')) return [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const check = (node: ts.Node | undefined) => {
    if (!node || !ts.isStringLiteralLike(node)) return;
    const record = node.text.match(/(?:^|\/)data\/(material-catalogue\.json|dynamic-art\.json)$/)?.[1];
    if (record && file !== owners[record]) found.push(`${file}: ${record} belongs to ${owners[record]}`);
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) check(node.moduleSpecifier);
    if (ts.isExportDeclaration(node) && !node.isTypeOnly) check(node.moduleSpecifier);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || ts.isIdentifier(node.expression) && node.expression.text === 'require')) check(node.arguments[0]);
    node.forEachChild(visit);
  };
  visit(source);
  return found;
}

function sourceFiles(folder: string): string[] {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const file = path.posix.join(folder, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.(?:tsx?|mjs)$/.test(entry.name) ? [file] : [];
  });
}

test('checked material and animated-art records enter builders only through their server loader', () => {
  const files = ['pages', 'components', 'lib'].flatMap(sourceFiles);
  assert.deepEqual(files.flatMap(file => bypasses(file, fs.readFileSync(file, 'utf8'))), []);
});

test('loader ownership rejects dynamic, static, require and re-export bypasses without banning other builder data', () => {
  for (const text of [
    "const data = await import('@/data/material-catalogue.json');",
    "import data from '../../data/dynamic-art.json';",
    "const data = require('../data/material-catalogue.json');",
    "export { default } from '@/data/dynamic-art.json';",
  ]) assert.equal(bypasses('lib/bypass.ts', text).length, 1, text);
  assert.deepEqual(bypasses(owners['dynamic-art.json'], "const data = await import('@/data/dynamic-art.json');"), []);
  assert.deepEqual(bypasses('pages/test.tsx', "import stages from '@/data/stages.json'; // data/material-catalogue.json"), []);
  assert.equal(bypasses(owners['dynamic-art.json'], "const data = await import('@/data/material-catalogue.json');").length, 1, 'ownership is record-specific');
});
