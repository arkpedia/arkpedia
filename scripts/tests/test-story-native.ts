import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseNativeStory, nativeScriptUrl } from '../../lib/story/nativeStory';
// @ts-expect-error Plain JavaScript pipeline module.
import { nativeStoryGroups, nativeStoryEntries } from '../lib/native-story.mjs';
// @ts-expect-error Plain JavaScript pipeline module.
import { importNativeStories } from '../imports/import-story-native.mjs';
// @ts-expect-error Plain JavaScript reader adapter.
import { timoLibrary } from '../lib/timo-library.mjs';
const revision = 'a'.repeat(40);
const review = JSON.parse(fs.readFileSync('scripts/tests/fixtures/story-monster-hunter.json','utf8'));

test('the real Monster Hunter event is discovered automatically after release, with all 18 game sections', () => {
  const groups = nativeStoryGroups(review,[],revision,Date.parse('2026-11-17'));
  assert.equal(groups.act50side.title,'Thunder in the Azure Dream');
  assert.equal(groups.act50side.sections.length,18);
  assert.equal(nativeStoryEntries(groups)[0].url,'/story/read?chapter=act50side');
  assert.deepEqual(nativeStoryGroups(review,[],revision,Date.parse('2026-11-15')),{});
  assert.deepEqual(nativeStoryGroups(review,[{id:'act50side'}],revision,Date.parse('2026-11-17')),{},'Timo remains authoritative once it has the event');
  assert.throws(()=>nativeScriptUrl(revision,'activities/../private'),/Invalid/);
  assert.throws(()=>nativeScriptUrl('master','activities/act50side/story'),/Invalid/);
});

test('text rendering preserves speakers, narration, subtitles and alternate choices without running commands or HTML', () => {
  const rows = parseNativeStory('[HEADER()]\n[PlayMusic(key="secret")]\n[name="Orchid"]<color=#fff>Hello {nickname}.</color>\nA plain line.\n[Subtitle(text="Across the desert")]\n[Decision(options="Yes;No", values="1;2")]\n[Predicate(references="2")]\n[name="Doctor"]<script>alert(1)</script>');
  assert.deepEqual(rows.slice(0,3),[{speaker:'Orchid',text:'Hello Doctor.',kind:'dialogue'},{text:'A plain line.',kind:'narration'},{text:'Across the desert',kind:'narration'}]);
  assert.equal(rows[3].text,'1. Yes\n2. No');
  assert.equal(rows[4].text,'Choice: No');
  assert.equal(rows[5].text,'<script>alert(1)</script>','React renders this as escaped text, never innerHTML');
});

test('reader outage keeps old indices and publishes verified new scripts; a dual outage changes no files', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'story-native-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'data'));fs.mkdirSync(path.join(root,'en/en/gamedata/excel'),{recursive:true});
  const entries=Array.from({length:400},(_,i)=>({id:`old_${i}`,category:'side',title:`Old ${i}`,url:`https://arknights.timo.beer/story.html#side&old_${i}&0`}));
  const chapters={old_0:[[9,'AA','Keep the real reader index','before']]};
  fs.writeFileSync(path.join(root,'data/story-library.json'),JSON.stringify({entries}));
  fs.writeFileSync(path.join(root,'data/story-chapters.json'),JSON.stringify({chapters}));
  const table={...review,main_fixture:{entryType:'MAINLINE'},mini_fixture:{entryType:'MINI_ACTIVITY'},...Object.fromEntries(Array.from({length:100},(_,i)=>[`record_${i}`,{entryType:'NONE'}]))};
  fs.writeFileSync(path.join(root,'en/en/gamedata/excel/story_review_table.json'),JSON.stringify(table));
  const result=await importNativeStories({root,en:path.join(root,'en'),revision,now:Date.parse('2026-11-17'),fetcher:async(url:string)=>new Response(url.includes('catalog.en')?'down':'[name="Orchid"]A real readable line.',{status:url.includes('catalog.en')?403:200})});
  assert.equal(result.entries.length,401);
  assert.deepEqual(result.chapters,chapters);
  assert.equal(result.native.act50side.sections.length,18);
  const saved=fs.readFileSync(path.join(root,'data/story-library.json'),'utf8');
  fs.unlinkSync(path.join(root,'en/en/gamedata/excel/story_review_table.json'));
  await assert.rejects(importNativeStories({root,en:path.join(root,'en'),revision,fetcher:async()=>new Response('down',{status:503})}),/English story tables/);
  assert.equal(fs.readFileSync(path.join(root,'data/story-library.json'),'utf8'),saved);
});

test('a recovered external catalogue retires the fallback entry without deleting issued native bookmarks', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'story-handoff-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'data'));fs.mkdirSync(path.join(root,'en/en/gamedata/excel'),{recursive:true});
  const previous=nativeStoryGroups(review,[],revision,Date.parse('2026-11-17'));
  fs.writeFileSync(path.join(root,'data/story-native.json'),JSON.stringify({chapters:previous}));
  const row={storyTxt:'obt/test',storyName:'Part'};
  const catalog={review:{...Object.fromEntries(Array.from({length:400},(_,i)=>[`old_${i}`,{name:`Old ${i}`,entryType:'ACTIVITY',infoUnlockDatas:[row]}])),...review,main_0:{name:'Main',infoUnlockDatas:[row]},mini:{name:'Mini',entryType:'MINI_ACTIVITY',infoUnlockDatas:[row]},story_op_set_1:{name:'Op',infoUnlockDatas:[row]}},ops:{char_1_op:['Op']},equip:{charEquip:{char_1_op:['base','module']},equipDict:{module:{charId:'char_1_op',uniEquipName:'Module'}}},rogue:{},sandbox:{basicInfo:{sandbox_1:{topicName:'RA'}}},extras:{extra:{name:'Extra',scripts:[{txt:'obt/extra'}]}}};
  const recovered = timoLibrary(catalog);
  fs.writeFileSync(path.join(root,'data/story-library.json'),JSON.stringify({entries:recovered.entries}));
  fs.writeFileSync(path.join(root,'data/story-chapters.json'),JSON.stringify({chapters:recovered.chapters}));
  fs.writeFileSync(path.join(root,'en/en/gamedata/excel/story_review_table.json'),JSON.stringify({...review,main_fixture:{entryType:'MAINLINE'},mini_fixture:{entryType:'MINI_ACTIVITY'},...Object.fromEntries(Array.from({length:100},(_,i)=>[`record_${i}`,{entryType:'NONE'}]))}));
  const result=await importNativeStories({root,en:path.join(root,'en'),revision,now:Date.parse('2026-11-17'),fetcher:()=>{throw Error('No script fetch is needed once Timo owns the group');}});
  assert(result.entries.some((e:{id:string})=>e.id==='act50side'));
  assert(!result.entries.some((e:{id:string})=>e.id==='native_act50side'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'data/story-native.json'),'utf8')).chapters.act50side.revision,revision);
  assert.equal(result.chapters.act50side[0][0],0,'real Timo indices start at their own zero, not the native game order');
});
