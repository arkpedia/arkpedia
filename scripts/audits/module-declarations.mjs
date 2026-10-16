import ts from 'typescript';

/** Runtime API only: interfaces and type aliases have no JavaScript export. */
export function runtimeExports(file, source) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const exports = new Map();
  for (const node of ast.statements) {
    if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const item of node.exportClause.elements) if (!item.isTypeOnly) exports.set(item.name.text, { kind: 'value' });
      continue;
    }
    if (!(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export)) continue;
    if (ts.isFunctionDeclaration(node) && node.name) {
      exports.set(node.name.text, {
        kind: 'function',
        maximum: node.parameters.some(p => p.dotDotDotToken) ? Infinity : node.parameters.length,
      });
    } else if (ts.isVariableStatement(node)) {
      for (const item of node.declarationList.declarations) exports.set(item.name.getText(ast), { kind: 'value' });
    } else if (ts.isClassDeclaration(node) && node.name) exports.set(node.name.text, { kind: 'value' });
  }
  return exports;
}

export function declarationDrift(implementation, declaration) {
  const problems = [];
  for (const name of new Set([...implementation.keys(), ...declaration.keys()])) {
    const actual = implementation.get(name), declared = declaration.get(name);
    if (!actual) problems.push(`${name}: declared but not exported by JavaScript`);
    else if (!declared) problems.push(`${name}: JavaScript export has no declaration`);
    else if (actual.kind === 'function' && declared.kind === 'function'
      && (actual.maximum !== declared.maximum)) {
      problems.push(`${name}: JavaScript/declaration parameter counts differ`);
    }
  }
  return problems;
}
