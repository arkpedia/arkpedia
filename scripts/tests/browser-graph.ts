import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/*
 * What a page's browser bundle can reach, read from the source the way Next builds it.
 *
 * Shared by the tests that keep game tables out of the browser (test-pull-release-data.ts,
 * test-client-game-tables.ts): the release carries those tables in page props, and a copy
 * compiled into a client chunk is only as fresh as the last deploy.
 */
const ROOT = process.cwd();
/* Next strips these from the browser build, and with them every import and
   declaration nothing else still uses. */
const SERVER_EXPORTS = new Set(['getStaticProps', 'getStaticPaths', 'getServerSideProps']);

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? path.join(ROOT, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  const found = [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]
    .find(file => fs.existsSync(file) && fs.statSync(file).isFile());
  return found ? path.relative(ROOT, found) : null;
}

/** Identifiers a statement refers to as values. Property names are not references,
 *  and neither is anything in a type: the compiler elides an import only types use
 *  (`import { getTerminalHome, TerminalHome }` where the page keeps just the interface). */
function references(node: ts.Node, into = new Set<string>()): Set<string> {
  if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return into;
  if (ts.isIdentifier(node)) {
    const parent = node.parent;
    const propertyName = parent && ((ts.isPropertyAccessExpression(parent) && parent.name === node)
      || ((ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent) || ts.isMethodDeclaration(parent)) && parent.name === node)
      || (ts.isJsxAttribute(parent) && parent.name === node));
    if (!propertyName) into.add(node.text);
  }
  node.forEachChild(child => { references(child, into); });
  return into;
}

function declared(statement: ts.Statement): string[] {
  if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) return [statement.name.text];
  if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.flatMap(d => ts.isIdentifier(d.name) ? [d.name.text] : []);
  return [];
}

const exported = (statement: ts.Statement) => ts.canHaveModifiers(statement)
  && !!ts.getModifiers(statement)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);

/** What a page keeps once Next removes its data-fetching exports, and then any
 *  declaration only they used. Everything else in a module is kept. */
function browserStatements(statements: ts.Statement[]): ts.Statement[] {
  const refs = new Map(statements.map(s => [s, references(s)]));
  const removed = new Set(statements.filter(s => exported(s) && declared(s).some(name => SERVER_EXPORTS.has(name))));
  for (let changed = true; changed;) {
    changed = false;
    for (const s of statements) {
      const names = declared(s);
      if (removed.has(s) || exported(s) || !names.length) continue;
      const usedBy = (others: ts.Statement[]) => others.some(other => other !== s && names.some(name => refs.get(other)!.has(name)));
      if (usedBy([...removed]) && !usedBy(statements.filter(other => !removed.has(other)))) { removed.add(s); changed = true; }
    }
  }
  return statements.filter(s => !removed.has(s));
}

/** Modules this file loads in the browser: every value import still used, plus
 *  import('…') and new URL('…', import.meta.url) workers. */
const importCache = new Map<string, string[]>();
export function browserImports(file: string, isPage: boolean): string[] {
  const key = `${isPage}:${file}`;
  if (!importCache.has(key)) importCache.set(key, readBrowserImports(file, isPage));
  return importCache.get(key)!;
}

function readBrowserImports(file: string, isPage: boolean): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(ROOT, file), 'utf8'), ts.ScriptTarget.Latest, true);
  const body = source.statements.filter(s => !ts.isImportDeclaration(s));
  const kept = isPage ? browserStatements(body) : body;
  const live = new Set<string>();
  for (const s of kept) references(s, live);
  const specs: string[] = [];
  for (const s of source.statements) {
    if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier)) {
      const clause = s.importClause;
      if (clause?.isTypeOnly) continue;
      const bindings = clause?.namedBindings;
      const names = [
        ...(clause?.name ? [clause.name.text] : []),
        ...(bindings && ts.isNamespaceImport(bindings) ? [bindings.name.text] : []),
        ...(bindings && ts.isNamedImports(bindings) ? bindings.elements.filter(e => !e.isTypeOnly).map(e => e.name.text) : []),
      ];
      if (!clause || names.some(name => live.has(name))) specs.push(s.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(s) && !s.isTypeOnly && s.moduleSpecifier && ts.isStringLiteral(s.moduleSpecifier)) specs.push(s.moduleSpecifier.text);
  }
  const visit = (node: ts.Node) => {
    if ((ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      || (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL')) {
      const [first] = node.arguments ?? [];
      if (first && ts.isStringLiteral(first)) specs.push(first.text);
    }
    node.forEachChild(visit);
  };
  kept.forEach(visit);
  return specs.map(spec => resolve(file, spec)).filter((resolved): resolved is string => !!resolved);
}

/**
 * The chain from `entry` to the first of `targets` it reaches, if any. `allowed` names
 * single import edges ("from -> to") that may reach a target: a page's own bundled
 * no-release fallback, so the walk still catches the same file arriving any other way.
 */
export function pathToTarget(entry: string, targets: readonly string[], { clientOnly = true, allowed = [] as readonly string[] } = {}): string[] | null {
  const parent = new Map<string, string | null>([[entry, null]]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    if (targets.includes(file)) {
      const chain = [file];
      for (let at = parent.get(file); at; at = parent.get(at)) chain.unshift(at);
      return chain;
    }
    if (!/\.(tsx?|mjs|js)$/.test(file)) continue;
    for (const next of browserImports(file, file === entry && clientOnly)) {
      if (allowed.includes(`${file} -> ${next}`)) continue;
      if (!parent.has(next)) { parent.set(next, file); queue.push(next); }
    }
  }
  return null;
}

export function pages(dir = 'pages'): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return file === path.join('pages', 'api') ? [] : pages(file);
    return /\.tsx?$/.test(entry.name) && entry.name !== '_document.tsx' ? [file] : [];
  });
}
