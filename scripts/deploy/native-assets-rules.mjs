// Desired settings only. Review/append scoped rules; never replace a zone ruleset.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function nativeAssetRules(hostname) {
  assert.ok(['assets-native.arkpedia.net', 'assets.arkpedia.net'].includes(hostname), 'Expected an explicit asset hostname');
  const host = `(http.host eq "${hostname}")`;
  const legacy = '(starts_with(http.request.uri.path, "/arkpedia/arkpedia-data/") or starts_with(http.request.uri.path, "/__ready/arkpedia-data/"))';
  const immutable = `${host} and (starts_with(http.request.uri.path, "/arkpedia/") or starts_with(http.request.uri.path, "/__ready/")) and not ${legacy}`;
  const headers = Object.fromEntries(Object.entries({
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'Content-Length, Content-Range, ETag, X-Arkpedia-Assets',
    'timing-allow-origin': '*',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'x-arkpedia-assets': 'R2-NATIVE',
  }).map(([name, value]) => [name, { operation: 'set', value }]));
  return {
    hostname,
    bucket: 'arkpedia-public-assets-direct',
    legacy_routes: [
      { pattern: `${hostname}/arkpedia/arkpedia-data/*`, script: 'arkpedia-assets' },
      { pattern: `${hostname}/__ready/arkpedia-data/*`, script: 'arkpedia-assets' },
    ],
    cors: { CORSRules: [{ AllowedOrigins: ['*'], AllowedMethods: ['GET', 'HEAD'],
      AllowedHeaders: ['Range', 'If-None-Match', 'If-Range'], ExposeHeaders: ['Content-Length', 'Content-Range', 'ETag', 'X-Arkpedia-Assets'], MaxAgeSeconds: 86400 }] },
    phases: {
      // Drop source cache-busters before the cache key is calculated. This avoids
      // relying on paid custom-cache-key features or running a Worker to normalize.
      http_request_transform: [{ ref: 'arkpedia_native_asset_queries', description: 'Normalize immutable native asset queries',
        expression: immutable, action: 'rewrite', enabled: true, action_parameters: { uri: { query: { value: '' } } } }],
      http_request_cache_settings: [{ ref: 'arkpedia_native_assets_cache', description: 'Cache native public files including JSON, atlas and skeletons',
        expression: `${immutable} and http.request.method in {"GET" "HEAD"}`, action: 'set_cache_settings', enabled: true,
        action_parameters: { cache: true, browser_ttl: { mode: 'respect_origin' }, edge_ttl: { mode: 'bypass_by_default',
          status_code_ttl: [{ status_code_range: { from: 300 }, value: -1 }] } } }],
      http_response_headers_transform: [
        { ref: 'arkpedia_native_asset_headers', description: 'Preserve the public asset response contract', expression: immutable,
          action: 'rewrite', enabled: true, action_parameters: { headers } },
        { ref: 'arkpedia_native_asset_errors', description: 'Never retain native asset errors in browsers', expression: `${immutable} and http.response.code ge 400`,
          action: 'rewrite', enabled: true, action_parameters: { headers: { 'cache-control': { operation: 'set', value: 'no-store' } } } },
      ],
    },
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(nativeAssetRules(process.argv[2]), null, 2));
}
