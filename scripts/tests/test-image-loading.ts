import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import ContentImage, { ContentImg } from '../../components/content/ContentImage';
import ResponsiveSkinArtwork from '../../components/skins/ResponsiveSkinArtwork';

/*
 * Images load as the reader nears them (lazy-images, 2026-09-29; the maintainer: "can you
 * implement lazy loading for all, like operators don't have lazy loading"). ContentImg was
 * a native <img> that stayed eager unless its caller said "lazy", and seven callers had
 * not: /operators/Amiya fetched eight icons from one to five screens down at load. Now:
 *   - ContentImg and ContentImage (next/image) are lazy, and ContentImg decodes off the
 *     main thread, with no `loading` prop to turn that off; `priority` is the one way to
 *     fetch at once, and it asks for the image first (fetchpriority="high");
 *   - every `priority` in the source is a page's hero, named in PRIORITY with its reason,
 *     so a new one is a decision someone wrote down, and a gone one leaves a stale entry;
 *   - a native <img> anywhere but components/content says how it loads.
 * The rendered half is the layout census's image-loading check (tests/browser/
 * layout-checks.ts, EAGER_ALLOWED): at each page's load, only its hero is eager.
 */

(globalThis as { React?: typeof React }).React = React;
const ROOT = path.join(__dirname, '../..');
const render = (type: unknown, props: Record<string, unknown>) => renderToStaticMarkup(createElement(type as never, props as never));
const attr = (html: string, name: string) => html.match(new RegExp(`<img[^>]* ${name}="([^"]*)"`, 'i'))?.[1];

test('ContentImg is lazy and decodes off the main thread, and nothing a caller spreads in changes that', () => {
  const plain = render(ContentImg, { src: '/material-icons/Orundum.webp', alt: '', width: 28, height: 28 });
  assert.equal(attr(plain, 'loading'), 'lazy');
  assert.equal(attr(plain, 'decoding'), 'async');
  assert.equal(attr(plain, 'fetchpriority'), undefined);
  // The type has no `loading`; a cast past it still gets the lazy default.
  const forced = render(ContentImg, { src: '/material-icons/Orundum.webp', alt: '', loading: 'eager', decoding: 'sync' });
  assert.equal(attr(forced, 'loading'), 'lazy');
  assert.equal(attr(forced, 'decoding'), 'async');
});

test('priority is the one way to fetch at once, and it asks for the image first', () => {
  const hero = render(ContentImg, { src: '/five-star-skins/Amiya - Base.webp', alt: 'Amiya', priority: true });
  assert.equal(attr(hero, 'loading'), 'eager');
  assert.equal(attr(hero, 'fetchpriority'), 'high');
  assert.doesNotMatch(hero, / priority=/, 'the prop is not written out as an attribute');
  const art = { src: '/five-star-skins/Amiya - Base.webp', alt: 'Amiya', fill: true, sizes: '40vw' };
  assert.equal(attr(render(ResponsiveSkinArtwork, art), 'loading'), 'lazy', 'the skin artwork is lazy');
  assert.equal(attr(render(ResponsiveSkinArtwork, { ...art, priority: true }), 'loading'), 'eager', 'and passes priority through');
  assert.equal(attr(render(ResponsiveSkinArtwork, { ...art, priority: true }), 'fetchpriority'), 'high');
});

test('ContentImage (next/image) is lazy unless priority', () => {
  // unoptimized, as next.config.js sets for the site (outside Next, the config is not read).
  const props = { src: '/material-icons/Orundum.webp', alt: '', width: 28, height: 28, unoptimized: true };
  assert.equal(attr(render(ContentImage, props), 'loading'), 'lazy');
  const hero = render(ContentImage, { ...props, priority: true });
  assert.notEqual(attr(hero, 'loading'), 'lazy');
  assert.equal(attr(hero, 'fetchpriority'), 'high');
});

/** Every `priority` on an image in the source, by file: each a page's hero, and why. */
const PRIORITY: Record<string, { count: number; why: string }> = {
  'pages/operators/[name].tsx': { count: 1, why: 'the outfit on screen: the operator page\'s LCP' },
  'components/skins/ResponsiveSkinArtwork.tsx': { count: 2, why: 'forwards its own `priority` prop to the <img>, in both of its branches' },
  'components/schedule/EventsPanel.tsx': { count: 1, why: 'the first event slide: the home page\'s LCP at 1440 (only while it is the slide shown)' },
  'components/home/GachaBannersPanel.tsx': { count: 1, why: 'the first banner: the home page\'s LCP at 390 (only while it is the banner shown)' },
  'pages/gacha.tsx': { count: 1, why: 'the chosen banner\'s art: /gacha\'s LCP at 1440 and 390' },
  'pages/stages/index.tsx': { count: 1, why: 'the event the Terminal leads with: /stages\' LCP' },
};

const IMAGE_MODULES = /(?:^|\/)components\/(?:content\/ContentImage|skins\/ResponsiveSkinArtwork)$/;

function sources(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(file);
    return entry.name.endsWith('.tsx') ? [file.split(path.sep).join('/')] : [];
  });
}

/** What a file does with images: its `priority` count, and what breaks the rules. */
function scan(file: string, text: string): { priority: number; violations: string[] } {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const where = (node: ts.Node) => `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  const images = new Set<string>();
  const violations: string[] = [];
  let priority = 0;
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && IMAGE_MODULES.test(node.moduleSpecifier.text.replace(/^@\//, ''))) {
      const clause = node.importClause;
      if (clause?.name) images.add(clause.name.text);
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) if ((element.propertyName ?? element.name).text === 'ContentImg') images.add(element.name.text);
      }
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      const named = (name: string) => node.attributes.properties.some((a) => ts.isJsxAttribute(a) && a.name.getText(source) === name);
      if (tag === 'img' && !file.startsWith('components/content/') && !named('loading')) {
        violations.push(`${where(node)} renders a native <img> without a loading attribute; render ContentImg (lazy unless priority)`);
      }
      if (images.has(tag)) {
        if (named('loading')) violations.push(`${where(node)} gives <${tag}> a loading; an image is lazy, or its page's hero (priority)`);
        if (node.attributes.properties.some(ts.isJsxSpreadAttribute)) violations.push(`${where(node)} spreads props into <${tag}>; pass them by name, so a priority cannot arrive unseen`);
        if (named('priority')) priority++;
      }
    }
    node.forEachChild(visit);
  };
  visit(source);
  return { priority, violations };
}

test('the scan finds a native <img> that does not say how it loads, and every priority', () => {
  const fixture = (body: string, header = "import Image, { ContentImg } from '@/components/content/ContentImage';") => `${header}\nexport default function F() { return <div>${body}</div>; }`;
  assert.equal(scan('components/x.tsx', fixture('<img src="/a.webp" alt="" />')).violations.length, 1, 'a native img with no loading');
  assert.deepEqual(scan('components/x.tsx', fixture('<img src="/a.webp" alt="" loading="lazy" />')).violations, []);
  assert.deepEqual(scan('components/content/x.tsx', fixture('<img src="/a.webp" alt="" />')).violations, [], 'the helper renders the one native img');
  assert.equal(scan('components/x.tsx', fixture('<ContentImg src="/a.webp" loading="eager" />')).violations.length, 1, 'a loading on ContentImg');
  assert.equal(scan('components/x.tsx', fixture('<Image src="/a.webp" {...rest} />')).violations.length, 1, 'a spread into an image');
  assert.equal(scan('components/x.tsx', fixture('<Image src="/a.webp" priority /><ContentImg src="/b.webp" priority={first} /><Art src="/c.webp" priority />', "import Image, { ContentImg as Img } from '@/components/content/ContentImage';\nimport Art from '@/components/skins/ResponsiveSkinArtwork';")).priority, 2, 'renamed and wrapped imports are followed; an unrelated ContentImg name is not');
});

test('every image on the site is lazy but a page\'s hero, and each hero is written down', () => {
  const files = ['pages', 'components', 'lib'].flatMap(sources);
  assert.ok(files.includes('components/content/ContentImage.tsx') && files.includes('pages/operators/[name].tsx'), 'the scan reads the source');
  const found: Record<string, number> = {};
  const violations: string[] = [];
  for (const file of files) {
    const result = scan(file, fs.readFileSync(path.join(ROOT, file), 'utf8'));
    violations.push(...result.violations);
    if (result.priority) found[file] = result.priority;
  }
  assert.deepEqual(violations, []);
  assert.deepEqual(found, Object.fromEntries(Object.entries(PRIORITY).map(([file, { count }]) => [file, count])),
    'a `priority` is a page\'s hero: add a new one to PRIORITY with its reason (and to EAGER_ALLOWED in tests/browser/layout-checks.ts), or drop it; a hero no longer marked is a stale entry');
});
