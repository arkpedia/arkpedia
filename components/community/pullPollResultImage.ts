import type {PollBanner,PullPollResults} from '@/lib/polls/pull-poll';
import {pollPercent} from '@/lib/polls/pull-poll-share';

export function resultImageRows(banners:PollBanner[],results:PullPollResults,detailed:boolean,includeOffBanner:boolean){
  const rows=new Map(results.banners.map(row=>[row.id,row]));
  return banners.flatMap(banner=>{
    const row=rows.get(banner.id);
    if(!row?.answers)return [];
    const split=(['pull','maybe','skip'] as const).map(choice=>({
      choice,label:choice[0].toUpperCase()+choice.slice(1),fraction:row[choice]/row.answers,
      value:pollPercent(row[choice],row.answers)+'%',
    }));
    const operators=detailed?banner.operators.filter(name=>includeOffBanner||!banner.returningOperators?.includes(name)).map(name=>{
      const op=results.operators.find(entry=>entry.banner===banner.id&&entry.name===name);
      return {name,value:op?.answers?pollPercent(op.want,op.answers)+'%':'No answers'};
    }):[];
    return [{banner,answers:row.answers.toLocaleString('en-US')+(row.answers===1?' answer':' answers'),split,operators}];
  });
}

type ImageRow=ReturnType<typeof resultImageRows>[number];
type DrawPortrait=(name:string,x:number,y:number,size:number)=>void;
export const resultPanelHeight=(row:ImageRow)=>200+(row.operators.length?45+row.operators.length*57:0);

export function drawResultPanel(c:CanvasRenderingContext2D,row:ImageRow,title:string,top:number,height:number,
  colors:{text:string;dim:string;pull:string;maybe:string;skip:string},label:(value:string,x:number,y:number,font:string,color:string,width?:number)=>void,drawPortrait:DrawPortrait){
  const x=626,width=548;
  const y=top+(height-resultPanelHeight(row))/2;
  label(title,x,y+44,'700 36px Rajdhani',colors.text,width);
  label(row.answers,x,y+75,'21px "JetBrains Mono"',colors.dim);
  let barX=x;
  row.split.forEach(({choice,label:choiceLabel,value,fraction},i)=>{
    const slot=x+i*184;
    label(choiceLabel,slot,y+126,'600 26px Rajdhani',colors[choice]);
    label(value,slot,y+164,'700 38px Rajdhani',colors.text);
    c.fillStyle=colors[choice];c.fillRect(barX,y+180,width*fraction,10);barX+=width*fraction;
  });
  if(!row.operators.length)return;
  label('Want a copy',x,y+229,'600 24px Rajdhani',colors.dim);
  row.operators.forEach(({name,value},i)=>{
    const baseline=y+278+i*57;
    drawPortrait(name,x,baseline-34,46);
    label(name,x+58,baseline,'600 28px Rajdhani',colors.text,width-58-(value==='No answers'?161:88));
    c.save();c.textAlign='right';label(value,x+width,baseline,'24px "JetBrains Mono"',value==='No answers'?colors.dim:colors.pull);c.restore();
  });
}

/** Keep type at feed size, splitting a long operator list across successive cards. */
export function socialResultCards(rows:ImageRow[]){
  return rows.flatMap(row=>Array.from({length:Math.max(1,Math.ceil(row.operators.length/4))},(_,index)=>({
    ...row,operators:row.operators.slice(index*4,index*4+4),
  })));
}

export function drawSocialResult(c:CanvasRenderingContext2D,row:ImageRow,title:string,art:HTMLImageElement|undefined,
  position:string,colors:{bg:string;text:string;dim:string;pull:string;maybe:string;skip:string;panel:string},drawPortrait:DrawPortrait){
  const side=1080,inset=50,usable=side-inset*2;
  function text(value:string,x:number,y:number,size:number,color:string,mono=false,maxWidth=usable){
    c.font=mono?`500 ${size}px "JetBrains Mono"`:`700 ${size}px Rajdhani`;
    c.fillStyle=color;c.fillText(value,x,y,maxWidth);
  }
  c.fillStyle=colors.bg;c.fillRect(0,0,side,side);
  text('PULL OR SKIP',inset,82,66,colors.text);
  c.save();c.textAlign='right';text('COMMUNITY RESULTS',side-inset,76,31,colors.pull,true);c.restore();
  const artTop=111,artHeight=row.operators.length?Math.min(319,442-row.operators.length*54):470;
  c.fillStyle=colors.panel;c.fillRect(0,artTop,side,artHeight);
  if(art){
    const scale=Math.min(side/art.naturalWidth,artHeight/art.naturalHeight);
    const w=art.naturalWidth*scale,h=art.naturalHeight*scale;
    c.drawImage(art,(side-w)/2,artTop+(artHeight-h)/2,w,h);
  }else{
    text(title,inset,artTop+artHeight/2+20,62,colors.text);
  }
  const y=artTop+artHeight;
  text(title,inset,y+73,64,colors.text);
  text(row.answers,inset,y+119,36,colors.dim,true);
  let barX=inset;
  row.split.forEach(({choice,label,value,fraction},index)=>{
    const x=inset+index*usable/3;
    text(label,x,y+189,44,colors[choice]);
    text(value,x,y+277,90,colors.text);
    c.fillStyle=colors[choice];c.fillRect(barX,y+301,usable*fraction,18);barX+=usable*fraction;
  });
  if(row.operators.length){
    text('Want a copy',inset,y+375,38,colors.dim);
    row.operators.forEach(({name,value},i)=>{
      const baseline=y+435+i*68;
      drawPortrait(name,inset,baseline-45,58);
      text(name,inset+74,baseline,40,colors.text,false,usable-322);
      c.save();c.textAlign='right';text(value,side-inset,baseline,34,colors.text,true);c.restore();
    });
  }
  text('arkpedia.net/polls/pull-or-skip',inset,1043,30,colors.dim,true);
  c.save();c.textAlign='right';text(position,side-inset,1043,30,colors.dim,true);c.restore();
}
