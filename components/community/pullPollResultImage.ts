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
export const resultPanelHeight=(row:ImageRow)=>200+(row.operators.length?45+row.operators.length*38:0);

export function drawResultPanel(c:CanvasRenderingContext2D,row:ImageRow,title:string,top:number,height:number,
  colors:{text:string;dim:string;pull:string;maybe:string;skip:string},label:(value:string,x:number,y:number,font:string,color:string,width?:number)=>void){
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
    const baseline=y+265+i*38;
    label(name,x,baseline,'600 28px Rajdhani',colors.text,width-(value==='No answers'?161:88));
    c.save();c.textAlign='right';label(value,x+width,baseline,'24px "JetBrains Mono"',value==='No answers'?colors.dim:colors.pull);c.restore();
  });
}
