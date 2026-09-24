import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

/*
 * A root-relative asset path ('/enemies-icons/x.webp') is not served by the site:
 * next.config.js 307s it to the asset commit pinned by the LAST DEPLOY. Pages are
 * rendered from the content release, which moves every day without a deploy, so art
 * added since the deploy exists at the release pin and 404s at the deploy pin. The
 * stage map's enemy markers showed that as blank discs for the nineteen People, A
 * People enemies while the same icons rendered fine in the list beside them.
 *
 * ContentImage / ContentImg rewrite a path to the release pin. An SVG <image> or a
 * plain next/image gets no rewriting, so it must call the useContentUrl() helper
 * itself. This walks every client component and page for the three ways around it.
 */
const ROOT = process.cwd();
const HELPER = path.join('components', 'content', 'ContentImage.tsx');

function sources(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(file);
    return entry.name.endsWith('.tsx') && file !== HELPER ? [file] : [];
  });
}

interface Scan { violations: string[]; svgImages: number }

function scan(file: string, text: string): Scan {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: string[] = [];
  let svgImages = 0;
  const where = (node: ts.Node) => `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  // The names this file binds to the release-aware helper: `const url = useContentUrl()`.
  const helpers = new Set<string>();
  const collect = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
      && ts.isCallExpression(node.initializer) && ts.isIdentifier(node.initializer.expression)
      && node.initializer.expression.text === 'useContentUrl') helpers.add(node.name.text);
    node.forEachChild(collect);
  };
  collect(source);
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === 'next/image') {
      violations.push(`${where(node)} imports next/image; use @/components/content/ContentImage`);
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (tag === 'img') violations.push(`${where(node)} renders <img>; use ContentImg`);
      if (tag === 'image') {
        svgImages++;
        const href = node.attributes.properties.find((attribute): attribute is ts.JsxAttribute =>
          ts.isJsxAttribute(attribute) && ['href', 'xlinkHref'].includes(attribute.name.getText(source)));
        const value = href?.initializer && ts.isJsxExpression(href.initializer) ? href.initializer.expression : undefined;
        const pinned = value && ts.isCallExpression(value) && ts.isIdentifier(value.expression) && helpers.has(value.expression.text);
        if (!pinned) violations.push(`${where(node)} <image> href must be wrapped in the useContentUrl() helper`);
      }
    }
    node.forEachChild(visit);
  };
  visit(source);
  return { violations, svgImages };
}

test('the scan recognises every way an image can bypass the content release pin', () => {
  const component = (body: string, header = '') => `${header}
    import { useContentUrl } from '@/lib/content/context';
    export default function Fixture({ icon }: { icon: string }) {
      const url = useContentUrl();
      return <svg>${body}</svg>;
    }`;
  assert.deepEqual(scan('ok.tsx', component('<image href={url(icon)} />')).violations, []);
  for (const [label, text] of [
    ['bare expression', component('<image href={icon} />')],
    ['string literal', component('<image href="/ra-map/weather-normal.webp" />')],
    ['template literal', component('<image href={`/ra-map/node/${icon}.webp`} />')],
    ['some other call', component('<image href={encodeURI(icon)} />')],
    ['xlink spelling', component('<image xlinkHref={icon} />')],
    ['native img', component('<img src={icon} alt="" />')],
    ['next/image', component('<Image src={icon} alt="" />', "import Image from 'next/image';")],
  ]) assert.equal(scan('bad.tsx', text).violations.length, 1, label);
});

test('client components and pages route every image through the content release pin', () => {
  const files = ['components', 'pages', 'lib'].flatMap(dir => sources(dir));
  // Not vacuous: the stage map's markers and the RA map are SVG images, and are scanned.
  assert.ok(files.includes(path.join('pages', 'stages', 'browse.tsx')));
  assert.ok(files.includes(path.join('components', 'stages', 'RaMap.tsx')));
  let svgImages = 0;
  const violations = files.flatMap(file => {
    const result = scan(file, fs.readFileSync(path.join(ROOT, file), 'utf8'));
    svgImages += result.svgImages;
    return result.violations;
  });
  assert.ok(svgImages >= 6, `expected the stage and RA map <image> elements, found ${svgImages}`);
  assert.deepEqual(violations, []);
});
