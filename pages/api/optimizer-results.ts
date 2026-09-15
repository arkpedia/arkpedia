import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

function isLocalDev(): boolean {
  return process.env.NODE_ENV === 'development';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isLocalDev()) {
    return res.status(403).json({ error: 'The optimizer is only available when running locally (npm run dev).' });
  }
  const passcode = process.env.DEV_CONSOLE_PASSCODE;
  if (passcode && req.headers['x-dev-passcode'] !== passcode) {
    return res.status(401).json({ error: 'Invalid passcode' });
  }

  const filepath = path.join(process.cwd(), 'data', 'optimizer-results.json');
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    return res.status(200).json(JSON.parse(content));
  } catch (e) {
    return res.status(404).json({ error: 'No cached optimizer results yet. Run the optimizer locally first.' });
  }
}