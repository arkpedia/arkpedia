import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planStaticRoute, STATIC_ROUTE } from '../deploy/static-asset-routes.mjs';

const routes = [
  { pattern: 'www.arkpedia.net/*', script: 'arkpedia-edge' },
  { pattern: 'arkpedia.net/*', script: 'arkpedia-edge' },
  { pattern: 'preview.arkpedia.net/*', script: 'arkpedia-edge' },
];
const version = { resources: { script_runtime: { assets: { serve_directly: true, raw_run_worker_first: false } }, bindings: [{ type: 'assets', name: 'ASSETS' }] } };
test('targets only canonical compiled assets, retaining isolated Preview and page routing', () => {
  assert.deepEqual(planStaticRoute(routes, version).desired, STATIC_ROUTE);
  assert.equal(planStaticRoute([...routes, STATIC_ROUTE], version).action, 'unchanged');
  assert.equal(routes.length, 3);
});
test('rejects destinations that invoke script before assets', () => {
  for (const assets of [undefined, {}, { serve_directly: false }, { serve_directly: true, raw_run_worker_first: true }]) {
    assert.throws(() => planStaticRoute(routes, { resources: { ...version.resources, script_runtime: { assets } } }));
  }
});
test('refuses conflicting ownership and more-specific overrides', () => {
  assert.throws(() => planStaticRoute([...routes, { ...STATIC_ROUTE, script: null }], version));
  assert.throws(() => planStaticRoute([...routes, { pattern: 'www.arkpedia.net/_next/static/chunks/*', script: 'other' }], version));
  assert.throws(() => planStaticRoute([], version));
});
test('canary is restricted to one static file and includes its query variants', () => {
  assert.equal(planStaticRoute(routes, version, '/_next/static/css/abc.css').desired.pattern, 'www.arkpedia.net/_next/static/css/abc.css*');
  for (const path of ['/api/auth', '/_next/static/*', '/_next/static/../data/x.js', '/_next/static/a.js?x=1', '//example.com/a.js']) {
    assert.throws(() => planStaticRoute(routes, version, path));
  }
});
