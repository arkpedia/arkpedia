import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bundledMediaMap } from '../build/bundled-media-map.mjs';
import { mediaRevision, validateMediaDelivery, MAX_MEDIA_DELIVERY_BYTES } from '../../lib/assets/mediaDelivery.mjs';
const repo='arkpedia-l2d-assets', old='a'.repeat(40), current='b'.repeat(40), base='c'.repeat(40), physical='d'.repeat(40);
const entrances={baseUrl:`https://assets.arkpedia.net/arkpedia/${repo}/${old}/`,entries:[{folder:'event-transitions/players/cn/act50side/abcdef123456'}]};
const native={version:1,baseRevision:base,overrides:{
  'event-transitions/players/cn/act50side/abcdef123456':physical,
  'event-transitions/players/cn/act50side/abcdef123456/audio':physical,
  'event-transitions/runtime':old,
  'models/unrelated/123456abcdef':old,
}};
test('entrance-only projection preserves all event paths, nested assets and shared runtime targets',()=>{
  const compact=bundledMediaMap(repo,old,native,{entrances,fullReferences:new Set()});
  const before={[repo]:{[old]:native}},after={[repo]:{[old]:compact}};
  for(const file of ['event-transitions/players/cn/act50side/abcdef123456/scene.json','event-transitions/players/cn/act50side/abcdef123456/audio/entrance.mp3','event-transitions/runtime/player.js','event-transitions/players/en/other/hash/scene.json']){
    assert.equal(mediaRevision(after,repo,old,file),mediaRevision(before,repo,old,file));
  }
  assert.ok(!Object.hasOwn(compact.overrides,'models/unrelated/123456abcdef')); 
  assert.equal(compact.baseRevision,native.baseRevision);
});
test('broad game-data use, other revisions and unrecognized catalogue layouts retain complete maps',()=>{
  const fullReferences=new Set([`${repo}/${old}`]);
  assert.equal(bundledMediaMap(repo,old,native,{entrances,fullReferences}),native);
  assert.equal(bundledMediaMap(repo,current,native,{entrances,fullReferences:new Set()}),native);
  for(const catalogue of [{baseUrl:entrances.baseUrl},{...entrances,entries:[]},{...entrances,entries:[{folder:'models/operator/hash'}]},{...entrances,entries:[{folder:'event-transitions/../models'}]}]){
    assert.equal(bundledMediaMap(repo,old,native,{entrances:catalogue,fullReferences:new Set()}),native);
  }
});
test('duplicate historical model mappings can be omitted without raising the combined 64 KB limit',()=>{
  const oldMap={...native,overrides:{...native.overrides,...Object.fromEntries(Array.from({length:470},(_,i)=>[`models/char_${i}/abcdef123456`,physical]))}};
  const currentMap={...oldMap,baseRevision:physical};
  const original={[repo]:{[old]:oldMap,[current]:currentMap}};
  assert.ok(Buffer.byteLength(JSON.stringify(original))>MAX_MEDIA_DELIVERY_BYTES);
  assert.throws(()=>validateMediaDelivery(original),/size/);
  const compact={[repo]:{[old]:bundledMediaMap(repo,old,oldMap,{entrances,fullReferences:new Set([`${repo}/${current}`])}),[current]:currentMap}};
  validateMediaDelivery(compact);
  assert.ok(Buffer.byteLength(JSON.stringify(compact))<MAX_MEDIA_DELIVERY_BYTES);
  assert.deepEqual(compact[repo][current],currentMap);
});
test('malformed readiness is rejected even when its unused fields would be omitted',()=>{
  assert.throws(()=>bundledMediaMap(repo,old,{...native,overrides:{...native.overrides,'../bad':physical}},{entrances,fullReferences:new Set()}),/Invalid/);
  assert.throws(()=>bundledMediaMap(repo,old,{...native,unexpected:true},{entrances,fullReferences:new Set()}),/Invalid/);
});

test('the real build loader scopes an independent entrance revision but never drops catalogue mappings',async t=>{
  const {mkdtemp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const {fileURLToPath,pathToFileURL}=await import('node:url');const {execFileSync}=await import('node:child_process');
  const root=await mkdtemp(join(tmpdir(),'bundled-media-limit-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'data/assets'),{recursive:true});await mkdir(join(root,'config'));
  await writeFile(join(root,'data/assets/revisions.json'),JSON.stringify({'arkpedia-image-assets':old}));
  const dynamic={url:`https://raw.githubusercontent.com/arkpedia/${repo}/${current}/models/char_0/abcdef123456/model.json`};
  await writeFile(join(root,'data/dynamic-art.json'),JSON.stringify(dynamic));
  for(const file of ['chibi-art','medal-set-layouts'])await writeFile(join(root,`data/${file}.json`),'{}');
  await writeFile(join(root,'config/event-entrances.json'),JSON.stringify(entrances));
  await writeFile(join(root,'config/community-project-art.json'),JSON.stringify({repository:'arkpedia-image-assets',revision:old}));
  await writeFile(join(root,'config/pull-poll-art.json'),'{}');
  const large={...native,overrides:{...native.overrides,...Object.fromEntries(Array.from({length:470},(_,i)=>[`models/char_${i}/abcdef123456`,physical]))}};
  const mock=join(root,'readiness.mjs');
  await writeFile(mock,`globalThis.fetch=async input=>{const [,repository,revision]=String(input).match(/\\/__ready\\/([^/]+)\\/([a-f0-9]{40})$/);return new Response(JSON.stringify({version:1,repository,revision,...(repository===${JSON.stringify(repo)}?{native:${JSON.stringify(large)}}:{})}));};`);
  const run=()=>execFileSync(process.execPath,['--import',pathToFileURL(mock).href,fileURLToPath(new URL('../build/load-media-delivery.mjs',import.meta.url))],{cwd:root,env:{...process.env,ARKPEDIA_CONTENT_DISABLED:'0'},encoding:'utf8',stdio:'pipe'});
  run();const maps=JSON.parse(await readFile(join(root,'.cache/native-media-delivery.json'),'utf8'));
  assert.ok(Buffer.byteLength(JSON.stringify(maps))<MAX_MEDIA_DELIVERY_BYTES);
  assert.ok(Object.hasOwn(maps[repo][current].overrides,'models/char_0/abcdef123456'));
  assert.equal(mediaRevision(maps,repo,old,`${entrances.entries[0].folder}/audio/entrance.mp3`),physical);
  // An additional model consumer makes the old revision broad, so dropping its
  // model entries to squeeze under the budget must be refused instead.
  await writeFile(join(root,'data/dynamic-art.json'),JSON.stringify({...dynamic,other:dynamic.url.replace(current,old)}));
  assert.throws(run,/Command failed/);
});
