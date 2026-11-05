export const SKIN_POLL_ID='favourite-skins-test';
export interface PollSkin { id:string; name:string; operator:string; image:string|null; aliases:string[] }
export function validBallot(value:unknown,ids:ReadonlySet<string>):value is string[]{
  return Array.isArray(value)&&value.length===5&&new Set(value).size===5&&value.every(id=>typeof id==='string'&&ids.has(id));
}
