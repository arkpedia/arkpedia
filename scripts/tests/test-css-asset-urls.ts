import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

/*
 * A root-relative asset path is served by a redirect in next.config.js to the asset
 * commit pinned by the LAST DEPLOY, while pages render the content release's art. A
 * stylesheet's url() can only ever name such a path, so the stage map's fullscreen
 * cursor and the Score page's main-story emblem followed the deploy's pin (6058775)
 * after the release had moved to a9888580 (sweep 2026-09-24, §3.7). Art in CSS comes
 * from the component instead: useContentUrl() and cssUrl(), handed over as a custom
 * property (--line-bg, --score-emblem, --stage-cursor).
 *
 * The folders are read from the redirects themselves, so a folder added there is
 * covered here. Stylesheets are scanned whole, minus comments; code only in its string
 * and template literals, where an inline style would spell one.
 */
type Redirect = { source: string; destination: string };
const ROOT = process.cwd();
const require = createRequire(import.meta.url);

async function pinnedFolders(): Promise<string[]> {
  const config = require('../../next.config.js')('phase-test') as { redirects(): Promise<Redirect[]> };
  return (await config.redirects())
    .filter(redirect => /^https:\/\//.test(redirect.destination))
    .map(redirect => redirect.source.match(/^(\/[^/:]+\/)/)?.[1])
    .filter((folder): folder is string => Boolean(folder));
}

/** The start of a root-relative url(): the folder is all that decides. */
const URL_CALL = /url\(\s*['"]?(\/(?!\/)[^'")\s]+)/g;

export function cssViolations(file: string, text: string, folders: string[]): string[] {
  const css = text.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ' '));
  return [...css.matchAll(URL_CALL)]
    .filter(match => folders.some(folder => match[1].startsWith(folder)))
    .map(match => `${file}:${css.slice(0, match.index).split('\n').length} ${match[0]}`);
}

export function codeViolations(file: string, text: string, folders: string[]): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      for (const hit of cssViolations(file, node.text, folders)) found.push(`${file}:${line} ${hit.slice(hit.indexOf(' ') + 1)}`);
    }
    node.forEachChild(visit);
  };
  visit(source);
  return found;
}

function files(dir: string, pattern: RegExp): string[] {
  if (!fs.existsSync(path.join(ROOT, dir))) return [];
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(file, pattern);
    return pattern.test(entry.name) ? [file] : [];
  });
}

test('the redirected asset folders include the ones stylesheets used', async () => {
  const folders = await pinnedFolders();
  for (const folder of ['/cursors/', '/story-marks/', '/six-star-icons/', '/six-star-skins/', '/skin-variants/', '/skin-originals/']) {
    assert.ok(folders.includes(folder), `${folder} is not a redirected folder: ${folders.join(' ')}`);
  }
});

test('the scan finds every spelling of a redirected asset in CSS and in code', () => {
  const folders = ['/cursors/', '/story-marks/'];
  for (const text of [
    "a { cursor: url('/cursors/prts.png') 6 5, default; }",
    'a { mask-image: url(/story-marks/main-story.webp); }',
    'a { background: url( "/story-marks/x y.webp" ); }',
  ]) assert.equal(cssViolations('x.css', text, folders).length, 1, text);
  for (const text of [
    '/* url(/story-marks/old.webp) */ a { mask-image: var(--score-emblem); }',
    'a { background: url("data:image/svg+xml,<svg/>"); }',
    'a { background: url(/fonts/x.woff2); }',
    'a { background: url(//cdn.example/story-marks/x.webp); }',
  ]) assert.deepEqual(cssViolations('x.css', text, folders), [], text);
  assert.equal(codeViolations('x.tsx', "const s = { backgroundImage: 'url(/story-marks/a.webp)' };", folders).length, 1);
  assert.equal(codeViolations('x.tsx', 'const s = { maskImage: `url(/cursors/${name}.png)` };', folders).length, 1);
  assert.deepEqual(codeViolations('x.tsx', '// url(/story-marks/a.webp)\nconst s = cssUrl(url(mark));', folders), []);
});

test('no stylesheet or inline style names art by a path that follows the deploy pin', async () => {
  const folders = await pinnedFolders();
  const stylesheets = [...files('styles', /\.css$/), ...files('components', /\.css$/), ...files('pages', /\.css$/)];
  const code = ['components', 'pages', 'lib'].flatMap(dir => files(dir, /\.tsx?$/));
  // Not vacuous: the stage and terminal stylesheets are the ones that did this.
  assert.ok(stylesheets.includes(path.join('styles', 'stages', 'stages.css')));
  assert.ok(stylesheets.includes(path.join('styles', 'stages', 'stages-terminal.css')));
  const violations = [
    ...stylesheets.flatMap(file => cssViolations(file, fs.readFileSync(path.join(ROOT, file), 'utf8'), folders)),
    ...code.flatMap(file => codeViolations(file, fs.readFileSync(path.join(ROOT, file), 'utf8'), folders)),
  ];
  assert.deepEqual(violations, []);
});
