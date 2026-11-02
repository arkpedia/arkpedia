import type { NextApiRequest, NextApiResponse } from 'next';
import { accountsEnv, type AccountsEnv } from '@/lib/cloud-account/server';
import { acquireReplayPermit } from '@/lib/replays/pacing-server';

export const config={api:{bodyParser:{sizeLimit:'1kb'}}};
export function createPermitHandler(environment:()=>AccountsEnv|null=accountsEnv){
  return async(req:NextApiRequest,res:NextApiResponse)=>{
    res.setHeader('Cache-Control','private, no-store');
    if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Use POST.'});}
    const env=environment();
    if(!env)return res.status(503).json({error:'Downloads are temporarily unavailable.'});
    if(req.headers.origin!==env.ARKPEDIA_AUTH_URL)return res.status(403).json({error:'Use this site to start downloads.'});
    const body=req.body;
    if(!req.headers['content-type']?.startsWith('application/json')||!body||typeof body!=='object'||Array.isArray(body)||
      Object.keys(body).length!==1||typeof body.client!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(body.client)){
      return res.status(400).json({error:'Invalid download request.'});
    }
    try{return res.status(200).json({granted:await acquireReplayPermit(env.ARKPEDIA_ACCOUNTS_DB,body.client)});}
    catch{return res.status(503).json({error:'Downloads are temporarily unavailable. Your saved data is unchanged.'});}
  };
}
export default createPermitHandler();
