import { chibiBodyBounds } from '../lib/operators/chibiFrame';
import fs from 'node:fs';
import path from 'node:path';
import { spine } from '../lib/vendor/spine-3.8/spine-webgl';
import { chibiAtlas } from '../lib/operators/chibiAtlas';
const root = path.resolve(process.argv[2] ?? '../arkpedia-sd-assets');
let checked = 0, failed = 0;
const models = JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8')).models;
for (const [key,m] of Object.entries(models) as [string,any][]) {
 if (!key.endsWith('/walk')) continue;
 try {
 const atlas=chibiAtlas(spine,fs.readFileSync(path.join(root,m.atlas.path),'utf8'),()=>({getImage:()=>({width:2048,height:2048}),setFilters(){},setWraps(){},dispose(){}} as any));
 const data=new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(fs.readFileSync(path.join(root,m.skeleton.path))));
 const s=new spine.Skeleton(data), state=new spine.AnimationState(new spine.AnimationStateData(data));
 const measure=(name:string)=>{s.setToSetupPose();state.setAnimation(0,name,true);state.update(.1);state.apply(s);s.updateWorldTransform();s.drawOrder=s.slots.filter(slot=>slot.color.a>=.01);const p=new spine.Vector2(),z=new spine.Vector2();s.getBounds(p,z,[]);return {x:z.x,y:z.y};};
 const initial=data.animations.find(a=>a.name==='Idle')??data.animations[0];
 const full=measure(initial.name);
 const parts=s.drawOrder.map(slot=>{s.drawOrder=[slot];const p=new spine.Vector2(),z=new spine.Vector2();s.getBounds(p,z,[]);return {left:p.x,bottom:p.y,right:p.x+z.x,top:p.y+z.y};});
 const body=chibiBodyBounds(parts); checked++;
 if(body){const ratio=Math.max(full.x/(body.right-body.left),full.y/(body.top-body.bottom));if(ratio>1.1)console.log(JSON.stringify({key,ratio,full,body}));}
 }catch(e){failed++; console.error(key,String(e));}
}

console.error(`Checked ${checked} walking models; ${failed} unreadable`);
process.exitCode = failed ? 1 : 0;
