import type {NextApiRequest,NextApiResponse} from 'next';
import {officialBroadcastSnapshot} from '@/lib/home/officialBroadcastServer';
export default async function handler(req:NextApiRequest,res:NextApiResponse) {
  res.setHeader('Cache-Control','no-store');
  if (req.method!=='GET'&&req.method!=='HEAD') {res.setHeader('Allow','GET, HEAD');return res.status(405).json({error:'Method not allowed'});}
  try {const snapshot=await officialBroadcastSnapshot();return req.method==='HEAD'?res.status(200).end():res.status(200).json(snapshot);}
  catch {return res.status(503).json({error:'Official broadcasts are temporarily unavailable'});}
}
