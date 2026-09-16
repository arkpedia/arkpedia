import assert from 'node:assert/strict';
import test from 'node:test';
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
