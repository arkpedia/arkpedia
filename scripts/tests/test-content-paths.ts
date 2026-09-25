import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pageFilePath, isContentPagePath, contentFileUrlPath } from '../../lib/content/pagePaths.mjs';

test('page files follow routes and preserve readable names', () => {
  assert.equal(pageFilePath('/'), 'pages/index.json');
  assert.equal(pageFilePath('/recruitment'), 'pages/recruitment.json');
  assert.equal(pageFilePath('/recruitment/popout'), 'pages/recruitment/popout.json');
  assert.equal(pageFilePath('/operators/Thorns%20the%20Lodestar'), 'pages/operators/Thorns the Lodestar.json');
  assert.equal(pageFilePath('/operators/Wi%C5%A1%27adel'), "pages/operators/Wiš'adel.json");
});

test('unsafe filename characters are escaped without merging distinct routes', () => {
  const routes = ['/operators/A%2FB', '/operators/A/B', '/operators/A%252FB', '/operators/A%3FB', '/operators/A%23B', '/operators/A%25B'];
  const files = routes.map(pageFilePath);
  assert.equal(new Set(files).size, routes.length);
  for (const file of files) {
    assert.ok(isContentPagePath(file));
    assert.equal(decodeURIComponent(contentFileUrlPath(file)), file);
  }
  for (const route of ['relative', '/a//b', '/a/..', '/a/%2e%2e', '/a/%00', '/a?b', '/a\\b', '/a/%ZZ']) {
    assert.throws(() => pageFilePath(route));
  }
  for (const file of ['../page.json', 'pages/../page.json', 'pages//page.json', 'pages/a?b.json', 'pages/a\\b.json']) {
    assert.equal(isContentPagePath(file), false);
  }
});

test('every top-level public record the app ships is read by something', () => {
  // export.mjs publishes each of these as a source record in every release. One nothing reads
  // is dead weight that looks like data: public/lyrics-index.json was '{}' for its whole life.
  const tracked = execFileSync('git', ['ls-files', '-z', 'public'], { encoding: 'utf8' }).split('\0')
    .filter(file => /^public\/[^/]+\.json$/.test(file) && fs.existsSync(file));
  const readers = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const at = path.join(dir, entry.name);
    if (entry.isDirectory()) return at === path.join('scripts', 'tests') ? [] : readers(at);
    // Hydration copies every source record and names only the ones it retires.
    if (at === path.join('scripts', 'content', 'hydrate-source.mjs')) return [];
    return /\.(?:ts|tsx|mjs|cjs|js|py|sh)$/.test(entry.name) ? [at] : [];
  });
  const code = ['lib', 'pages', 'components', 'scripts'].flatMap(readers).map(file => fs.readFileSync(file, 'utf8')).join('\n');
  for (const file of tracked) assert.ok(code.includes(path.basename(file)), `${file} is shipped and published, but no code reads it`);
  // Hydration would write the retired file back from arkpedia-data's source, and the next
  // release would publish it again.
  assert.match(fs.readFileSync('scripts/content/hydrate-source.mjs', 'utf8'), /deprecatedSourceFiles = new Set\(\[[^\]]*'public\/lyrics-index\.json'/);
});
