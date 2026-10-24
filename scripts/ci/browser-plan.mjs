#!/usr/bin/env node
// Shadow planning only. This script neither skips CI nor creates reusable Check proof.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { builtinModules } from 'node:module';
import ts from 'typescript';
import { relevantFiles, references, resolve } from './browser-relevant.mjs';
import { coveragePlan } from './browser-coverage.mjs';

const CORE = ['nav-bar.spec.ts', 'mobile-touch-nav.spec.ts', 'navigation-continuity.spec.ts'];
const FAMILIES = [
  { name: 'story', code: /^(?:pages\/story(?:\/|\.)|components\/story\/|lib\/story\/|styles\/story\/)/, specs: /^story-.*\.spec\.ts$/ },
  { name: 'schedule', code: /^(?:pages\/schedule\.tsx|pages\/events\/|components\/schedule\/|components\/events\/|lib\/schedule\/|lib\/events\/|styles\/schedule\/|styles\/events\/)/, specs: /^(?:schedule-|regional-schedules|banner-forecasts|home-banner-status|event-|planning-pages).*\.spec\.ts$/ },
  { name: 'music', code: /^(?:pages\/music(?:\/|\.)|pages\/api\/music|components\/music\/|lib\/music\/|styles\/music\/)/, specs: /^(?:music-|song-).*\.spec\.ts$/ },
  { name: 'accounts', code: /^(?:pages\/account\.tsx|pages\/api\/(?:auth\/|cloud-account\.ts|account-import\/)|lib\/(?:cloud-account|account|account-import)\/|components\/(?:account|account-import)\/|styles\/account\/)/, specs: /^(?:account-|cloud-accounts|base-account|medal-collection|friends|reward-import|music-(?:resume|navigation|data-saver)).*\.spec\.ts$/ },
];
const normalize = value => value.replace(/\\/g, '/');
const basename = value => normalize(value).split('/').at(-1);

const BUILTINS = new Set(builtinModules.flatMap(name => name.startsWith('node:') ? [name] : [name, `node:${name}`]));

// Parse module syntax rather than guessing whether a quoted expression is static.
// An unresolved consumer anywhere can hide an edge back to the changed feature.
export function dependencyIndex(files, read) {
  const consumers = new Map();
  const unreadable = [];
  const effects = new Set();
  let packages = new Set();
  let aliases = [];
  try {
    const manifest = JSON.parse(read('package.json') ?? '{}');
    packages = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {}), ...Object.keys(manifest.optionalDependencies ?? {})]);
  } catch { unreadable.push('package.json: unreadable dependency declarations'); }
  const configSource = read('tsconfig.json');
  if (configSource != null) {
    const config = ts.parseConfigFileTextToJson('tsconfig.json', configSource);
    if (config.error) unreadable.push('tsconfig.json: unreadable path aliases');
    else aliases = Object.keys(config.config?.compilerOptions?.paths ?? {}).map(pattern =>
      new RegExp(`^${pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`));
  }
  const external = (reference, typeOnly) => {
    if (aliases.some(pattern => pattern.test(reference))) return false;
    if (BUILTINS.has(reference)) return true;
    if (/^(?:[./#]|@\/|~)/.test(reference)) return false;
    const name = reference.startsWith('@') ? reference.split('/').slice(0, 2).join('/') : reference.split('/')[0];
    const types = `@types/${name.startsWith('@') ? name.slice(1).replace('/', '__') : name}`;
    return packages.has(name) || typeOnly && packages.has(types);
  };
  const edge = (target, file) => {
    if (!consumers.has(target)) consumers.set(target, new Set());
    consumers.get(target).add(file);
  };
  for (const file of files) {
    if (!/^(?:pages|components|lib|styles)\//.test(file) || !/\.[cm]?[jt]sx?$/.test(file)) continue;
    const source = read(file);
    if (source == null) { unreadable.push(file); continue; }
    // Shared mutable state and filesystem reads still need broad coverage.
    if (/\b(?:localStorage|sessionStorage|BroadcastChannel)\b|\bdispatchEvent\s*\(|\b(?:readFileSync|readFile|readdirSync|readdir)\s*\(/.test(source)) effects.add(file);
    const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.jsx') ? ts.ScriptKind.JSX : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
    if (ast.parseDiagnostics.length) unreadable.push(`${file}: invalid module syntax`);
    const moduleReference = (expression, typeOnly = false) => {
      if (!expression || !(ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))) {
        unreadable.push(`${file}: computed module reference`);
        effects.add(file);
        return;
      }
      const reference = expression.text;
      const targets = resolve(reference, file, files);
      if (targets.length) targets.forEach(target => edge(target, file));
      else if (!external(reference, typeOnly)) unreadable.push(`${file}: unresolved module ${reference}`);
    };
    const visit = node => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const clause = node.importClause;
        const bindings = clause?.namedBindings;
        const typeOnly = node.isTypeOnly || clause?.isTypeOnly || !clause?.name && bindings && ts.isNamedImports(bindings)
          && bindings.elements.length > 0 && bindings.elements.every(item => item.isTypeOnly);
        if (node.moduleSpecifier) moduleReference(node.moduleSpecifier, !!typeOnly);
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        moduleReference(node.moduleReference.expression);
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        moduleReference(node.argument.literal, true);
      } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || ts.isIdentifier(node.expression) && node.expression.text === 'require'
        || ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)
          && (node.expression.expression.text === 'require' && node.expression.name.text === 'resolve'
            || node.expression.expression.text === 'module' && node.expression.name.text === 'require'))) {
        moduleReference(node.arguments[0]);
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    // Keep conservative filesystem/path-string edges from the existing scanner.
    for (const reference of references(source)) for (const target of resolve(reference, file, files)) {
      edge(target, file);
    }
  }
  return { consumers, unreadable, effects };
}

export function browserPlan({ changes, specs, relevant, dependencies, baselineVerified = false, forceFull = false }) {
  const inventory = [...new Set(specs.map(normalize))].sort();
  const full = reason => ({ policy: 'shadow-v1', lane: 'full', reason, baselineVerified, selected: inventory, omitted: [], domains: [], reusableCheckProof: false });
  if (forceFull) return full('Explicit full/regression request');
  if (!baselineVerified) return full('No verified green baseline');
  if (!changes.length || !inventory.length) return full('Missing change or browser inventory');
  if (CORE.some(name => !inventory.some(file => basename(file) === name))) return full('Core journey inventory is incomplete');
  const selected = new Set(inventory.filter(file => CORE.includes(basename(file))));
  const domains = new Set();
  let relevantChanges = 0;
  for (const change of changes) {
    const file = normalize(change.path);
    if (file.startsWith('docs/') || (!file.includes('/') && file.endsWith('.md'))) continue;
    if (file.startsWith('tests/browser/')) {
      // Shared fixtures can affect every browser scenario. Deleted/unknown specs fail closed.
      if (!file.endsWith('.spec.ts') || !inventory.includes(file) || change.status?.startsWith('D')) return full(`Shared or removed browser input: ${file}`);
      if (/layout-census|page-bounds|tabs\.spec|core\.spec/.test(file)) return full(`Broad browser contract: ${file}`);
      selected.add(file);
      relevantChanges++;
      continue;
    }
    const family = FAMILIES.find(item => item.code.test(file));
    if (family) {
      // Feature styles enter one global cascade; the JS reference graph cannot
      // prove selectors, variables or @imports stay inside this feature.
      if (file.endsWith('.css')) return full(`Global CSS cascade: ${file}`);
      if (!/\.(?:[cm]?[jt]sx?|css)$/.test(file)) return full(`Unclassified feature input format: ${file}`);
      if (!(dependencies?.consumers instanceof Map) || !(dependencies.effects instanceof Set) || dependencies.unreadable?.length) return full('Runtime dependency inventory is unavailable or incomplete');
      const visited = new Set([file]);
      const queue = [file];
      while (queue.length) {
        const target = queue.shift();
        if (dependencies.effects.has(target)) return full(`Global or dynamically read input: ${target}`);
        for (const consumer of dependencies.consumers.get(target) ?? []) {
          if (visited.has(consumer)) continue;
          if (!family.code.test(consumer)) return full(`Cross-feature consumer of ${file}: ${consumer}`);
          visited.add(consumer);
          queue.push(consumer);
        }
      }
      if (/cloud-account|CloudAccountPanel|pages\/api\/auth\//.test(file) && !inventory.includes('tests/browser/cloud-accounts.spec.ts')) return full('Cloud account browser contract is missing');
      const matching = inventory.filter(spec => family.specs.test(basename(spec)));
      if (!matching.length) return full(`No registered browser specs for ${family.name}`);
      matching.forEach(spec => selected.add(spec));
      domains.add(family.name);
      relevantChanges++;
      continue;
    }
    // Existing build dependency closure proves which tooling inputs are not read by browsers.
    if (file.startsWith('scripts/') && !file.startsWith('scripts/ci/') && relevant instanceof Set && !relevant.has(file)) continue;
    return full(`Shared or unclassified input: ${file}`);
  }
  if (!relevantChanges) return { policy: 'shadow-v1', lane: 'none', reason: 'Only documentation or tooling outside the browser/build dependency closure', baselineVerified, selected: [], omitted: inventory, domains: [], reusableCheckProof: false };
  return { policy: 'shadow-v1', lane: 'targeted', reason: 'Core journeys plus affected families/specifications; full CI is unchanged', baselineVerified, selected: [...selected].sort(), omitted: inventory.filter(file => !selected.has(file)), domains: [...domains].sort(), reusableCheckProof: false };
}

function main() {
  const argv = process.argv.slice(2);
  const index = argv.indexOf('--base');
  const base = argv[index + 1];
  if (index < 0 || !base || base.startsWith('-')) throw new Error('Use --base <commit/ref>; --assume-green-base is dry-run simulation only');
  const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const files = new Set(git(['ls-files']).split('\n').filter(Boolean));
  const changes = git(['diff', '--name-status', '-M', base, 'HEAD']).split('\n').filter(Boolean).flatMap(line => {
    const [status, ...paths] = line.split('\t');
    return paths.map(file => ({ status, path: file }));
  });
  const read = file => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } };
  const relevant = relevantFiles(files, read);
  const dependencies = dependencyIndex(files, read);
  const plan = browserPlan({ changes, specs: [...files].filter(file => /^tests\/browser\/.*\.spec\.ts$/.test(file)), relevant, dependencies, baselineVerified: argv.includes('--assume-green-base'), forceFull: argv.includes('--full') });
  const inventoryIndex = argv.indexOf('--inventory');
  const coverage = inventoryIndex < 0 ? undefined : coveragePlan(plan, JSON.parse(fs.readFileSync(argv[inventoryIndex + 1], 'utf8').replace(/^\uFEFF/, '')));
  console.log(JSON.stringify({ mode: 'shadow-only', base: git(['rev-parse', base]), tree: git(['rev-parse', 'HEAD^{tree}']), ...plan, coverage }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
