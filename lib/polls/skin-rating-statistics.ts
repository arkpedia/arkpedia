import type {PollSkin} from './skin-poll';
import type {SkinRatingAggregate} from './skin-ratings';

export interface RatingStatistics {
  n:number;mean:number;median:number;q1:number;q3:number;p5:number;p95:number;min:number;max:number;deviation:number;modes:number[];
}
export interface SkinRatingRow {
  id:string;name:string;operator:string;image:string|null;total:number;ratings:number;rank:number;histogram:number[]|null;stats:RatingStatistics|null;
}

/** Public score buckets only; no account identities leave the aggregate query. */
export function aggregateRatingBuckets(buckets:{skin:string;rating:number;ratings:number}[]):SkinRatingAggregate[]{
  const rows=new Map<string,SkinRatingAggregate>();
  for(const bucket of buckets){
    const row=rows.get(bucket.skin)??{skin:bucket.skin,total:0,ratings:0,histogram:Array(10).fill(0)};
    row.total+=bucket.rating*bucket.ratings;row.ratings+=bucket.ratings;row.histogram![bucket.rating-1]+=bucket.ratings;rows.set(bucket.skin,row);
  }
  return [...rows.values()];
}

/** Linear interpolation at (n-1)*p, without expanding counts into individual votes. */
export function ratingStatistics(histogram:readonly number[]):RatingStatistics|null{
  if(histogram.length!==10||histogram.some(n=>!Number.isSafeInteger(n)||n<0))return null;
  const n=histogram.reduce((sum,count)=>sum+count,0);if(!n)return null;
  const at=(index:number)=>{let cumulative=0;for(let i=0;i<10;i++){cumulative+=histogram[i];if(index<cumulative)return i+1;}return 10;};
  const quantile=(p:number)=>{const index=(n-1)*p,low=at(Math.floor(index)),high=at(Math.ceil(index));return low+(high-low)*(index-Math.floor(index));};
  const mean=histogram.reduce((sum,count,i)=>sum+count*(i+1),0)/n,maxCount=Math.max(...histogram);
  return {n,mean,median:quantile(.5),q1:quantile(.25),q3:quantile(.75),p5:quantile(.05),p95:quantile(.95),min:at(0),max:at(n-1),
    deviation:Math.sqrt(histogram.reduce((sum,count,i)=>sum+count*(i+1-mean)**2,0)/n),modes:histogram.flatMap((count,i)=>count===maxCount?[i+1]:[])};
}

export function skinRatingRows(scores:SkinRatingAggregate[],skins:PollSkin[],group:string):SkinRatingRow[]{
  const catalogue=new Map(skins.map(skin=>[skin.id,skin])),rows=new Map<string,Omit<SkinRatingRow,'rank'|'stats'>>();
  for(const score of scores){
    const skin=catalogue.get(score.skin);if(!skin||score.ratings<=0)continue;const key=group==='operators'?skin.operator:skin.id;
    const row=rows.get(key)??{id:key,name:group==='operators'?skin.operator:skin.name,operator:skin.operator,image:skin.image,total:0,ratings:0,histogram:Array(10).fill(0)};
    row.total+=score.total;row.ratings+=score.ratings;
    if(!score.histogram||!ratingStatistics(score.histogram)||score.histogram.reduce((sum,count)=>sum+count,0)!==score.ratings||score.histogram.reduce((sum,count,i)=>sum+count*(i+1),0)!==score.total)row.histogram=null;
    else if(row.histogram)score.histogram.forEach((count,i)=>{row.histogram![i]+=count;});
    rows.set(key,row);
  }
  const ordered=[...rows.values()].sort((a,b)=>b.total/b.ratings-a.total/a.ratings||b.ratings-a.ratings||a.name.localeCompare(b.name));let rank=1;
  return ordered.map((row,i)=>{if(!i||row.total*ordered[i-1].ratings!==ordered[i-1].total*row.ratings)rank=i+1;return {...row,rank,stats:row.histogram?ratingStatistics(row.histogram):null};});
}
