import {useEffect,useRef,useState} from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import {useContentUrl} from '@/lib/content/context';
import {applicationBannerArt} from '@/lib/polls/pull-poll-art';
import {assetUrl,encodeAssetPath} from '@/lib/assets/assetUrl';
import {loadAssetImage} from '@/lib/assets/assetRetry';
import {bannerChoice,STAMP_LABELS,stampKey,walletMood,type Ballot,type PollBanner,type PollPortrait} from '@/lib/polls/pull-poll';
import {bannerTitle} from './PullPollVisuals';
import styles from './PullPoll.module.css';

/** Render the same complete 16:9 bitmap for preview, download and clipboard. */
export default function PullPollShareImage({banners,ballot,portraits,onClose}:{banners:PollBanner[];ballot:Ballot;portraits:Record<string,PollPortrait>;onClose:()=>void}){
  const canvas=useRef<HTMLCanvasElement>(null),url=useContentUrl();
  const [page,setPage]=useState(0),[ready,setReady]=useState(false),[message,setMessage]=useState(''),[retry,setRetry]=useState(0);
  const answered=banners.filter(b=>bannerChoice(ballot[b.id],b)),pages=Math.max(1,Math.ceil(answered.length/6));
  useEffect(()=>{
    const abort=new AbortController(),timer=window.setTimeout(()=>abort.abort(),12000);let disposed=false;
    setReady(false);setMessage('Preparing your pull plan…');
    void (async()=>{
      await document.fonts.ready;
      const shown=answered.slice(page*6,page*6+6),images=new Map<string,HTMLImageElement>();
      const artPath=(b:PollBanner)=>{const art=applicationBannerArt(b);return art?assetUrl(art.repository,art.revision,encodeAssetPath(art.path)):b.image;};
      const paths=[...new Set(shown.flatMap(b=>[artPath(b),...b.operators.map(n=>portraits[n]?.icon)]).filter((p):p is string=>!!p))];
      await Promise.all(paths.map(async path=>{try{images.set(path,await loadAssetImage(path.startsWith('https:')?path:url(path),{crossOrigin:'anonymous',signal:abort.signal}));}catch{}}));
      if(disposed||!canvas.current)return;
      const context=canvas.current.getContext('2d');if(!context)return;
      const c=context,theme=getComputedStyle(document.documentElement),ink=(token:string)=>theme.getPropertyValue(token).trim();
      const bg=ink('--bg'),panel=ink('--panel'),well=ink('--well'),text=ink('--text-bright'),dim=ink('--text-dim'),teal=ink('--teal'),amber=ink('--amber');
      const fit=(text:string,width:number)=>{let value=text;while(c.measureText(value).width>width&&value.length)value=value.slice(0,-1);return value===text?value:value.slice(0,-1)+'…';};
      const label=(textValue:string,x:number,y:number,font:string,color:string,width?:number)=>{c.font=font;c.fillStyle=color;c.fillText(width?fit(textValue,width):textValue,x,y);};
      const draw=(path:string|null|undefined,x:number,y:number,w:number,h:number)=>{const image=path?images.get(path):undefined;if(!image)return false;const scale=Math.min(w/image.naturalWidth,h/image.naturalHeight);c.drawImage(image,x+(w-image.naturalWidth*scale)/2,y+(h-image.naturalHeight*scale)/2,image.naturalWidth*scale,image.naturalHeight*scale);return true;};
      c.fillStyle=bg;c.fillRect(0,0,1200,675);c.strokeStyle=teal;c.lineWidth=2;c.strokeRect(1,1,1198,673);
      label('RHODES ISLAND // PULL OR SKIP',42,42,'13px "JetBrains Mono"',teal);
      label('MY PULL PLAN',42,86,'700 44px Rajdhani',text);label(`${answered[0]?.start.slice(0,7)??''} – ${answered.at(-1)?.end.slice(0,7)??''} · GLOBAL`,840,83,'12px "JetBrains Mono"',dim,320);
      const rows=shown.length>3?2:1,cols=Math.min(3,Math.max(1,shown.length)),gap=16,tileW=(1116-gap*(cols-1))/cols,tileH=rows===2?236:330,startY=rows===2?116:160;
      shown.forEach((b,i)=>{
        const x=42+(i%cols)*(tileW+gap),y=startY+Math.floor(i/cols)*(tileH+14),v=bannerChoice(ballot[b.id],b),accent=v==='maybe'?amber:v==='skip'?dim:teal;
        c.fillStyle=panel;c.fillRect(x,y,tileW,tileH);c.fillStyle=accent;c.fillRect(x,y,3,tileH);
        const artH=rows===2?145:218;c.fillStyle=well;c.fillRect(x+3,y,tileW-3,artH);c.save();if(v==='skip')c.globalAlpha=.45;
        const loaded=draw(artPath(b),x+3,y,tileW-3,artH);c.restore();if(!loaded)label(bannerTitle(b),x+15,y+artH/2,'700 21px Rajdhani',dim,tileW-30);
        const stamp=stampKey(ballot[b.id],b,portraits);if(stamp){c.save();c.translate(x+tileW-17,y+artH-17);c.rotate(-.09);c.font='700 20px Rajdhani';const t=STAMP_LABELS[stamp].toUpperCase(),w=c.measureText(t).width+18;c.fillStyle=well;c.fillRect(-w,-24,w,30);c.strokeStyle=accent;c.lineWidth=2;c.strokeRect(-w,-24,w,30);label(t,-w+9,-3,'700 20px Rajdhani',accent);c.restore();}
        label(bannerTitle(b),x+13,y+artH+25,'700 19px Rajdhani',text,tileW-24);
        const size=32,max=Math.max(1,Math.floor((tileW-24)/36));b.operators.slice(0,max).forEach((name,j)=>{
          const px=x+13+j*36,py=y+artH+36,want=ballot[b.id]?.[name];c.fillStyle=well;c.fillRect(px,py,size,size);if(!draw(portraits[name]?.icon,px,py,size,size))label(name.slice(0,2),px+3,py+20,'700 14px Rajdhani',dim);
          c.fillStyle=ink(`--rarity-${portraits[name]?.rarity??6}`);c.fillRect(px,py+size-2,size,2);
          if(want!==undefined){const t=want===-1?'?':want===0?'×':`P${want}`;c.font='10px "JetBrains Mono"';const width=c.measureText(t).width+4;c.fillStyle=well;c.fillRect(px+size-width,py+size-13,width,11);label(t,px+size-width+2,py+size-4,'10px "JetBrains Mono"',want===-1?amber:want===0?dim:teal);}
        });
        if(b.operators.length>max)label(`+${b.operators.length-max}`,x+tileW-32,y+tileH-5,'11px "JetBrains Mono"',dim);
        if(!b.operators.length)label('LINEUP STILL CLASSIFIED',x+13,y+artH+55,'10px "JetBrains Mono"',dim,tileW-26);
      });
      label('ARKPEDIA',42,646,'700 22px Rajdhani',text);label(walletMood(ballot),210,644,'14px Inter',amber,510);label(`arkpedia.net/polls/pull-or-skip${pages>1?` · ${page+1}/${pages}`:''}`,735,644,'11px "JetBrains Mono"',dim,425);
      setReady(true);setMessage(paths.some(p=>!images.has(p))?'Some artwork could not load. Your choices are still included.':'1200 × 675 · Fits X, Discord and Reddit');
    })().catch(()=>{if(!disposed)setMessage('Could not prepare your image. Please retry.');});
    return()=>{disposed=true;clearTimeout(timer);abort.abort();};
  // Rebuild only for the selected export page or an explicit retry; the dialog owns this snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[page,retry]);
  const blob=()=>new Promise<Blob>((resolve,reject)=>canvas.current?.toBlob(value=>value?resolve(value):reject(Error('Image export is unavailable.')),'image/png'));
  async function save(copy:boolean){try{
    if(copy){if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined')throw Error('Copy image is unavailable in this browser. Download the PNG instead.');await navigator.clipboard.write([new ClipboardItem({'image/png':blob()})]);setMessage('Image copied.');}
    else{const image=await blob(),address=URL.createObjectURL(image),link=document.createElement('a');link.href=address;link.download=`arkpedia-pull-plan${pages>1?`-${page+1}`:''}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(address),1000);setMessage('PNG downloaded.');}
  }catch(e){setMessage(e instanceof Error?e.message:'Image export failed. Please try again.');}}
  return <ImportDialog title="My pull plan" className={styles.imageDialog} onClose={onClose}>
    <canvas ref={canvas} width="1200" height="675" className={styles.imageCanvas} role="img" aria-label={`Your pull plan share image, page ${page+1} of ${pages}`}/>
    <div className={styles.imageActions}><span className="hint" role="status">{message}</span>{pages>1&&<><button className="ghost btn-sm" disabled={page===0} onClick={()=>setPage(value=>value-1)}>Previous page</button><span className="hint">{page+1} / {pages}</span><button className="ghost btn-sm" disabled={page+1===pages} onClick={()=>setPage(value=>value+1)}>Next page</button></>}
      <button className="primary btn-sm" disabled={!ready} onClick={()=>void save(false)}>Download PNG</button><button className="ghost btn-sm" disabled={!ready} onClick={()=>void save(true)}>Copy image</button><button className="ghost btn-sm" onClick={()=>setRetry(value=>value+1)}>Retry artwork</button></div>
  </ImportDialog>;
}
