import {useEffect,useId,useRef,useState} from 'react';
import SegmentedControl from '@/components/ui/SegmentedControl';
import ImportDialog from '@/components/account/ImportDialog';
import {useContentUrl} from '@/lib/content/context';
import {applicationBannerArt} from '@/lib/polls/pull-poll-art';
import {assetUrl,encodeAssetPath} from '@/lib/assets/assetUrl';
import {loadAssetImage} from '@/lib/assets/assetRetry';
import {bannerChoice,pullIntent,stampKey,STAMP_LABELS,type Stamp,type Ballot,type PollBanner,type PollPortrait,type OwnedPotentials} from '@/lib/polls/pull-poll';
import {shareOperatorInterests} from '@/lib/polls/pull-poll-share';
import {bannerTitle,VerdictStamp} from './PullPollVisuals';
import styles from './PullPoll.module.css';

/** Preview, download and clipboard share one complete bitmap, growing for longer plans. */
export default function PullPollShareImage({banners:initialBanners,ballot:initialBallot,portraits:initialPortraits,owned:initialOwned={},onClose}:{banners:PollBanner[];ballot:Ballot;portraits:Record<string,PollPortrait>;owned?:OwnedPotentials;onClose:()=>void}){
  const [{banners,ballot,portraits,owned}]=useState(()=>({banners:initialBanners,ballot:initialBallot,portraits:initialPortraits,owned:initialOwned}));
  const canvas=useRef<HTMLCanvasElement>(null),stampStyles=useRef<HTMLDivElement>(null),url=useContentUrl(),descriptionId=useId();
  const [ready,setReady]=useState(false),[message,setMessage]=useState(''),[retry,setRetry]=useState(0),[display,setDisplay]=useState('simple'),[bannerStamps,setBannerStamps]=useState(false),[detailedStamps,setDetailedStamps]=useState(false),[includeOffBanner,setIncludeOffBanner]=useState(true);
  const answered=banners.filter(b=>bannerChoice(ballot[b.id],b,owned)),detailed=display==='detailed',stamped=!detailed&&bannerStamps,artWidth=stamped?1200:600;
  const planned=(b:PollBanner)=>shareOperatorInterests(b,ballot[b.id],owned).filter(op=>!detailed||includeOffBanner||!b.returningOperators?.includes(op.name));
  const tags=stamped||(detailed&&detailedStamps);
  const description=answered.map(b=>`${bannerTitle(b)}: ${tags?STAMP_LABELS[stampKey(ballot[b.id],b,portraits,owned) as Stamp]:pullIntent(ballot[b.id])}${detailed?`; ${planned(b).map(op=>op.interest==='maybe'?`Maybe ${op.label}`:op.label).join(', ')}`:''}`).join('. ');

  useEffect(()=>{
    const element=canvas.current,body=element?.parentElement,dialog=element?.closest('dialog'),header=dialog?.querySelector('header');
    if(!element||!body||!dialog||!header)return;
    const fitPreview=()=>{
      const frame=getComputedStyle(dialog),box=getComputedStyle(body),pixels=(value:string)=>parseFloat(value)||0;
      const controls=[...body.children].filter(child=>child!==element&&getComputedStyle(child).position!=='absolute');
      const occupied=controls.reduce((total,child)=>{const style=getComputedStyle(child);return total+child.getBoundingClientRect().height+pixels(style.marginTop)+pixels(style.marginBottom);},0);
      const maximum=pixels(frame.maxHeight)||window.innerHeight-80,own=getComputedStyle(element);
      element.style.maxHeight=`${Math.max(80,maximum-header.getBoundingClientRect().height-pixels(frame.borderTopWidth)-pixels(frame.borderBottomWidth)-pixels(box.paddingTop)-pixels(box.paddingBottom)-occupied-pixels(own.marginTop)-pixels(own.marginBottom)-10)}px`;
    };
    const observer=new ResizeObserver(fitPreview);for(const child of [body,header,...body.children])if(child!==element)observer.observe(child);
    fitPreview();window.addEventListener('resize',fitPreview);
    return()=>{observer.disconnect();window.removeEventListener('resize',fitPreview);};
  },[display]);

  useEffect(()=>{
    const abort=new AbortController(),timer=window.setTimeout(()=>abort.abort(),12000);let disposed=false;
    setReady(false);setMessage('Preparing your pull plan…');
    void (async()=>{
      await Promise.race([document.fonts.ready,new Promise(resolve=>window.setTimeout(resolve,1500))]);
      const shown=answered,images=new Map<string,HTMLImageElement>();
      const artPath=(b:PollBanner)=>{const art=applicationBannerArt(b);return art?assetUrl(art.repository,art.revision,encodeAssetPath(art.path)):b.image;};
      const paths=[...new Set(shown.flatMap(b=>[artPath(b),...(detailed?planned(b).map(op=>portraits[op.name]?.icon):[])]).filter((p):p is string=>!!p))];
      await Promise.all(paths.map(async path=>{try{images.set(path,await loadAssetImage(path.startsWith('https:')?path:url(path),{crossOrigin:'anonymous',signal:abort.signal}));}catch{}}));
      if(disposed||!canvas.current)return;
      const measure=canvas.current.getContext('2d');if(!measure)return;measure.font='700 30px Rajdhani';
      const rows=shown.map(b=>{
        const art=images.get(artPath(b)??''),artHeight=art?Math.ceil((artWidth-8)*art.naturalHeight/art.naturalWidth)+8:250;
        const operators=detailed?planned(b):[];
        const slotHeight=operators.some(op=>measure.measureText(op.label).width>174)?194:166;
        return {banner:b,operators,slotHeight,rowHeight:Math.max(artHeight,operators.length?(detailedStamps?24:62)+Math.ceil(operators.length/3)*slotHeight:0)};
      });
      const headerHeight=150,footerHeight=52,height=headerHeight+rows.reduce((sum,row)=>sum+row.rowHeight,0)+footerHeight;
      canvas.current.height=height;
      const context=canvas.current.getContext('2d');if(!context)return;
      const c=context,theme=getComputedStyle(document.documentElement),ink=(token:string)=>theme.getPropertyValue(token).trim();
      const bg=ink('--bg'),panel=ink('--panel'),well=ink('--well'),text=ink('--text-bright'),dim=ink('--text-dim'),teal=ink('--teal'),amber=ink('--amber');
      const fit=(text:string,width:number)=>{let value=text;while(c.measureText(value).width>width&&value.length)value=value.slice(0,-1);return value===text?value:value.slice(0,-1)+'…';};
      const label=(textValue:string,x:number,y:number,font:string,color:string,width?:number)=>{c.font=font;c.fillStyle=color;c.fillText(width?fit(textValue,width):textValue,x,y);};
      const centeredLabel=(value:string,x:number,y:number,font:string,color:string)=>{c.save();c.textAlign='center';c.textBaseline='middle';label(value,x,y,font,color);c.restore();};
      const verdict=(value:string,x:number,y:number,size:number,color:string)=>{
        if(value==='PULL'){centeredLabel(value,x,y,`700 ${size}px Rajdhani`,color);return;}
        c.save();c.font=`700 ${value==='X'?size*.75:size}px Rajdhani`;c.fillStyle=color;c.textAlign='left';c.textBaseline='alphabetic';
        const bounds=c.measureText(value);c.fillText(value,x+(bounds.actualBoundingBoxLeft-bounds.actualBoundingBoxRight)/2,y+(bounds.actualBoundingBoxAscent-bounds.actualBoundingBoxDescent)/2);c.restore();
      };
      const draw=(path:string|null|undefined,x:number,y:number,w:number,h:number,grey=false)=>{const image=path?images.get(path):undefined;if(!image)return false;const scale=Math.min(w/image.naturalWidth,h/image.naturalHeight);c.save();if(grey){c.filter='grayscale(1)';c.globalAlpha=.45;}c.drawImage(image,x+(w-image.naturalWidth*scale)/2,y+(h-image.naturalHeight*scale)/2,image.naturalWidth*scale,image.naturalHeight*scale);c.restore();return true;};
      const drawStamp=(banner:PollBanner,y:number,rowHeight:number)=>{
        const key=stampKey(ballot[banner.id],banner,portraits,owned),element=stampStyles.current?.querySelector<HTMLElement>(`[data-stamp="${key}"]`);
        if(!key||!element)return;
        const paint=getComputedStyle(element),scale=artWidth/400,fontSize=parseFloat(paint.fontSize)*scale,font=`${paint.fontWeight} ${fontSize}px ${paint.fontFamily}`,value=STAMP_LABELS[key].toUpperCase();
        c.font=font;
        const width=c.measureText(value).width+(parseFloat(paint.paddingLeft)+parseFloat(paint.paddingRight)+parseFloat(paint.borderLeftWidth)*2)*scale;
        const h=fontSize*1.2+(parseFloat(paint.paddingTop)+parseFloat(paint.paddingBottom)+parseFloat(paint.borderTopWidth)*2)*scale;
        const matrix=new DOMMatrix(paint.transform),angle=Math.atan2(matrix.b,matrix.a),boundsW=width*Math.abs(Math.cos(angle))+h*Math.abs(Math.sin(angle)),boundsH=width*Math.abs(Math.sin(angle))+h*Math.abs(Math.cos(angle));
        c.save();c.translate(artWidth-24-boundsW/2,y+rowHeight-24-boundsH/2);c.rotate(angle);
        c.beginPath();c.roundRect(-width/2,-h/2,width,h,parseFloat(paint.borderRadius)*scale||0);
        c.fillStyle=paint.backgroundColor;c.fill();c.strokeStyle=paint.color;c.lineWidth=parseFloat(paint.borderLeftWidth)*scale;c.stroke();
        centeredLabel(value,0,0,font,paint.color);c.restore();
      };
      const danger=ink('--danger'),line=ink('--line');
      c.fillStyle=bg;c.fillRect(0,0,1200,height);
      label('ARKNIGHTS // PULL PLAN',24,72,'700 64px Rajdhani',text);
      label('arkpedia.net/polls/pull-or-skip',24,122,'28px "JetBrains Mono"',teal);
      c.lineWidth=2;c.strokeStyle=line;
      let rowTop=headerHeight;
      rows.forEach(({banner:b,operators,slotHeight,rowHeight})=>{
        const y=rowTop;rowTop+=rowHeight;
        const v=pullIntent(ballot[b.id]),choice=v==='maybe'?'~':v==='skip'?'X':'PULL',accent=v==='maybe'?amber:v==='skip'?danger:teal;
        c.fillStyle=panel;c.fillRect(0,y,1200,rowHeight);c.strokeRect(1,y,1198,rowHeight);if(!stamped){c.beginPath();c.moveTo(artWidth,y);c.lineTo(artWidth,y+rowHeight);c.stroke();}
        if(!draw(artPath(b),4,y+4,artWidth-8,rowHeight-8,v==='skip'&&tags))label(bannerTitle(b),20,y+rowHeight/2,'700 25px Rajdhani',dim,artWidth-40);
        if(stamped){drawStamp(b,y,rowHeight);return;}
        if(!detailed){verdict(choice,(artWidth+1200)/2,y+rowHeight/2,v==='pull'?80:v==='maybe'?400:Math.min(180,rowHeight*.9),accent);return;}
        if(detailedStamps)drawStamp(b,y,rowHeight);else verdict(choice,(artWidth+1200)/2,y+(operators.length?28:rowHeight/2),v==='pull'?44:v==='maybe'?(operators.length?240:400):Math.min(160,rowHeight*.9),accent);
        const cols=3,size=128;
        operators.forEach((op,j)=>{
          const slot=artWidth+24+(j%cols)*184,px=slot+24,py=y+(detailedStamps?18:56)+Math.floor(j/cols)*slotHeight;
          c.fillStyle=well;c.fillRect(px,py,size,size);if(!draw(portraits[op.name]?.icon,px,py,size,size))label(op.name.slice(0,2),px+22,py+82,'700 46px Rajdhani',dim);
          c.font='700 30px Rajdhani';
          const words=op.label.split(' ');let first=words.shift()??'';
          while(words.length&&c.measureText(first+' '+words[0]).width<=174)first+=' '+words.shift();
          const color=op.interest==='maybe'?amber:teal;
          centeredLabel(fit(first,174),px+size/2,py+148,'700 30px Rajdhani',color);
          if(words.length)centeredLabel(fit(words.join(' '),174),px+size/2,py+176,'700 30px Rajdhani',color);
        });
        if(!b.operators.length)label('Lineup still unconfirmed',artWidth+24,y+rowHeight-40,'22px Rajdhani',dim,550);
      });
      label('ARKPEDIA',24,height-16,'700 30px Rajdhani',text);
      setReady(true);setMessage(paths.some(p=>!images.has(p))?'Some artwork could not load. Your choices are still included.':`1200 × ${height} · All ${answered.length} answered banners in one image`);
    })().catch(()=>{if(!disposed)setMessage('Could not prepare your image. Please retry.');});
    return()=>{disposed=true;clearTimeout(timer);abort.abort();};
  // Rebuild for the selected image format or an explicit retry; the dialog owns this snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[retry,display,bannerStamps,detailedStamps,includeOffBanner]);
  const blob=()=>new Promise<Blob>((resolve,reject)=>canvas.current?.toBlob(value=>value?resolve(value):reject(Error('Image export is unavailable.')),'image/png'));
  async function save(copy:boolean){try{
    if(copy){if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined')throw Error('Copy image is unavailable in this browser. Download the PNG instead.');await navigator.clipboard.write([new ClipboardItem({'image/png':blob()})]);setMessage('Image copied.');}
    else{const image=await blob(),address=URL.createObjectURL(image),link=document.createElement('a');link.href=address;link.download='arkpedia-pull-plan.png';link.click();setTimeout(()=>URL.revokeObjectURL(address),1000);setMessage('PNG downloaded.');}
  }catch(e){setMessage(e instanceof Error?e.message:'Image export failed. Please try again.');}}
  return <ImportDialog title="My pull plan" className={styles.imageDialog} onClose={onClose}>
    <SegmentedControl label="Share image display" value={display} onChange={setDisplay} options={[{value:'simple',label:'Simple'},{value:'detailed',label:'Detailed'}]}/>
    {!detailed&&<label className="check"><input type="checkbox" checked={bannerStamps} onChange={e=>setBannerStamps(e.target.checked)}/>Banner art with stamps</label>}
    {detailed&&<div className={styles.imageOptions}>
      <label className="check"><input type="checkbox" checked={includeOffBanner} onChange={e=>setIncludeOffBanner(e.target.checked)}/>Include off-banner limited operators</label>
      <label className="check"><input type="checkbox" checked={detailedStamps} onChange={e=>setDetailedStamps(e.target.checked)}/>Show banner stamps</label>
    </div>}
    <div ref={stampStyles} className="visually-hidden" aria-hidden="true">{(Object.keys(STAMP_LABELS) as Stamp[]).map(value=><VerdictStamp key={value} value={value}/>)}</div>
    <canvas data-display={stamped?'stamps':detailed&&detailedStamps?'detailed-stamps':display} ref={canvas} width="1200" height="400" aria-describedby={descriptionId} className={styles.imageCanvas} role="img" aria-label={`Your pull plan share image with ${answered.length} answered banners`}/>
    <p id={descriptionId} className="visually-hidden">{description}</p>
    <div className={styles.imageActions}><span className="hint" role="status">{message}</span>
      <button className="primary btn-sm" disabled={!ready} onClick={()=>void save(false)}>Download PNG</button><button className="ghost btn-sm" disabled={!ready} onClick={()=>void save(true)}>Copy image</button><button className="ghost btn-sm" onClick={()=>setRetry(value=>value+1)}>Retry artwork</button></div>
  </ImportDialog>;
}
