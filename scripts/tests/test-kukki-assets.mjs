import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chibiIndex} from '../build/build-chibi-index.mjs';
import {operatorSummons} from '../build/build-operator-summons.mjs';
test('battle chibis map exact skin prefabs, including single-facing bards, and exclude dormitory models',()=>{
 const paths=['char_1/char_1_outfit/Spine/a.skel','char_1/char_1_outfit/Spine/a.atlas','char_1/char_1_outfit/Spine/a.png','char_2/build_char_2/Spine/a.skel','char_2/build_char_2/Spine/a.atlas','char_2/build_char_2/Spine/a.png'];
 const index=chibiIndex({models:{}},{tree:paths.map(path=>({path,type:'blob'}))},'a'.repeat(40),'b'.repeat(40),{charSkins:{'char_1@outfit':{charId:'char_1',battleSkin:{skinOrPrefabId:'char_1_outfit'}},'char_2@outfit':{charId:'char_2',battleSkin:{skinOrPrefabId:'build_char_2'}}}});
 assert.ok(index['char_1@outfit'].front.skeleton.includes('/'+'b'.repeat(40)+'/'));assert.equal(index['char_1@outfit'].back,undefined);assert.equal(index['char_2@outfit'],undefined);
});
test('summon generation lists concrete displayed tokens and excludes abstract aliases',()=>{
 const phase={maxLevel:1,attributesKeyFrames:[{level:1,data:{maxHp:100,atk:20,def:10,magicResistance:0,cost:5,blockCnt:1,baseAttackTime:1,respawnTime:10}}]};
 assert.deepEqual(operatorSummons({char_1:{displayTokenDict:{abstract:true,token_1:true,token_2:false}},token_1:{name:'Token',phases:[phase]},token_2:{name:'Hidden',phases:[phase]}}).char_1.map(row=>row.id),['token_1']);
});
test('all bundled chibi URLs pin public asset commits and never silently substitute another skin',()=>{
 const index=JSON.parse(fs.readFileSync('data/chibi-art.json','utf8'));
 for(const models of Object.values(index))for(const model of Object.values(models))for(const url of [model.skeleton,model.atlas,...Object.values(model.textures)])assert.match(url,/^https:\/\/raw\.githubusercontent\.com\/(?:arkpedia\/arkpedia-sd-assets|fexli\/ArknightsResource)\/[a-f0-9]{40}\//);
 assert.ok(index['char_1012_skadi2@iteration#2'].front.skeleton.includes('iteration_2'));
});
