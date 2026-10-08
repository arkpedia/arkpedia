import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsePlayback, selectableAnimations, VoiceChoreography, voiceActionEnd } from '../../lib/skins/dynamicPlayback';
import { parseDynamicModel, animationButtons } from '../../lib/skins/dynamicArt';
import type { spine as Spine } from '../../lib/vendor/spine-3.8/spine-webgl';
const fixture = (n: string) => JSON.parse(fs.readFileSync(`scripts/tests/fixtures/dynamic-playback/${n}.json`, 'utf8'));

test('Haruka keeps the authored extra track and removes its standalone button', () => {
  const m = fixture('haruka'), p = parsePlayback(m.playback, m.animations)!;
  assert.deepEqual(p.extraTracks, [{ track: 2, name: 'exLayer_1' }]);
  assert.deepEqual(selectableAnimations(Object.keys(m.animations), p), ['Idle','Interact','Special']);
});
test('Exusiai exposes full voice actions and hides every mouth-only clip', () => {
  const m=fixture('exusiai'), p=parsePlayback(m.playback,m.animations)!;
  const names=selectableAnimations(Object.keys(m.animations),p);
  assert.ok(!names.some(n=>n.startsWith('Talk_')));
  assert.equal(names.filter(n=>n.startsWith('voice:')).length,8);
  assert.equal(animationButtons(names,{'voice:CN_002':'Talk 1 (CN)'}).find(x=>x.name==='voice:CN_002')?.label,'Talk 1 (CN)');
});
test('body and mouth follow separate authored clocks without restarting concurrent tracks', () => {
  const m=fixture('exusiai'), a=parsePlayback(m.playback,m.animations)!.voiceActions[0];
  const calls: {track:number;name:string;loop:boolean;entry:{mixDuration:number}}[]=[];
  const state={setAnimation(track:number,name:string,loop:boolean){const entry={mixDuration:0.3};calls.push({track,name,loop,entry});return entry;}};
  const player=new VoiceChoreography(a,state as unknown as Spine.AnimationState);
  player.apply(0);
  assert.deepEqual(calls.map(x=>[x.track,x.name,x.loop]),[[0,'Interact_1',false],[1,'Talk_2',true]]);
  player.apply(2.99);assert.equal(calls.length,2);
  player.apply(3);assert.equal(calls[2].name,'Talk_1');assert.equal(calls[2].track,1);
  player.apply(7.088480407732146);
  assert.equal(calls[3].name,'Idle');assert.equal(calls[3].entry.mixDuration,0.9115195922678536);
  // Catch up after a delayed frame: select the authored state at that instant, not old cues.
  const steps=player.apply(16.2);
  assert.equal(steps.body.name,'Interact_4');assert.equal(steps.mouth.name,'Talk_3');
  assert.ok(calls.every(x=>x.track===0||x.track===1));
  assert.ok(voiceActionEnd(a,m.animations)>=20.38848040773215);
});
test('invalid controller references, clocks and reserved tracks fail before playback',()=>{
  const m=fixture('haruka');
  for(const p of [{...m.playback,extraTracks:[{track:0,name:'Idle'}]}, {...m.playback,extraTracks:[{track:2,name:'missing'}]}, {...m.playback,voiceActions:[{id:'CN_002',body:[{name:'Idle',time:0,mix:0},{name:'Idle',time:-1,mix:0}],mouth:[]}]}])assert.throws(()=>parsePlayback(p,m.animations));
  assert.equal(parsePlayback(undefined,m.animations),null);
});
test('older assets remain readable, internal tracks stay out of the menu, and authored mixes survive',()=>{
  const m=fixture('haruka');
  const basic={schemaVersion:1,skinId:m.skinId,skeleton:{file:'skeleton.skel',format:'binary'},atlas:{file:'skeleton.atlas'},textures:[{file:'page0.webp',width:100,height:100}],premultipliedAlpha:true,animations:m.animations,bounds:{x:0,y:0,width:100,height:100}};
  assert.equal(parseDynamicModel(basic).playback,null);
  const mixed=parseDynamicModel({...basic,playback:m.playback,mixes:[{from:'Special',to:'Interact',duration:0.2}]});
  assert.equal(mixed.mixes[0].duration,0.2);
  assert.deepEqual(selectableAnimations(['Idle','Talk_1','exLayer_1'],null),['Idle']);
});
