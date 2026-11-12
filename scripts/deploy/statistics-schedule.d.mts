export function statisticsRefreshToken(secret:string,server:string,time?:number):Promise<string>;
export function verifyStatisticsRefreshToken(secret:string,server:string,token:unknown,time?:number):Promise<boolean>;
export function refreshDailyStatistics(env:{ARKPEDIA_DEPLOYMENT_ROLE?:string;ARKPEDIA_AUTH_URL?:string;BETTER_AUTH_SECRET?:string;WORKER_SELF_REFERENCE?:{fetch(request:Request):Promise<Response>}}):Promise<void>;
