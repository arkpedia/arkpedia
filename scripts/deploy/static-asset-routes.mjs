#!/usr/bin/env node
// Explicit route-only operation. Never deploys application code, DNS or storage.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const ACCOUNT = '1ff51c10571eaa9934bc451e1bfdb361';
export const ZONE = '3765378b374f124c6f06cffdcd3ac01e';
export const STATIC_ROUTE = { pattern: 'www.arkpedia.net/_next/static/*', script: 'arkpedia' };
const ORIGIN = 'https://www.arkpedia.net';
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

export function planStaticRoute(routes, version, path) {
  const assets = version?.resources?.script_runtime?.assets;
  requireValue(assets?.serve_directly === true && assets.raw_run_worker_first === false,
    'Application must serve native assets before invoking its script');
  requireValue(version.resources.bindings.some(b => b.type === 'assets' && b.name === 'ASSETS'), 'Missing native assets binding');
  requireValue(routes.some(r => r.pattern === 'www.arkpedia.net/*' && r.script === 'arkpedia-edge'), 'Unexpected canonical front router');
  requireValue(!path || /^\/_next\/static\/[A-Za-z0-9_./-]+\.(?:js|css|woff2?)$/.test(path)
    && !path.includes('..') && !path.includes('//'), 'Canary must be one concrete Next static file');
  const desired = path ? { ...STATIC_ROUTE, pattern: `www.arkpedia.net${path}*` } : STATIC_ROUTE;
  const existing = routes.find(r => r.pattern === desired.pattern);
  requireValue(!existing || existing.script === desired.script, 'Refusing to replace a route owned by another destination');
  // A longer rule could bypass our chosen destination. Require manual review instead.
  requireValue(!routes.some(r => r.pattern.startsWith('www.arkpedia.net/_next/static/')
    && r.pattern !== desired.pattern && r.pattern !== STATIC_ROUTE.pattern), 'Unexpected more-specific static route');
  return { action: existing ? 'unchanged' : 'create', desired, existing };
}

function apiClient(token) {
  requireValue(token, 'Set CLOUDFLARE_API_TOKEN to a Workers Routes credential');
  return async (path, method = 'GET', body) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30_000),
    });
    const data = await response.json();
    requireValue(response.ok && data.success, `Cloudflare ${method} ${path} failed (${response.status})`);
    return data.result;
  };
}

async function sample(path, init = {}) {
  const response = await fetch(`${ORIGIN}${path}`, { ...init, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
  const body = new Uint8Array(await response.arrayBuffer());
  return {
    status: response.status, sha256: createHash('sha256').update(body).digest('hex'),
    headers: Object.fromEntries(['content-type', 'cache-control', 'etag', 'content-range', 'access-control-allow-origin',
      'x-content-type-options', 'strict-transport-security'].map(key => [key, response.headers.get(key)])),
  };
}

export async function main(args = process.argv.slice(2), token = process.env.CLOUDFLARE_API_TOKEN) {
  const [action = 'plan', snapshotPath, canary] = args;
  requireValue(['plan', 'apply', 'rollback'].includes(action), 'Use plan, apply SNAPSHOT [CANARY_PATH], or rollback SNAPSHOT');
  const api = apiClient(token);
  const routeUrl = `/zones/${ZONE}/workers/routes`;
  if (action === 'rollback') {
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
    requireValue(snapshot.account === ACCOUNT && snapshot.zone === ZONE && snapshot.created?.script === 'arkpedia'
      && snapshot.created.pattern.startsWith('www.arkpedia.net/_next/static/'), 'Invalid route snapshot');
    const current = (await api(routeUrl)).find(r => r.id === snapshot.created.id);
    requireValue(!current || current.pattern === snapshot.created.pattern && current.script === snapshot.created.script,
      'Route changed since apply; refusing rollback');
    if (current) await api(`${routeUrl}/${current.id}`, 'DELETE');
    console.log('Removed only the recorded static route; front router handles these files again.');
    return;
  }
  const workerUrl = `/accounts/${ACCOUNT}/workers/scripts/arkpedia`;
  const deployments = (await api(`${workerUrl}/deployments`)).deployments;
  const current = deployments.sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on))[0];
  requireValue(current?.versions?.length === 1 && current.versions[0].percentage === 100, 'Expected one fully deployed application version');
  const version = await api(`${workerUrl}/versions/${current.versions[0].version_id}`);
  const routes = await api(routeUrl);
  const plan = planStaticRoute(routes, version, canary);
  console.log(JSON.stringify({ ...plan, version: version.id }, null, 2));
  if (action !== 'apply' || plan.action === 'unchanged') return;
  requireValue(snapshotPath, 'A new snapshot file is required for apply');
  const html = await (await fetch(ORIGIN, { signal: AbortSignal.timeout(30_000) })).text();
  const paths = canary ? [canary] : [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+)[^"]*"/g)].map(m => m[1]))];
  requireValue(paths.length > 0, 'No current static files found');
  const probes = paths.flatMap(path => [{ path, init: {} }, { path: `${path}?route-check=1`, init: {} },
    { path, init: { method: 'HEAD' } }, { path, init: { headers: { Range: 'bytes=0-31' } } }]);
  const before = [];
  for (const probe of probes) {
    const result = await sample(probe.path, probe.init);
    requireValue([200, 206].includes(result.status), `Unhealthy asset before routing: ${probe.path}`);
    before.push(result);
  }
  const snapshot = { account: ACCOUNT, zone: ZONE, observedAt: new Date().toISOString(), version: version.id, routes, desired: plan.desired, probes, before };
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), { flag: 'wx', mode: 0o600 });
  // Recheck immediately before the single mutation; never overwrite another route.
  requireValue(planStaticRoute(await api(routeUrl), version, canary).action === 'create', 'Routing changed during checks');
  const latest = (await api(`${workerUrl}/deployments`)).deployments.sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on))[0];
  requireValue(latest?.id === current.id, 'Application deployment changed during checks; rerun against its assets');
  snapshot.created = await api(routeUrl, 'POST', plan.desired);
  try {
    await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
    const after = [];
    for (let i = 0; i < probes.length; i++) {
      const result = await sample(probes[i].path, probes[i].init);
      requireValue(JSON.stringify(result) === JSON.stringify(before[i]), `Asset content/headers changed: ${probes[i].path}`);
      after.push(result);
    }
    snapshot.after = after;
    await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
    console.log(`Verified ${probes.length} asset GET/query/HEAD/range responses. Route ${snapshot.created.id}.`);
  } catch (error) {
    const actual = (await api(routeUrl)).find(r => r.id === snapshot.created.id);
    requireValue(!actual || actual.pattern === plan.desired.pattern && actual.script === plan.desired.script,
      'Route changed during verification; manual recovery required');
    if (actual) await api(`${routeUrl}/${actual.id}`, 'DELETE');
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
