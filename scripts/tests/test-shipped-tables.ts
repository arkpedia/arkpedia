import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { build } from 'esbuild';
import { SHIPPED_TABLES, readShippedTable } from '../../lib/content/shippedTable';
import { SHIPPED, shipTables } from '../build/ship-tables.mjs';

/* The Worker reads these tables from its static files rather than compiling them into handler.mjs
   (lib/content/shippedTable.ts): regional-schedules.json was 3.45 MB of a 20.48 MB bundle. */

const tempRoot = (files: Record<string, string>) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-shipped-'));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
};

test('a shipped table is read from data/ where it is on disk, and from the static files where it is not', async () => {
  const asked: string[] = [];
  const assets = { fetch: async (request: Request) => { asked.push(new URL(request.url).pathname); return new Response('{"from":"assets"}', { status: 200 }); } };
  const onDisk = tempRoot({ 'data/regional-schedules.json': '{"from":"disk"}' });
  assert.deepEqual(await readShippedTable('regional-schedules.json', { root: onDisk, assets }), { from: 'disk' });
  assert.deepEqual(asked, [], 'prerendering and the export never ask the binding');
  const worker = tempRoot({});
  assert.deepEqual(await readShippedTable('regional-schedules.json', { root: worker, assets }), { from: 'assets' });
  assert.deepEqual(asked, ['/_tables/regional-schedules.json']);
  const missing = { fetch: async () => new Response('', { status: 404 }) };
  await assert.rejects(readShippedTable('regional-schedules.json', { root: worker, assets: missing }), /HTTP 404/);
});

test('the build copies exactly the tables the reader names into public/_tables, which git ignores', () => {
  assert.deepEqual([...SHIPPED].sort(), [...SHIPPED_TABLES].sort());
  const root = tempRoot(Object.fromEntries(SHIPPED.map(file=>[`data/${file}`,file==='regional-schedules.json'?'{"version":1,"servers":{}}':'[]'])));
  assert.deepEqual(shipTables(root), SHIPPED.map(file=>`public/_tables/${file}`));
  assert.equal(fs.readFileSync(path.join(root, 'public/_tables/regional-schedules.json'), 'utf8'), '{"version":1,"servers":{}}');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  for(const builder of ['build-operator-search.ts','build-community-stage-catalogue.ts'])assert.ok(pkg.scripts['generate:public'].indexOf(builder)<pkg.scripts['generate:public'].indexOf('ship-tables.mjs'),'generate catalogues before shipping them');
  assert.ok(fs.readFileSync('.gitignore', 'utf8').split('\n').includes('/public/_tables/'));
});

test("the Worker's build leaves the regional table out of the server code", () => {
  const source = fs.readFileSync('lib/time/regionalServer.ts', 'utf8');
  assert.doesNotMatch(source, /^import [^\n]*@\/data\/regional-schedules\.json/m, 'no static import: webpack would compile it in everywhere');
  assert.match(source, /process\.env\.ARKPEDIA_WORKER === '1'\s*\?\s*readShippedTable/, 'the constant is tested at the call site, the import in the other branch');
});

test('production compilation leaves community catalogues and the Preview snapshot out of Worker code',async()=>{
  for(const preview of ['', '1']){
    const result=await build({entryPoints:['lib/community/catalogues.ts','lib/community/preview-statistics.ts','lib/music/youtubeContextServer.ts'],
      bundle:true,write:false,outdir:'.cache/shipped-table-test',platform:'node',format:'esm',packages:'external',metafile:true,
      define:{'process.env.ARKPEDIA_WORKER':'"1"','process.env.ARKPEDIA_PREVIEW':JSON.stringify(preview)}});
    const inputs=Object.keys(result.metafile!.inputs);
    assert.ok(!inputs.some(file=>/data\/(?:community-.*|account)-catalogue\.json$/.test(file)),'catalogues come from ASSETS');
    assert.ok(!inputs.some(file=>file.endsWith('lib/music/youtubeContextLocal.ts') || /data\/(?:skins|skin-availability-windows|skin-shop-rotations)\.json$/.test(file)), 'video relevance reads published records; local source fallbacks stay out of the Worker');
    assert.equal(inputs.some(file=>file.endsWith('config/preview-community-statistics.json')),preview==='1','only Preview compiles its snapshot');
  }
});
