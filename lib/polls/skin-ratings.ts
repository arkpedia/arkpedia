export const SKIN_RATING_POLL_ID='drip-awards-ratings-test';
export interface SavedSkinRating {skin:string;rating:number|null;revision:number}
export interface SkinRatingAggregate {skin:string;total:number;ratings:number;histogram?:number[]}
export interface SkinRatingResult {version:2;raters:number;ratings:number;ranking:SkinRatingAggregate[];mine?:SavedSkinRating[]}
export const validSkinRating=(value:unknown):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>=1&&value<=10;
